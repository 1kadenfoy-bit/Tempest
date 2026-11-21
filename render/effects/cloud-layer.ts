// Clouds as a MapLibre custom layer: up to three sheets of cloud at their own
// heights above sea level, drawn in the map's own 3D space. Low cloud sits
// among the hills, so peaks above it poke through and valleys below it fill
// like fog; mid cloud and high cloud sit above, and a tilted view looks down
// on all of them. Each sheet's share of sky covered, height and thickness are
// plain numbers, so a forecast can drive them (cloud cover low, mid and high).
//
// Each sheet is one quad over the view, shaded per pixel with layered noise
// (no textures to load). The look follows the kind of cloud: low cloud is
// round and lit from one side, mid cloud is patchy and flatter, high cloud is
// thin, wispy and stretched along the wind. Nothing is drawn or redrawn while
// paused or while the page is hidden.
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';

export type CloudKind = 'low' | 'mid' | 'high';

export interface CloudSheet {
  /** Share of the sky this layer covers, 0 to 1 (a forecast's cloud cover divided by 100). */
  cover: number;
  /** Height of the cloud's base above sea level, metres. */
  baseM: number;
}

export interface CloudLook {
  /** 0 to 1: how solid the cloud is where there is cloud (thin veil to thick). */
  density: number;
  /** 0 to 1: how grey and heavy (rain cloud) rather than white. */
  storminess: number;
  /** Detail levels in the noise, 2 to 5. More is finer and costs more on the phone. */
  detail: number;
  /** How fast the clouds drift, 1 being a slow, calm drift. */
  drift: number;
}

export interface CloudWind {
  /** Direction the wind blows FROM, degrees clockwise from north. */
  fromDeg: number;
  speedKmh: number;
}

/** Spread of the noise's values at 2, 3, 4 and 5 levels of detail, for turning a share of sky into a threshold. */
const SIGMA = [0, 0, 0.173, 0.15, 0.141, 0.136];
/** Ground farther than this many screen widths from the middle is not covered. */
const REACH_WIDTHS = 8;
const EQUATOR_M = 40_075_016.686;
/** Above this height the heights are squeezed, so high cloud still shows in a map-sized view. */
const SQUEEZE_FROM_M = 3000;
const SQUEEZE = 0.25;
/** The map's vertical field of view, radians. */
const FOV = 0.6435011087932844;

/** Height used for drawing: true up to 3 km (peaks and clouds keep their real relation), compressed above. */
export function drawnHeight(m: number): number {
  return m <= SQUEEZE_FROM_M ? m : SQUEEZE_FROM_M + (m - SQUEEZE_FROM_M) * SQUEEZE;
}

/** Value the noise must exceed for a layer to cover `cover` of the sky. */
export function coverThreshold(cover: number, detail: number): number {
  if (cover <= 0.005) return 2;
  if (cover >= 0.995) return -2;
  const z = Math.log(cover / (1 - cover)) / 1.702; // the normal curve's inverse, near enough
  return 0.5 - SIGMA[Math.min(5, Math.max(2, Math.round(detail)))]! * z;
}

const VERT = `#version 300 es
uniform mat4 u_matrix;
uniform vec2 u_origin;
uniform float u_z;
uniform float u_kmPerUnit;
uniform float u_zKmPerUnit;
in vec2 a_pos;
out vec3 v_km;
void main() {
  gl_Position = u_matrix * vec4(a_pos, u_z, 1.0);
  v_km = vec3((a_pos - u_origin) * u_kmPerUnit, u_z * u_zKmPerUnit);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_drift;
uniform vec2 u_wind;
uniform vec3 u_cam;
uniform float u_threshold;
uniform float u_soft;
uniform float u_thick;
uniform float u_scale;
uniform float u_stretch;
uniform float u_dark;
uniform float u_shade;
uniform int u_oct;
uniform float u_seed;
in vec3 v_km;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0, sum = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= u_oct) break;
    s += a * vnoise(p);
    sum += a;
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s / sum;
}
vec2 field(vec2 km) {
  vec2 q = km - u_drift;
  // Along and across the wind; high cloud is drawn out along it.
  float al = dot(q, u_wind), ac = dot(q, vec2(-u_wind.y, u_wind.x));
  return vec2(al / (u_scale * u_stretch), ac / u_scale) + u_seed;
}

void main() {
  vec2 p = field(v_km.xy);
  float n = fbm(p);
  float d = smoothstep(u_threshold - u_soft, u_threshold + u_soft, n);
  if (d <= 0.002) discard;
  // Lit from one side: cloud whose far side is lower than its near side is on the sunny edge.
  float lit = clamp(0.5 + (n - fbm(p + vec2(0.18, 0.12))) * u_shade, 0.0, 1.0);
  float grey = mix(0.78 + 0.22 * lit, 0.42 + 0.2 * lit, u_dark);
  // Thick middles read denser than thin edges.
  float a = d * u_thick * (0.65 + 0.35 * smoothstep(u_threshold, u_threshold + 0.18, n));
  // Far haze: sheets fade out before they pile up at the horizon.
  float dist = length(v_km - u_cam);
  a *= 1.0 - smoothstep(30.0, 70.0, dist);
  outColor = vec4(vec3(grey) * a, a);
}`;

interface SheetStyle {
  /** Noise feature size, km. */
  scale: number;
  /** Stretch along the wind (1: round). */
  stretch: number;
  /** Softness of the edge, in noise units. */
  soft: number;
  /** Own thickness against the global density. */
  thick: number;
  /** How strongly the lit side shows. */
  shade: number;
  /** Drift speed against the others. */
  drift: number;
  seed: number;
}

const STYLE: Record<CloudKind, SheetStyle> = {
  low: { scale: 1.6, stretch: 1, soft: 0.06, thick: 1, shade: 3.2, drift: 1, seed: 11 },
  mid: { scale: 3.2, stretch: 1.6, soft: 0.09, thick: 0.75, shade: 1.8, drift: 1.25, seed: 47 },
  high: { scale: 5, stretch: 3, soft: 0.14, thick: 0.45, shade: 0.8, drift: 1.6, seed: 83 },
};

const KINDS: CloudKind[] = ['low', 'mid', 'high'];

export class CloudLayer implements CustomLayerInterface {
  readonly id = 'clouds';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vbo: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private sheets: Record<CloudKind, CloudSheet> = { low: { cover: 0.4, baseM: 1200 }, mid: { cover: 0.3, baseM: 3500 }, high: { cover: 0.5, baseM: 8000 } };
  private look: CloudLook = { density: 0.85, storminess: 0, detail: 3, drift: 1 };
  private wind: CloudWind = { fromDeg: 280, speedKmh: 36 };
  private running = true;
  private visible = true;
  private last = 0;
  /** Seconds of drifting so far (only counts while running). */
  private clock = 0;
  private quad = new Float32Array(12);
  private onVisible = () => { if (!document.hidden) this.map?.triggerRepaint(); };

  setSheet(kind: CloudKind, s: Partial<CloudSheet>): void { Object.assign(this.sheets[kind], s); this.map?.triggerRepaint(); }
  setLook(l: Partial<CloudLook>): void { Object.assign(this.look, l); this.map?.triggerRepaint(); }
  setWind(w: Partial<CloudWind>): void { Object.assign(this.wind, w); }

  setVisible(on: boolean): void { this.visible = on; this.map?.triggerRepaint(); }
  get isVisible(): boolean { return this.visible; }

  /** Start or stop the drifting. Stopped, the layer asks for no frames. */
  setRunning(on: boolean): void {
    this.running = on;
    this.last = 0;
    this.map?.triggerRepaint();
  }
  get isRunning(): boolean { return this.running; }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    const g = gl as WebGL2RenderingContext;
    this.gl = g;
    const compile = (type: number, src: string) => {
      const s = g.createShader(type)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(`clouds shader: ${g.getShaderInfoLog(s)}`);
      return s;
    };
    const p = g.createProgram()!;
    g.attachShader(p, compile(g.VERTEX_SHADER, VERT));
    g.attachShader(p, compile(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(`clouds program: ${g.getProgramInfoLog(p)}`);
    this.program = p;
    for (const u of ['u_matrix', 'u_origin', 'u_z', 'u_kmPerUnit', 'u_zKmPerUnit', 'u_drift', 'u_wind', 'u_cam', 'u_threshold', 'u_soft', 'u_thick', 'u_scale', 'u_stretch', 'u_dark', 'u_shade', 'u_oct', 'u_seed']) {
      this.loc[u] = g.getUniformLocation(p, u);
    }
    this.vao = g.createVertexArray();
    g.bindVertexArray(this.vao);
    this.vbo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
    g.bufferData(g.ARRAY_BUFFER, 12 * 4, g.DYNAMIC_DRAW);
    const l = g.getAttribLocation(p, 'a_pos');
    g.enableVertexAttribArray(l);
    g.vertexAttribPointer(l, 2, g.FLOAT, false, 0, 0);
    g.bindVertexArray(null);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  onRemove(): void {
    document.removeEventListener('visibilitychange', this.onVisible);
    const g = this.gl;
    if (g) {
      if (this.program) g.deleteProgram(this.program);
      if (this.vbo) g.deleteBuffer(this.vbo);
      if (this.vao) g.deleteVertexArray(this.vao);
    }
    this.map = null; this.gl = null;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const g = gl as WebGL2RenderingContext;
    const map = this.map;
    if (!map || !this.program) return;
    const now = performance.now();
    const animate = this.running && !document.hidden;
    if (animate) {
      if (this.last) this.clock += Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
    }
    if (this.visible) this.draw(g, options, map);
    if (animate && this.visible) map.triggerRepaint();
  }

  private draw(g: WebGL2RenderingContext, options: CustomRenderMethodInput, map: MapLibreMap): void {
    const c = map.getCenter();
    const cx = (c.lng + 180) / 360;
    const cy = (1 - Math.asinh(Math.tan((c.lat * Math.PI) / 180)) / Math.PI) / 2;
    const metresPerUnit = EQUATOR_M * Math.cos((c.lat * Math.PI) / 180);
    const canvas = map.getCanvas();
    const unitsPerPx = 1 / (512 * 2 ** map.getZoom());
    const half = REACH_WIDTHS * canvas.clientWidth * unitsPerPx;
    const quad = this.quad;
    quad.set([cx - half, cy - half, cx + half, cy - half, cx - half, cy + half, cx - half, cy + half, cx + half, cy - half, cx + half, cy + half]);

    // The camera's place, to draw the sheets farthest first and to fade distant cloud:
    // behind and above the map's middle, at the distance the map's field of view puts it.
    const worldPx = 512 * 2 ** map.getZoom();
    const distPx = (0.5 * canvas.clientHeight) / Math.tan(FOV / 2);
    const pitch = (map.getPitch() * Math.PI) / 180, bearing = (map.getBearing() * Math.PI) / 180;
    const back = (distPx * Math.sin(pitch)) / worldPx;
    const camX = cx - back * Math.sin(bearing), camY = cy + back * Math.cos(bearing);
    const groundM = map.queryTerrainElevation(c) ?? 0;
    const camZ = ((distPx * Math.cos(pitch)) / worldPx) + groundM / metresPerUnit;
    const kmPerUnit = metresPerUnit / 1000;
    const camKm = [(camX - cx) * kmPerUnit, (camY - cy) * kmPerUnit, camZ * kmPerUnit];
    const camHeightM = camZ * metresPerUnit;

    const active = KINDS.filter((k) => this.sheets[k].cover > 0.005);
    active.sort((a, b) => Math.abs(camHeightM - drawnHeight(this.sheets[b].baseM)) - Math.abs(camHeightM - drawnHeight(this.sheets[a].baseM)));
    if (active.length === 0) return;

    // Drift downwind, in kilometres.
    const rad = (this.wind.fromDeg * Math.PI) / 180;
    const toEast = -Math.sin(rad), toNorth = -Math.cos(rad);
    // The noise's frame: x east, y south (mercator), so the wind's northward part flips.
    const wx = toEast, wy = -toNorth;
    const mPerPx = metresPerUnit * unitsPerPx;
    // A calm drift: about 4 screen pixels a second for each 36 km/h of wind.
    const kmPerSec = ((this.wind.speedKmh / 36) * 4 * mPerPx * this.look.drift) / 1000;

    g.useProgram(this.program);
    g.uniformMatrix4fv(this.loc.u_matrix!, false, options.defaultProjectionData.mainMatrix as unknown as Float32Array);
    g.uniform2f(this.loc.u_origin!, cx, cy);
    g.uniform1f(this.loc.u_kmPerUnit!, kmPerUnit);
    g.uniform1f(this.loc.u_zKmPerUnit!, kmPerUnit);
    g.uniform2f(this.loc.u_wind!, wx, wy);
    g.uniform3f(this.loc.u_cam!, camKm[0]!, camKm[1]!, camKm[2]!);
    g.uniform1i(this.loc.u_oct!, Math.min(5, Math.max(2, Math.round(this.look.detail))));
    g.uniform1f(this.loc.u_dark!, this.look.storminess);
    g.bindVertexArray(this.vao);
    g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
    g.bufferSubData(g.ARRAY_BUFFER, 0, quad);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.enable(g.DEPTH_TEST);
    g.depthFunc(g.LEQUAL);
    g.depthMask(false);
    g.disable(g.CULL_FACE);
    for (const kind of active) {
      const st = STYLE[kind], sheet = this.sheets[kind];
      g.uniform1f(this.loc.u_z!, drawnHeight(sheet.baseM) / metresPerUnit);
      const d = kmPerSec * st.drift * this.clock;
      g.uniform2f(this.loc.u_drift!, wx * d, wy * d);
      g.uniform1f(this.loc.u_threshold!, coverThreshold(sheet.cover, this.look.detail));
      g.uniform1f(this.loc.u_soft!, st.soft);
      g.uniform1f(this.loc.u_thick!, Math.min(1, st.thick * this.look.density * 1.15));
      g.uniform1f(this.loc.u_scale!, st.scale);
      g.uniform1f(this.loc.u_stretch!, st.stretch);
      g.uniform1f(this.loc.u_shade!, st.shade);
      g.uniform1f(this.loc.u_seed!, st.seed);
      g.drawArrays(g.TRIANGLES, 0, 6);
    }
    g.depthMask(true);
    g.bindVertexArray(null);
  }
}
