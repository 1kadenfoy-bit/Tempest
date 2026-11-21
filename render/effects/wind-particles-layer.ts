// Wind particles as a MapLibre custom layer: streaks that fly just above the
// terrain, drawn in the map's own 3D space so hills hide them and tilting the
// map shows them in depth. The movement is in ./particles.ts; this file is
// only the drawing and the frame loop.
//
// Cheap on a phone by design: a fixed number of particles, buffers made once,
// nothing allocated per frame, and no redraw requested at all while paused or
// while the page is hidden.
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { HeightGrid } from './height-grid';
import { ParticleSim, TRAIL_POINTS, VERTEX_FLOATS, VERTS_PER_SEGMENT, type ParticleLook, type ParticleView, type WindFn } from './particles';

const MAX_PARTICLES = 4000;
/** Ground farther than this many screen widths from the middle is too far away to fill with streaks. */
const REACH_WIDTHS = 6;
/** How far past the usable screen the terrain picture reaches, as a share of the view. */
const OVERSCAN = 0.15;
/** Metres around the equator, for turning mercator units into metres. */
const EQUATOR_M = 40_075_016.686;

const VERT = `#version 300 es
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_widthPx;
in vec3 a_pos;
in vec3 a_other;
in float a_side;
in float a_alpha;
in float a_width;
out float v_alpha;
out float v_side;
void main() {
  vec4 ca = u_matrix * vec4(a_pos, 1.0);
  vec4 cb = u_matrix * vec4(a_other, 1.0);
  vec2 sa = ca.xy / ca.w * u_viewport * 0.5;
  vec2 sb = cb.xy / cb.w * u_viewport * 0.5;
  vec2 d = sb - sa;
  float l = length(d);
  d = l > 1e-4 ? d / l : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  vec2 s = sa + n * a_side * a_width * u_widthPx * 0.5;
  gl_Position = vec4(s / (u_viewport * 0.5) * ca.w, ca.z, ca.w);
  v_alpha = a_alpha;
  v_side = a_side;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float v_alpha;
in float v_side;
out vec4 outColor;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(v_side));
  float a = v_alpha * edge;
  outColor = vec4(vec3(a), a);
}`;

export interface WindLayerStats {
  /** Frames per second over the last second or so; 0 when paused. */
  fps: number;
  /** Milliseconds spent moving and uploading particles per frame (not the GPU's drawing). */
  workMs: number;
}

export class WindParticlesLayer implements CustomLayerInterface {
  readonly id = 'wind-particles';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  readonly grid = new HeightGrid(72);
  private sim = new ParticleSim(MAX_PARTICLES);
  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private verts = new Float32Array(this.sim.maxVertices * VERTEX_FLOATS);
  private wind: WindFn = (_x, _y, out) => { out[0] = 0; out[1] = 0; };
  private look: ParticleLook = { count: 1200, trailSeconds: 0.7, pxPerKmh: 2.2, speedScale: 1, clearance: 60, widthPx: 2.4, brightness: 0.9 };
  private running = true;
  private visible = true;
  private last = 0;
  private times: number[] = [];
  private work = 0;
  /** Top of the usable screen (CSS pixels from the top): below the sky, and not too far away to matter. */
  private topPx = 0;
  private view: ParticleView = {
    matrix: new Float32Array(16),
    topNdcY: 1,
    spawn: (out) => this.spawnOnScreen(out),
  };
  private onMove = () => this.updateTop();
  private onVisible = () => { if (!document.hidden) this.map?.triggerRepaint(); };

  setWind(fn: WindFn): void { this.wind = fn; }
  setLook(look: Partial<ParticleLook>): void { Object.assign(this.look, look); this.look.count = Math.min(this.look.count, MAX_PARTICLES); }
  get maxParticles(): number { return MAX_PARTICLES; }

  /** Start or stop the animation. Stopped, the layer asks for no frames. */
  setRunning(on: boolean): void {
    this.running = on;
    this.last = 0;
    this.times.length = 0;
    this.map?.triggerRepaint(); // on: start the loop; off: one last draw keeps the picture as it is
  }
  get isRunning(): boolean { return this.running; }

  /** Show or hide the streaks. Hidden, nothing is moved or drawn and no frames are asked for. */
  setVisible(on: boolean): void {
    this.visible = on;
    this.last = 0;
    this.times.length = 0;
    this.map?.triggerRepaint();
  }

  stats(): WindLayerStats {
    const now = performance.now();
    const recent = this.times.filter((t) => now - t < 1200);
    if (!this.running || recent.length < 3) return { fps: 0, workMs: this.work };
    return { fps: ((recent.length - 1) * 1000) / (recent[recent.length - 1]! - recent[0]!), workMs: this.work };
  }

  /** Ground height here (m), from the picture of the view's terrain. */
  groundAt = (x: number, y: number): number => this.grid.heightAt(x, y);

  /** Fill the terrain picture from the map's own 3D heights. Call when the view has settled. */
  refreshGround(): void {
    const map = this.map;
    if (!map) return;
    const box = this.viewBox(OVERSCAN);
    const ex = map.getTerrain()?.exaggeration ?? 1;
    this.grid.fill(box, (x, y) => {
      const h = map.queryTerrainElevation(mercatorToLngLat(x, y));
      return h == null ? NaN : h / ex;
    });
    this.sim.setView(EQUATOR_M * Math.cos(map.getCenter().lat * Math.PI / 180));
  }

  /** Find where the usable screen starts (called when the view moves). */
  private updateTop(): void {
    const map = this.map;
    if (!map) return;
    const canvas = map.getCanvas();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const c = map.getCenter();
    const cx = (c.lng + 180) / 360;
    const cy = (1 - Math.asinh(Math.tan((c.lat * Math.PI) / 180)) / Math.PI) / 2;
    const reach = (REACH_WIDTHS * w) / (512 * 2 ** map.getZoom());
    let top = h * 0.9;
    for (let k = 0; k <= 30; k++) {
      const sy = (k / 30) * h;
      const p = map.unproject([w / 2, sy]);
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const mx = (p.lng + 180) / 360;
      const my = (1 - Math.asinh(Math.tan((p.lat * Math.PI) / 180)) / Math.PI) / 2;
      if (Math.hypot(mx - cx, my - cy) <= reach) { top = sy; break; }
    }
    this.topPx = top;
    this.view.topNdcY = 1 - (2 * top) / h;
  }

  /** A mercator position under a random point of the usable screen. */
  private spawnOnScreen(out: Float64Array): void {
    const map = this.map!;
    const canvas = map.getCanvas();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const p = map.unproject([Math.random() * w, this.topPx + Math.random() * (h - this.topPx)]);
    out[0] = (p.lng + 180) / 360;
    out[1] = (1 - Math.asinh(Math.tan((p.lat * Math.PI) / 180)) / Math.PI) / 2;
  }

  private viewBox(over: number): [number, number, number, number] {
    const map = this.map!;
    const canvas = map.getCanvas();
    // The corners of the usable screen and the middle of its top edge, so a tilted view's far land counts.
    const w = canvas.clientWidth, h = canvas.clientHeight;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    this.updateTop();
    for (const [sx, sy] of [[0, this.topPx], [w, this.topPx], [0, h], [w, h], [w / 2, this.topPx]] as const) {
      const p = map.unproject([sx, sy]);
      const mx = (p.lng + 180) / 360;
      const my = (1 - Math.asinh(Math.tan((p.lat * Math.PI) / 180)) / Math.PI) / 2;
      x0 = Math.min(x0, mx); x1 = Math.max(x1, mx); y0 = Math.min(y0, my); y1 = Math.max(y1, my);
    }
    const dx = (x1 - x0) * over, dy = (y1 - y0) * over;
    return [x0 - dx, y0 - dy, x1 + dx, y1 + dy];
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    const g = gl as WebGL2RenderingContext;
    this.gl = g;
    const compile = (type: number, src: string) => {
      const s = g.createShader(type)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(`wind particles shader: ${g.getShaderInfoLog(s)}`);
      return s;
    };
    const p = g.createProgram()!;
    g.attachShader(p, compile(g.VERTEX_SHADER, VERT));
    g.attachShader(p, compile(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(`wind particles program: ${g.getProgramInfoLog(p)}`);
    this.program = p;
    for (const u of ['u_matrix', 'u_viewport', 'u_widthPx']) this.loc[u] = g.getUniformLocation(p, u);

    // Four vertices and six indices per segment, built once.
    const segs = MAX_PARTICLES * (TRAIL_POINTS - 1);
    const idx = new Uint32Array(segs * 6);
    for (let s = 0; s < segs; s++) {
      const v = s * VERTS_PER_SEGMENT, o = s * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v + 1; idx[o + 4] = v + 3; idx[o + 5] = v + 2;
    }
    this.vao = g.createVertexArray();
    g.bindVertexArray(this.vao);
    this.vbo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
    g.bufferData(g.ARRAY_BUFFER, this.verts.byteLength, g.DYNAMIC_DRAW);
    this.ibo = g.createBuffer();
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, this.ibo);
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, idx, g.STATIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    const attr = (name: string, size: number, offset: number) => {
      const l = g.getAttribLocation(p, name);
      g.enableVertexAttribArray(l);
      g.vertexAttribPointer(l, size, g.FLOAT, false, stride, offset * 4);
    };
    attr('a_pos', 3, 0); attr('a_other', 3, 3); attr('a_side', 1, 6); attr('a_alpha', 1, 7); attr('a_width', 1, 8);
    g.bindVertexArray(null);

    document.addEventListener('visibilitychange', this.onVisible);
    map.on('move', this.onMove);
    this.updateTop();
  }

  onRemove(): void {
    document.removeEventListener('visibilitychange', this.onVisible);
    this.map?.off('move', this.onMove);
    const g = this.gl;
    if (g) {
      if (this.program) g.deleteProgram(this.program);
      if (this.vbo) g.deleteBuffer(this.vbo);
      if (this.ibo) g.deleteBuffer(this.ibo);
      if (this.vao) g.deleteVertexArray(this.vao);
    }
    this.map = null; this.gl = null;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const g = gl as WebGL2RenderingContext;
    const map = this.map;
    if (!map || !this.program || !this.visible) return;
    const now = performance.now();
    const t0 = now;
    if (this.running && !document.hidden) {
      // The first frame after a pause, or a stalled tab, must not jump the particles.
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
      this.last = now;
      this.times.push(now);
      if (this.times.length > 90) this.times.shift();
      const unitsPerPx = 1 / (512 * 2 ** map.getZoom());
      this.view.matrix = options.defaultProjectionData.mainMatrix as unknown as Float32Array;
      if (dt > 0) this.sim.step(dt, this.look, this.wind, this.groundAt, unitsPerPx, this.view);
    }
    const count = this.sim.write(this.verts, this.look, this.groundAt);
    this.work = this.work * 0.9 + (performance.now() - t0) * 0.1;
    if (count > 0) {
      g.useProgram(this.program);
      g.uniformMatrix4fv(this.loc.u_matrix!, false, options.defaultProjectionData.mainMatrix as unknown as Float32Array);
      const w = g.drawingBufferWidth, h = g.drawingBufferHeight;
      g.uniform2f(this.loc.u_viewport!, w, h);
      g.uniform1f(this.loc.u_widthPx!, this.look.widthPx * (w / Math.max(1, map.getCanvas().clientWidth)));
      g.bindVertexArray(this.vao);
      g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
      g.bufferSubData(g.ARRAY_BUFFER, 0, this.verts, 0, count * VERTEX_FLOATS);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
      g.enable(g.DEPTH_TEST);
      g.depthFunc(g.LEQUAL);
      g.depthMask(false);
      g.drawElements(g.TRIANGLES, (count / VERTS_PER_SEGMENT) * 6, g.UNSIGNED_INT, 0);
      g.depthMask(true);
      g.bindVertexArray(null);
    }
    // The next frame, only while running and visible.
    if (this.running && !document.hidden) map.triggerRepaint();
  }
}

function mercatorToLngLat(x: number, y: number): [number, number] {
  return [x * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI];
}
