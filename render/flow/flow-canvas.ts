// The wind's flow on the map (v8 24-WindHome): short white streaks drifting
// with the wind at the terrain, or still arrows when the animation is off.
//
// A plain 2D canvas over the map, in screen pixels. The wind arrives as a
// coarse grid of east and north parts (km/h) over the screen; streaks move
// through it, each living a few seconds. Kept cheap for phones: a fixed,
// small number of streaks, one stroke per frame for each brightness, no
// trail buffer to fade. The animation stops whenever the page is hidden, the
// map is moving, or the layer is not shown, and draws nothing when still.

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

interface Streak { x: number; y: number; age: number; life: number }

/** Screen pixels per second for each km/h. */
const PX_PER_KMH = 0.9;
/** One streak per this many square pixels. */
const DENSITY = 1500;
const BUCKETS = 4;

export class FlowCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private field: FlowField | null = null;
  private streaks: Streak[] = [];
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
  /** The map is being dragged or zoomed: the streaks would slide wrongly, so they wait. */
  setMoving(moving: boolean) { this.moving = moving; this.sync(); }

  setField(f: FlowField | null) {
    this.field = f;
    this.streaks = [];
    this.sync();
  }

  private running() { return this.shown && this.mode === 'flow' && !this.moving && !document.hidden && !!this.field; }

  private sync() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.clear();
    if (!this.shown || this.moving || !this.field) return;
    if (this.mode === 'arrows') { this.drawArrows(); return; }
    if (this.running()) { this.last = performance.now(); this.frame = requestAnimationFrame((t) => this.tick(t)); }
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

  private spawn(s: Streak, f: FlowField, fresh: boolean) {
    s.x = Math.random() * f.width;
    s.y = Math.random() * f.height;
    s.life = 2000 + Math.random() * 2500;
    // At the start, ages are spread so streaks do not all appear at once.
    s.age = fresh ? Math.random() * s.life : 0;
  }

  private tick(now: number) {
    if (!this.running()) return;
    // At most about 60 a second: 120 Hz screens would double the work for no visible gain.
    if (now - this.last < 15 && this.frameTimes.length) { this.frame = requestAnimationFrame((t) => this.tick(t)); return; }
    const f = this.field!;
    // The first frame's time can be a little before the start: never step backwards.
    const dt = Math.max(0, Math.min(100, now - this.last));
    this.last = now;
    const began = performance.now();
    this.frameTimes.push(now);
    while (this.frameTimes.length && this.frameTimes[0]! < now - 5000) { this.frameTimes.shift(); this.workTimes.shift(); }
    const want = Math.round((f.width * f.height) / DENSITY);
    while (this.streaks.length < want) { const s = { x: 0, y: 0, age: 0, life: 1 }; this.spawn(s, f, true); this.streaks.push(s); }
    this.streaks.length = want;
    const ctx = this.ctx;
    this.clear();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    // Streaks grouped by brightness (fade in and out over their life): one stroke per group.
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    for (const s of this.streaks) {
      s.age += dt;
      const w = s.age < s.life ? this.sample(s.x, s.y) : null;
      if (!w || s.x < 0 || s.y < 0 || s.x > f.width || s.y > f.height) { this.spawn(s, f, false); continue; }
      const [u, v] = w;
      const speed = Math.hypot(u, v);
      if (speed < 1) continue;
      // Screen y grows downwards; north is up.
      s.x += u * PX_PER_KMH * (dt / 1000);
      s.y -= v * PX_PER_KMH * (dt / 1000);
      const len = Math.min(22, 5 + speed * 0.3);
      const dx = (u / speed) * len, dy = (-v / speed) * len;
      const phase = s.age / s.life;
      const b = Math.max(0, Math.min(BUCKETS - 1, Math.floor(Math.min(phase, 1 - phase) * 2 * BUCKETS)));
      paths[b]!.moveTo(s.x - dx, s.y - dy);
      paths[b]!.lineTo(s.x, s.y);
    }
    paths.forEach((p, b) => {
      ctx.strokeStyle = `rgba(255,255,255,${(0.25 + 0.55 * ((b + 1) / BUCKETS)).toFixed(2)})`;
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
