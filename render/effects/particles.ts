// Wind particles: the movement and the shape of the streaks, with no drawing
// code, so it runs in unit tests.
//
// Each particle lives a few seconds in world (mercator) coordinates, so the
// streaks stay put on the land while the map is moved or tilted. The wind
// moves it; a short trail of its recent positions is the streak. Direction is
// the streak's heading (bright head, fading tail). Magnitude is carried three
// ways at once: faster movement, a longer streak (the trail is a fixed span of
// time), and a stronger, thicker line.
//
// Everything lives in typed arrays sized once: nothing is allocated per frame.

/** Gives the wind (km/h, east and north) at a mercator position. */
export type WindFn = (x: number, y: number, out: Float32Array) => void;

/** Metres of ground height at a mercator position. */
export type GroundFn = (x: number, y: number) => number;

/**
 * How the sim sees the screen. Particles are kept evenly spread over what is
 * on screen, whatever the zoom or tilt: one that leaves the screen, or sits in
 * a crowded patch, is moved to a sparser part of the screen.
 */
export interface ParticleView {
  /** Column-major matrix from mercator position (x, y, z in mercator units) to clip space. */
  matrix: ArrayLike<number>;
  /** The top of the usable screen in clip space (-1 to 1; above it is sky or too far to matter). */
  topNdcY: number;
  /** A mercator position under a random point of the usable screen. */
  spawn(out: Float64Array): void;
}

export interface ParticleLook {
  /** Particles drawn (up to the sim's maximum). */
  count: number;
  /** Seconds of travel the streak spans. */
  trailSeconds: number;
  /** Screen pixels per second a 1 km/h wind moves a particle at the map's current zoom (before `speedScale`). */
  pxPerKmh: number;
  /** User speed multiplier. */
  speedScale: number;
  /** Metres above the ground the streaks fly. */
  clearance: number;
  /** Line width in CSS pixels at a moderate wind. */
  widthPx: number;
  /** 0 to 1 overall opacity. */
  brightness: number;
}

/** Streak points kept per particle, including the head. */
export const TRAIL_POINTS = 9;
/** Floats per vertex written for drawing: position (3), the other end (3), side, alpha, width. */
export const VERTEX_FLOATS = 9;
/** Vertices per segment (a quad). */
export const VERTS_PER_SEGMENT = 4;
/** Wind speed (km/h) at which the line reaches full strength. */
export const FULL_KMH = 60;

/** Screen cells (across, down) used to keep the spread even. */
const CELLS_X = 8;
const CELLS_Y = 14;
/** A cell may hold this many times the average before its extras are moved. */
const CROWD = 1.5;
/** Chance per frame that an extra particle in a crowded cell is moved. */
const MOVE_CHANCE = 0.25;
/** Past the screen's edge by this much (clip units) a particle counts as off screen. */
const EDGE = 0.02;

const MIN_LIFE = 2.5;
const MAX_LIFE = 5;

export class ParticleSim {
  readonly max: number;
  private x: Float64Array;
  private y: Float64Array;
  private age: Float32Array;
  private life: Float32Array;
  private speed: Float32Array;
  private lift: Float32Array;
  /** Trail ring per particle: x, y, z (mercator z units) per slot, newest at `head`. */
  private tx: Float64Array;
  private ty: Float64Array;
  private tz: Float32Array;
  private head: Uint8Array;
  private filled: Uint8Array;
  private sinceRecord = 0;
  private wind = new Float32Array(2);
  private spot = new Float64Array(2);
  /** Particles per screen cell, for thinning crowded patches. */
  private cells = new Uint16Array(CELLS_X * CELLS_Y);
  /** Metres per mercator unit at the view's latitude, for turning heights into z. */
  private metresPerUnit = 1;
  private seed = 0x9e3779b9;

  constructor(max: number) {
    this.max = max;
    this.x = new Float64Array(max);
    this.y = new Float64Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.speed = new Float32Array(max);
    this.lift = new Float32Array(max);
    this.tx = new Float64Array(max * TRAIL_POINTS);
    this.ty = new Float64Array(max * TRAIL_POINTS);
    this.tz = new Float32Array(max * TRAIL_POINTS);
    this.head = new Uint8Array(max);
    this.filled = new Uint8Array(max);
    // All start expired, so they spawn on the first step.
    this.age.fill(1e6);
  }

  /** A small seeded random generator: tests are repeatable, and nothing is allocated. */
  private rand(): number {
    this.seed ^= this.seed << 13; this.seed >>>= 0;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5; this.seed >>>= 0;
    return this.seed / 4294967296;
  }

  /** The scale (metres per mercator unit) where the view is. */
  setView(metresPerUnit: number): void {
    this.metresPerUnit = metresPerUnit;
  }

  /** Put particle `i` at a fresh spot on the screen: of a few tries, the one in the emptiest cell. */
  private spawn(i: number, view: ParticleView, stagger: boolean, ground: GroundFn, look: ParticleLook): void {
    let best = -1, bx = 0, by = 0;
    for (let t = 0; t < 3; t++) {
      view.spawn(this.spot);
      const c = this.cellOf(view, this.spot[0]!, this.spot[1]!, ground, look);
      const load = c < 0 ? 1e9 : this.cells[c]!;
      if (best < 0 || load < best) { best = load; bx = this.spot[0]!; by = this.spot[1]!; }
    }
    this.x[i] = bx;
    this.y[i] = by;
    this.life[i] = MIN_LIFE + this.rand() * (MAX_LIFE - MIN_LIFE);
    this.age[i] = stagger ? this.rand() * this.life[i]! : 0;
    this.lift[i] = 0.5 + this.rand();
    this.filled[i] = 0;
    this.head[i] = 0;
  }

  /** The screen cell a mercator position falls in (and flying height there), or -1 when off screen. */
  private cellOf(view: ParticleView, x: number, y: number, ground: GroundFn, look: ParticleLook): number {
    const m = view.matrix;
    const z = (ground(x, y) + look.clearance) / this.metresPerUnit;
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (!(w > 0)) return -1;
    const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
    const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
    if (nx < -1 + EDGE || nx > 1 - EDGE || ny < -1 + EDGE || ny > view.topNdcY - EDGE) return -1;
    const cx = Math.min(CELLS_X - 1, Math.floor(((nx + 1) / 2) * CELLS_X));
    const cy = Math.min(CELLS_Y - 1, Math.floor(((ny + 1) / (view.topNdcY + 1)) * CELLS_Y));
    return cy * CELLS_X + cx;
  }

  /** Move every active particle by `dt` seconds. */
  step(dt: number, look: ParticleLook, wind: WindFn, ground: GroundFn, unitsPerPx: number, view: ParticleView): void {
    const n = Math.min(look.count, this.max);
    this.sinceRecord += dt;
    const record = this.sinceRecord >= look.trailSeconds / (TRAIL_POINTS - 1);
    if (record) this.sinceRecord = 0;
    const k = look.pxPerKmh * look.speedScale * unitsPerPx;
    // Where everyone is on screen now. Old or off-screen particles are moved first.
    this.cells.fill(0);
    for (let i = 0; i < n; i++) {
      const fresh = this.age[i] === 1e6;
      let c = fresh ? -1 : this.cellOf(view, this.x[i]!, this.y[i]!, ground, look);
      if (fresh || this.age[i]! >= this.life[i]! || c < 0) {
        this.spawn(i, view, fresh, ground, look);
        this.record(i, look, ground);
        c = this.cellOf(view, this.x[i]!, this.y[i]!, ground, look);
      }
      if (c >= 0) this.cells[c]!++;
    }
    // Thin crowded patches (after zooming out, or looking across a ridge): extras are moved to emptier places.
    const limit = (n / (CELLS_X * CELLS_Y)) * CROWD + 1;
    for (let i = 0; i < n; i++) {
      const c = this.cellOf(view, this.x[i]!, this.y[i]!, ground, look);
      if (c >= 0 && this.cells[c]! > limit && this.rand() < MOVE_CHANCE) {
        this.cells[c]!--;
        this.spawn(i, view, false, ground, look);
        this.record(i, look, ground);
        const c2 = this.cellOf(view, this.x[i]!, this.y[i]!, ground, look);
        if (c2 >= 0) this.cells[c2]!++;
      }
    }
    for (let i = 0; i < n; i++) {
      wind(this.x[i]!, this.y[i]!, this.wind);
      const u = this.wind[0]!, v = this.wind[1]!;
      this.speed[i] = Math.hypot(u, v);
      // East is +x; north is -y in mercator.
      this.x[i]! += u * k * dt;
      this.y[i]! -= v * k * dt;
      this.age[i]! += dt;
      if (record) this.record(i, look, ground);
    }
  }

  private record(i: number, look: ParticleLook, ground: GroundFn): void {
    const h = (this.head[i]! + 1) % TRAIL_POINTS;
    this.head[i] = h;
    if (this.filled[i]! < TRAIL_POINTS) this.filled[i]!++;
    const o = i * TRAIL_POINTS + h;
    this.tx[o] = this.x[i]!;
    this.ty[o] = this.y[i]!;
    this.tz[o] = (ground(this.x[i]!, this.y[i]!) + look.clearance * this.lift[i]!) / this.metresPerUnit;
  }

  /**
   * Write the streaks as quads (see VERTEX_FLOATS). The head is the live
   * position; older points follow in the trail. Returns the vertices written.
   */
  write(out: Float32Array, look: ParticleLook, ground: GroundFn): number {
    const n = Math.min(look.count, this.max);
    let v = 0;
    const mpu = this.metresPerUnit;
    for (let i = 0; i < n; i++) {
      const life = this.life[i]!, age = this.age[i]!;
      if (age >= life) continue;
      const fadeLife = Math.min(1, age / 0.5, (life - age) / 0.8);
      const strength = Math.min(1, this.speed[i]! / FULL_KMH);
      const headAlpha = look.brightness * fadeLife * (0.4 + 0.6 * strength);
      const w = 0.65 + 0.7 * strength;
      const count = this.filled[i]!;
      if (headAlpha <= 0.01 || count < 1) continue;
      // Points, newest first: the live head, then the ring from its newest slot back.
      const px = (k: number) => (k === 0 ? this.x[i]! : this.tx[i * TRAIL_POINTS + ((this.head[i]! - (k - 1) + TRAIL_POINTS * 2) % TRAIL_POINTS)]!);
      const py = (k: number) => (k === 0 ? this.y[i]! : this.ty[i * TRAIL_POINTS + ((this.head[i]! - (k - 1) + TRAIL_POINTS * 2) % TRAIL_POINTS)]!);
      const pz = (k: number) => (k === 0
        ? (ground(this.x[i]!, this.y[i]!) + look.clearance * this.lift[i]!) / mpu
        : this.tz[i * TRAIL_POINTS + ((this.head[i]! - (k - 1) + TRAIL_POINTS * 2) % TRAIL_POINTS)]!);
      const segs = Math.min(count, TRAIL_POINTS - 1);
      for (let s = 0; s < segs; s++) {
        const aFade = headAlpha * Math.pow(1 - s / segs, 1.3), bFade = headAlpha * Math.pow(1 - (s + 1) / segs, 1.3);
        const aW = w * (1 - 0.55 * (s / segs)), bW = w * (1 - 0.55 * ((s + 1) / segs));
        const ax = px(s), ay = py(s), az = pz(s), bx = px(s + 1), by = py(s + 1), bz = pz(s + 1);
        v = putVertex(out, v, ax, ay, az, bx, by, bz, -1, aFade, aW);
        v = putVertex(out, v, ax, ay, az, bx, by, bz, 1, aFade, aW);
        v = putVertex(out, v, bx, by, bz, ax, ay, az, 1, bFade, bW);
        v = putVertex(out, v, bx, by, bz, ax, ay, az, -1, bFade, bW);
      }
    }
    return v;
  }

  /** Most vertices `write` can produce. */
  get maxVertices(): number {
    return this.max * (TRAIL_POINTS - 1) * VERTS_PER_SEGMENT;
  }

  /** Test helpers. */
  position(i: number): [number, number] {
    return [this.x[i]!, this.y[i]!];
  }
}

function putVertex(out: Float32Array, v: number, x: number, y: number, z: number, ox: number, oy: number, oz: number, side: number, alpha: number, width: number): number {
  const o = v * VERTEX_FLOATS;
  out[o] = x; out[o + 1] = y; out[o + 2] = z;
  out[o + 3] = ox; out[o + 4] = oy; out[o + 5] = oz;
  out[o + 6] = side; out[o + 7] = alpha; out[o + 8] = width;
  return v + 1;
}
