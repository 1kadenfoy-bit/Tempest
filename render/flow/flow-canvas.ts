// The wind's flow on the map (v8 24-WindHome): particles carried by the wind
// at the terrain, each trailing a short fading tail, or still arrows when the
// animation is off.
//
// A plain 2D canvas over the map, in screen pixels. The wind arrives as a
// coarse grid of east and north parts (km/h) over the screen; particles move
// through it and live a few seconds. Kept cheap for phones: a fixed number of
// particles in typed arrays (nothing allocated per frame), each keeping only
// its last few positions, all drawn in one stroke per brightness level. No
// full-screen fading buffer, so nothing smears and nothing ghosts. The
// animation stops whenever the page is hidden, the map is moving, or the
// layer is not shown, and draws nothing when still.

export interface FlowField {
  /** Screen size the grid covers (CSS pixels). */
  width: number;
  height: number;
  /** Grid columns and rows; cell (c, r) sits at (c + 0.5, r + 0.5) × step. */
  cols: number;
  rows: number;
  step: number;
  /** East and north parts (km/h), row-major from the top; NaN where unknown. */
  u: Float32Array;
  v: Float32Array;
}

export type FlowMode = 'flow' | 'arrows' | 'off';

/** Screen pixels per second for each km/h. */
const PX_PER_KMH = 2.2;
/** One particle per this many square pixels (about 400 on a phone). */
const DENSITY = 800;
/** Positions kept per particle for its tail; one is kept every TRAIL_EVERY frames (about half a second). */
const TRAIL = 10;
const TRAIL_EVERY = 3;
/** Brightness levels: tails fade towards their end, and particles fade in and out over their life. */
const LEVELS = 5;

export class FlowCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private field: FlowField | null = null;
  /** Particles: tail positions (ring of TRAIL per particle), how many are filled, newest slot, age and life. */
  private n = 0;
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);
  private filled = new Uint8Array(0);
  private head = new Uint8Array(0);
  private age = new Float32Array(0);
  private life = new Float32Array(0);
  private frameNo = 0;
  private frame = 0;
  private last = 0;
  private mode: FlowMode = 'off';
  private shown = false;
  private moving = false;
  private dpr = 1;
  /** Frame times (ms) of the last few seconds, for the frame rate check. */
  readonly frameTimes: number[] = [];
  /** Time spent drawing each of those frames (ms). */
  readonly workTimes: number[] = [];

  /** `container` holds the canvas; `sizeOf` gives its size (the map's own element). */
  constructor(container: HTMLElement, private sizeOf: HTMLElement = container) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flow-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    document.addEventListener('visibilitychange', () => this.sync());
    this.resize();
  }

  private resize() {
    // Two device pixels per CSS pixel at most: sharper costs battery for little gain.
    this.dpr = Math.min(2, devicePixelRatio || 1);
    const r = this.sizeOf.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
  }

  /** Show or hide (the wind layer is active or not). */
  setShown(shown: boolean) { this.shown = shown; this.sync(); }
  /** The map changed size. */
  resized() { this.resize(); this.sync(); }
  setMode(mode: FlowMode) { this.mode = mode; this.sync(); }
  /** The map is being dragged or zoomed: the particles would slide wrongly, so they wait. */
  setMoving(moving: boolean) { this.moving = moving; this.sync(); }

  setField(f: FlowField | null) {
    this.field = f;
    this.n = 0;
    this.sync();
  }

  private running() { return this.shown && this.mode === 'flow' && !this.moving && !document.hidden && !!this.field; }

  private sync() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.clear();
    if (!this.shown || this.moving || !this.field) return;
    if (this.mode === 'arrows') { this.drawArrows(); return; }
    if (this.running()) { this.last = -1; this.frame = requestAnimationFrame((t) => this.tick(t)); }
  }

  private clear() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  /** Wind at a screen point (bilinear between grid cells), or null outside the grid or where unknown. */
  private sample(x: number, y: number): [number, number] | null {
    const f = this.field!;
    const gx = x / f.step - 0.5, gy = y / f.step - 0.5;
    const c0 = Math.max(0, Math.min(f.cols - 2, Math.floor(gx))), r0 = Math.max(0, Math.min(f.rows - 2, Math.floor(gy)));
    const wx = Math.max(0, Math.min(1, gx - c0)), wy = Math.max(0, Math.min(1, gy - r0));
    const i = r0 * f.cols + c0;
    const lerp = (a: Float32Array) => (a[i]! * (1 - wx) + a[i + 1]! * wx) * (1 - wy) + (a[i + f.cols]! * (1 - wx) + a[i + f.cols + 1]! * wx) * wy;
    const u = lerp(f.u), v = lerp(f.v);
    return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null;
  }

  /** Start particle i at a random place; at the start ages are spread, so they don't all appear at once. */
  private spawn(i: number, f: FlowField, fresh: boolean) {
    this.head[i] = 0;
    this.filled[i] = 1;
    this.xs[i * TRAIL] = Math.random() * f.width;
    this.ys[i * TRAIL] = Math.random() * f.height;
    this.life[i] = 3000 + Math.random() * 3000;
    this.age[i] = fresh ? Math.random() * this.life[i]! : 0;
  }

  private allocate(f: FlowField) {
    const n = Math.round((f.width * f.height) / DENSITY);
    this.n = n;
    this.xs = new Float32Array(n * TRAIL);
    this.ys = new Float32Array(n * TRAIL);
    this.filled = new Uint8Array(n);
    this.head = new Uint8Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) this.spawn(i, f, true);
  }

  private tick(now: number) {
    if (!this.running()) return;
    // At most about 60 a second: 120 Hz screens would double the work for no visible gain.
    // The first frame after a start draws at once, with no time step.
    if (this.last < 0) this.last = now;
    else if (now - this.last < 15) { this.frame = requestAnimationFrame((t) => this.tick(t)); return; }
    const f = this.field!;
    // The first frame's time can be a little before the start: never step backwards.
    const dt = Math.max(0, Math.min(100, now - this.last));
    this.last = now;
    const began = performance.now();
    this.frameTimes.push(now);
    while (this.frameTimes.length && this.frameTimes[0]! < now - 5000) { this.frameTimes.shift(); this.workTimes.shift(); }
    if (!this.n) this.allocate(f);
    const keep = ++this.frameNo % TRAIL_EVERY === 0;
    const step = (PX_PER_KMH * dt) / 1000;
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    for (let i = 0; i < this.n; i++) {
      this.age[i]! += dt;
      const base = i * TRAIL;
      const h = this.head[i]!;
      const x = this.xs[base + h]!, y = this.ys[base + h]!;
      const w = this.age[i]! < this.life[i]! ? this.sample(x, y) : null;
      if (!w || x < 0 || y < 0 || x > f.width || y > f.height) { this.spawn(i, f, false); continue; }
      // Screen y grows downwards; north is up.
      const nx = x + w[0] * step, ny = y - w[1] * step;
      if (keep) {
        // A new tail point; the oldest drops off.
        const nh = (h + 1) % TRAIL;
        this.head[i] = nh;
        this.xs[base + nh] = nx; this.ys[base + nh] = ny;
        if (this.filled[i]! < TRAIL) this.filled[i]! += 1;
      } else {
        // Between kept points the newest moves on, so motion stays smooth.
        this.xs[base + h] = nx; this.ys[base + h] = ny;
      }
      // Fade in over the first fifth of life and out over the last fifth.
      const phase = this.age[i]! / this.life[i]!;
      const lifeLevel = Math.min(LEVELS - 1, Math.floor(Math.min(1, Math.min(phase, 1 - phase) * 5) * (LEVELS - 1)));
      // The tail as connected lines, newest first, switching path only when the brightness drops.
      const count = this.filled[i]!;
      let level = -1;
      let p: Path2D | null = null;
      for (let k = 0; k < count - 1; k++) {
        const a = (this.head[i]! - k + TRAIL) % TRAIL, b2 = (a - 1 + TRAIL) % TRAIL;
        const tailLevel = LEVELS - 1 - Math.floor((k / (TRAIL - 1)) * LEVELS);
        const l = Math.max(0, Math.min(lifeLevel, tailLevel));
        if (l !== level) { level = l; p = paths[l]!; p.moveTo(this.xs[base + a]!, this.ys[base + a]!); }
        p!.lineTo(this.xs[base + b2]!, this.ys[base + b2]!);
      }
    }
    const ctx = this.ctx;
    this.clear();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Plain ends and joins: round ones on thousands of short lines cost the most to draw.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 1.4;
    paths.forEach((p, level) => {
      ctx.strokeStyle = `rgba(255,255,255,${(0.08 + 0.8 * (level / (LEVELS - 1))).toFixed(2)})`;
      ctx.stroke(p);
    });
    this.workTimes.push(performance.now() - began);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** Still arrows on a grid, pointing where the wind blows, longer for stronger wind. */
  private drawArrows() {
    const f = this.field!;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    const gap = 52;
    const p = new Path2D();
    for (let y = gap / 2; y < f.height; y += gap) {
      for (let x = gap / 2; x < f.width; x += gap) {
        const w = this.sample(x, y);
        if (!w) continue;
        const speed = Math.hypot(w[0], w[1]);
        if (speed < 1) continue;
        const ux = w[0] / speed, uy = -w[1] / speed;
        const len = Math.min(20, 8 + speed * 0.25);
        const hx = x + (ux * len) / 2, hy = y + (uy * len) / 2;
        p.moveTo(x - (ux * len) / 2, y - (uy * len) / 2);
        p.lineTo(hx, hy);
        p.moveTo(hx - ux * 5 + uy * 3.5, hy - uy * 5 - ux * 3.5);
        p.lineTo(hx, hy);
        p.lineTo(hx - ux * 5 - uy * 3.5, hy - uy * 5 + ux * 3.5);
      }
    }
    ctx.stroke(p);
  }

  /** Average drawing time per frame over the last few seconds (ms). */
  workMs(): number {
    const w = this.workTimes;
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0;
  }

  /** Frames a second over the last few seconds (0 when not animating). */
  fps(): number {
    const t = this.frameTimes;
    if (t.length < 2) return 0;
    return ((t.length - 1) * 1000) / (t[t.length - 1]! - t[0]!);
  }
}
