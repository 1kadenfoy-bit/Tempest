// Clouds as a MapLibre custom layer: up to three sheets of cloud at their own
// heights above sea level, drawn in the map's own 3D space. Low cloud sits
// among the hills, so peaks above it poke through and valleys below it fill
// like fog; mid cloud and high cloud sit above, and a tilted view looks down
// on all of them. Each sheet's share of sky covered, height and thickness are
// plain numbers, so a forecast can drive them (cloud cover low, mid and high).
//
// Each sheet is one quad over the view, shaded per pixel with layered noise
// from one small random-number picture made on the spot. The look follows the
// kind of cloud: low cloud is a fluffy 3D slab (a few steps of ray marching
// through puffs that are taller where the cloud is thicker, lit from one side),
// mid cloud is patchy and flatter, high cloud is thin, wispy and stretched
// along the wind. The noise slowly slides at a different speed in every layer
// of detail, so clouds keep forming and fading as they drift. The pattern is
// fixed to the land: panning moves the map over the clouds, not the clouds
// with the map. Nothing is drawn or redrawn while paused or hidden.
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
  /** How fast shapes form and fade as they drift, 0 being none. */
  evolve: number;
  /** Steps through the low cloud's depth (0 draws it flat). More is fluffier and costs more. */
  fluff: number;
  /** Depth of the low cloud slab, metres. */
  lowDepthM: number;
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
layout(location = 0) in vec2 a_pos;
out vec3 v_km;
void main() {
  gl_Position = u_matrix * vec4(a_pos, u_z, 1.0);
  v_km = vec3((a_pos - u_origin) * u_kmPerUnit, u_z * u_kmPerUnit);
}`;

/** Shared by both shaders: the noise, and where a point of ground sits in the cloud pattern. */
const COMMON = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_noise;
uniform vec2 u_drift;
uniform vec2 u_wind;
uniform float u_threshold;
uniform float u_soft;
uniform float u_thick;
uniform float u_scale;
uniform float u_stretch;
uniform float u_dark;
uniform float u_shade;
uniform float u_seed;
uniform float u_time;
uniform float u_evolve;
uniform vec3 u_cam;
uniform int u_oct;
in vec3 v_km;
out vec4 outColor;

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(u_noise, (i + f + 0.5) / 256.0, 0.0).r;
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0, sum = 0.0, fq = 1.0;
  for (int i = 0; i < 5; i++) {
    if (i >= u_oct) break;
    float fi = float(i);
    // Each layer of detail slides its own way, so shapes keep forming and fading.
    float ang = 1.3 * fi + 0.7;
    vec2 off = vec2(cos(ang), sin(ang)) * (0.03 * pow(1.6, fi)) * u_evolve * u_time;
    s += a * vnoise(p * fq + off + fi * 7.3);
    sum += a;
    fq *= 2.03;
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
float hazeAt(float dist) {
  return 1.0 - smoothstep(30.0, 70.0, dist);
}
`;

const FRAG_FLAT = COMMON + `
void main() {
  vec2 p = field(v_km.xy);
  float n = fbm(p);
  // The share of sky covered breathes a little.
  float th = u_threshold + 0.02 * sin(u_time * 0.35 + u_seed);
  float d = smoothstep(th - u_soft, th + u_soft, n);
  if (d <= 0.002) discard;
  // Lit from one side: cloud whose far side is lower than its near side is on the sunny edge.
  float lit = clamp(0.5 + (n - fbm(p + vec2(0.18, 0.12))) * u_shade, 0.0, 1.0);
  float grey = mix(0.78 + 0.22 * lit, 0.42 + 0.2 * lit, u_dark);
  // Thick middles read denser than thin edges.
  float a = d * u_thick * (0.65 + 0.35 * smoothstep(th, th + 0.18, n));
  a *= hazeAt(length(v_km - u_cam));
  outColor = vec4(vec3(grey) * a, a);
}`;

/** The low cloud as a slab: puffs that rise taller where the noise is higher, marched a few steps through. */
const FRAG_VOLUME = COMMON + `
uniform vec2 u_slab;
uniform int u_steps;
uniform vec3 u_sun;

// Density at a point: how much cloud, from the noise at that spot and how high in the slab it is.
float dens(vec2 xy, float h, float th) {
  float n = fbm(field(xy));
  // Puffs are taller where the noise is higher: this is the height of the top, as a share of the slab.
  float top = clamp((n - (th - u_soft)) / 0.3, 0.0, 1.0);
  if (top <= 0.0) return 0.0;
  return smoothstep(top, top * 0.55, h) * smoothstep(0.0, 0.12, h);
}

void main() {
  vec3 ray = v_km - u_cam;
  float dist = length(ray);
  vec3 dir = ray / dist;
  float z0 = u_slab.x, z1 = u_slab.y;
  if (abs(dir.z) < 1e-3) discard;
  float ta = (z0 - u_cam.z) / dir.z, tb = (z1 - u_cam.z) / dir.z;
  float tmin = max(min(ta, tb), 0.0), tmax = max(ta, tb);
  if (tmax <= tmin) discard;
  // A long, shallow look through the slab is cut short.
  float len = min(tmax - tmin, 6.0);
  float dt = len / float(u_steps);
  float depth = z1 - z0;
  float th = u_threshold + 0.02 * sin(u_time * 0.35 + u_seed);
  // Steps start a little different for each pixel: a touch of grain instead of visible terraces.
  float jit = 0.5 + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.25;
  float T = 1.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= u_steps || T < 0.04) break;
    vec3 pos = u_cam + dir * (tmin + (float(i) + jit) * dt);
    float h = (pos.z - z0) / depth;
    float d = dens(pos.xy, h, th);
    if (d > 0.01) {
      float a = 1.0 - exp(-d * u_thick * dt * 7.0 / max(depth, 0.2));
      // How much cloud lies between this point and the sun: the far side of a puff is in shade.
      vec3 lp = pos + u_sun * (0.4 * depth);
      float dl = dens(lp.xy, (lp.z - z0) / depth, th);
      float lit = exp(-dl * 1.6);
      float bright = mix(0.5, 1.0, lit) * mix(0.8, 1.0, clamp(h, 0.0, 1.0));
      vec3 c = vec3(bright) * mix(1.0, 0.5, u_dark);
      col += T * a * c;
      T *= 1.0 - a;
    }
  }
  float alpha = 1.0 - T;
  if (alpha < 0.01) discard;
  float f = hazeAt(dist);
  outColor = vec4(col * f, alpha * f);
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

/** The cloud pattern is tied to the land around here, so it holds still as the map pans. */
const ORIGIN_LNG = -123.0;
const ORIGIN_LAT = 49.4;
const ORIGIN_X = (ORIGIN_LNG + 180) / 360;
const ORIGIN_Y = (1 - Math.asinh(Math.tan((ORIGIN_LAT * Math.PI) / 180)) / Math.PI) / 2;
const KM_PER_UNIT = (EQUATOR_M * Math.cos((ORIGIN_LAT * Math.PI) / 180)) / 1000;
/** Towards the sun in the land's frame (east, south, up): from the south-west, fairly high. */
const SUN = (() => { const v = [-0.5, 0.4, 0.8]; const l = Math.hypot(v[0]!, v[1]!, v[2]!); return v.map((x) => x / l) as [number, number, number]; })();

interface Program {
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = ['u_matrix', 'u_origin', 'u_z', 'u_kmPerUnit', 'u_noise', 'u_drift', 'u_wind', 'u_cam', 'u_threshold', 'u_soft', 'u_thick', 'u_scale', 'u_stretch', 'u_dark', 'u_shade', 'u_seed', 'u_time', 'u_evolve', 'u_oct', 'u_slab', 'u_steps', 'u_sun'];

export class CloudLayer implements CustomLayerInterface {
  readonly id = 'clouds';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private flat: Program | null = null;
  private volume: Program | null = null;
  private noise: WebGLTexture | null = null;
  private vbo: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private sheets: Record<CloudKind, CloudSheet> = { low: { cover: 0.4, baseM: 1200 }, mid: { cover: 0.3, baseM: 3500 }, high: { cover: 0.5, baseM: 8000 } };
  private look: CloudLook = { density: 0.85, storminess: 0, detail: 3, drift: 1, evolve: 1, fluff: 3, lowDepthM: 700 };
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

  private build(g: WebGL2RenderingContext, frag: string): Program {
    const compile = (type: number, src: string) => {
      const sh = g.createShader(type)!;
      g.shaderSource(sh, src);
      g.compileShader(sh);
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error(`clouds shader: ${g.getShaderInfoLog(sh)}`);
      return sh;
    };
    const prog = g.createProgram()!;
    g.attachShader(prog, compile(g.VERTEX_SHADER, VERT));
    g.attachShader(prog, compile(g.FRAGMENT_SHADER, frag));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(`clouds program: ${g.getProgramInfoLog(prog)}`);
    const loc: Program['loc'] = {};
    for (const u of UNIFORMS) loc[u] = g.getUniformLocation(prog, u);
    return { prog, loc };
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    const g = gl as WebGL2RenderingContext;
    this.gl = g;
    this.flat = this.build(g, FRAG_FLAT);
    this.volume = this.build(g, FRAG_VOLUME);

    // A small picture of random numbers: the noise reads it (smoothed) instead of working numbers out per pixel.
    const size = 256;
    const bytes = new Uint8Array(size * size * 4);
    let seed = 1234567;
    for (let i = 0; i < bytes.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      bytes[i] = seed >>> 24;
    }
    this.noise = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.noise);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, size, size, 0, g.RGBA, g.UNSIGNED_BYTE, bytes);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);

    this.vao = g.createVertexArray();
    g.bindVertexArray(this.vao);
    this.vbo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
    g.bufferData(g.ARRAY_BUFFER, 12 * 4, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.bindVertexArray(null);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  onRemove(): void {
    document.removeEventListener('visibilitychange', this.onVisible);
    const g = this.gl;
    if (g) {
      if (this.flat) g.deleteProgram(this.flat.prog);
      if (this.volume) g.deleteProgram(this.volume.prog);
      if (this.noise) g.deleteTexture(this.noise);
      if (this.vbo) g.deleteBuffer(this.vbo);
      if (this.vao) g.deleteVertexArray(this.vao);
    }
    this.map = null; this.gl = null;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const g = gl as WebGL2RenderingContext;
    const map = this.map;
    if (!map || !this.flat) return;
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
    const metresPerUnit = KM_PER_UNIT * 1000;
    const canvas = map.getCanvas();
    const unitsPerPx = 1 / (512 * 2 ** map.getZoom());
    const half = REACH_WIDTHS * canvas.clientWidth * unitsPerPx;
    const quad = this.quad;
    quad.set([cx - half, cy - half, cx + half, cy - half, cx - half, cy + half, cx - half, cy + half, cx + half, cy - half, cx + half, cy + half]);

    // The camera's place, to draw the sheets farthest first, to fade distant cloud and to look through the low
    // cloud: behind and above the map's middle, at the distance the map's field of view puts it.
    const worldPx = 512 * 2 ** map.getZoom();
    const distPx = (0.5 * canvas.clientHeight) / Math.tan(FOV / 2);
    const pitch = (map.getPitch() * Math.PI) / 180, bearing = (map.getBearing() * Math.PI) / 180;
    const back = (distPx * Math.sin(pitch)) / worldPx;
    const camX = cx - back * Math.sin(bearing), camY = cy + back * Math.cos(bearing);
    const groundM = map.queryTerrainElevation(c) ?? 0;
    const camZ = ((distPx * Math.cos(pitch)) / worldPx) + groundM / metresPerUnit;
    const camKm: [number, number, number] = [(camX - ORIGIN_X) * KM_PER_UNIT, (camY - ORIGIN_Y) * KM_PER_UNIT, camZ * KM_PER_UNIT];
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
    const oct = Math.min(5, Math.max(2, Math.round(this.look.detail)));

    g.bindVertexArray(this.vao);
    g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
    g.bufferSubData(g.ARRAY_BUFFER, 0, quad);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.noise);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.enable(g.DEPTH_TEST);
    g.depthFunc(g.LEQUAL);
    g.depthMask(false);
    g.disable(g.CULL_FACE);
    const steps = Math.min(8, Math.max(0, Math.round(this.look.fluff)));
    for (const kind of active) {
      const st = STYLE[kind], sheet = this.sheets[kind];
      const solid = kind === 'low' && steps > 0;
      const P = solid ? this.volume! : this.flat!;
      const L = P.loc;
      const baseKm = drawnHeight(sheet.baseM) / 1000;
      const depthKm = Math.max(0.1, this.look.lowDepthM / 1000);
      g.useProgram(P.prog);
      g.uniformMatrix4fv(L.u_matrix!, false, options.defaultProjectionData.mainMatrix as unknown as Float32Array);
      g.uniform2f(L.u_origin!, ORIGIN_X, ORIGIN_Y);
      g.uniform1f(L.u_kmPerUnit!, KM_PER_UNIT);
      g.uniform1i(L.u_noise!, 0);
      g.uniform2f(L.u_wind!, wx, wy);
      g.uniform3f(L.u_cam!, camKm[0], camKm[1], camKm[2]);
      g.uniform1i(L.u_oct!, solid ? Math.min(3, oct) : oct);
      g.uniform1f(L.u_dark!, this.look.storminess);
      g.uniform1f(L.u_time!, this.clock);
      g.uniform1f(L.u_evolve!, this.look.evolve);
      // Flat sheets are drawn at their base; the low slab at its middle, and looked through.
      g.uniform1f(L.u_z!, (solid ? baseKm + depthKm / 2 : baseKm) * 1000 / metresPerUnit);
      const d = kmPerSec * st.drift * this.clock;
      g.uniform2f(L.u_drift!, wx * d, wy * d);
      g.uniform1f(L.u_threshold!, coverThreshold(sheet.cover, solid ? Math.min(3, oct) : this.look.detail));
      g.uniform1f(L.u_soft!, st.soft);
      g.uniform1f(L.u_thick!, Math.min(1, st.thick * this.look.density * 1.15));
      g.uniform1f(L.u_scale!, st.scale);
      g.uniform1f(L.u_stretch!, st.stretch);
      g.uniform1f(L.u_shade!, st.shade);
      g.uniform1f(L.u_seed!, st.seed);
      if (solid) {
        g.uniform2f(L.u_slab!, baseKm, baseKm + depthKm);
        g.uniform1i(L.u_steps!, steps);
        g.uniform3f(L.u_sun!, SUN[0], SUN[1], SUN[2]);
      }
      g.drawArrays(g.TRIANGLES, 0, 6);
    }
    g.depthMask(true);
    g.bindVertexArray(null);
  }
}
