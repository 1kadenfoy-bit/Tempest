// Temperature at the terrain, per pixel on the GPU (TopoSCALE, as in
// core/temperature/toposcale.ts).
//
// Inputs, all as numbers: an elevation mosaic for the view (metres, from the
// terrain tiles), and the profiles of a coarse lattice of nodes (height and
// temperature of each pressure level). For each pixel the shader blends the
// four surrounding nodes' PROFILES, reads the profile at the pixel's ground
// height, and colours the result from a lookup strip. Changing hours blends
// the two hours' profiles (never finished temperatures) over a fifth of a
// second; readouts use the real hours.
import type { CustomLayerInterface, CustomRenderMethodInput, CustomTerrainRenderInput, Map as MapLibreMap } from 'maplibre-gl';
import { DrapeRevision, tileMatrix } from './terrain-drape';

export type RGBA = [number, number, number, number];

export interface ElevationMosaic {
  /** Web Mercator 0..1 box: west x, north y, east x, south y. */
  merc: [number, number, number, number];
  width: number;
  height: number;
  /** Rows north to south, metres. */
  data: Float32Array;
  key: string;
}

export interface ProfileLattice {
  /** Node longitudes and latitudes, ascending and evenly spaced. */
  lons: number[];
  lats: number[];
  levels: number;
  /**
   * Per node (row-major, lat then lon), levels + 1 pairs: [height, temperature]
   * for each level, then [10 m wind km/h, dew point °C] for feels-like.
   */
  data: Float32Array;
}

export interface TemperatureStyle {
  strip: RGBA[];
  min: number;
  max: number;
  opacity: number;
}

const VERT = `#version 300 es
in vec2 a_pos;
uniform mat4 u_matrix;
out vec2 v_merc;
void main() {
  v_merc = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const fragment = (levels: number) => `#version 300 es
precision highp float;
#define NL ${levels}
in vec2 v_merc;
uniform highp sampler2D u_dem;
uniform highp sampler2D u_profA;
uniform highp sampler2D u_profB;
uniform sampler2D u_strip;
uniform vec4 u_demBox;
uniform vec2 u_demSize;
uniform vec4 u_lattice; // lon0, lat0, dlon, dlat
uniform vec2 u_nodes;   // nlon, nlat
uniform float u_t;
uniform vec2 u_range;
uniform float u_opacity;
uniform bool u_feels;
out vec4 fragColor;

float dem(vec2 merc) {
  vec2 uv = (merc - u_demBox.xy) / (u_demBox.zw - u_demBox.xy) * u_demSize - 0.5;
  vec2 f = fract(uv);
  ivec2 i0 = ivec2(floor(uv));
  ivec2 mx = ivec2(u_demSize) - 1;
  float a = texelFetch(u_dem, clamp(i0, ivec2(0), mx), 0).r;
  float b = texelFetch(u_dem, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).r;
  float c = texelFetch(u_dem, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).r;
  float d = texelFetch(u_dem, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// One level of the profile, blended between the four nodes and the two hours.
vec2 level(int k, ivec4 n, vec2 w) {
  vec2 a = mix(mix(texelFetch(u_profA, ivec2(k, n.x), 0).rg, texelFetch(u_profA, ivec2(k, n.y), 0).rg, w.x),
               mix(texelFetch(u_profA, ivec2(k, n.z), 0).rg, texelFetch(u_profA, ivec2(k, n.w), 0).rg, w.x), w.y);
  vec2 b = mix(mix(texelFetch(u_profB, ivec2(k, n.x), 0).rg, texelFetch(u_profB, ivec2(k, n.y), 0).rg, w.x),
               mix(texelFetch(u_profB, ivec2(k, n.z), 0).rg, texelFetch(u_profB, ivec2(k, n.w), 0).rg, w.x), w.y);
  return mix(a, b, u_t);
}

void main() {
  float lon = v_merc.x * 360.0 - 180.0;
  float lat = degrees(atan(sinh(3.14159265358979 * (1.0 - 2.0 * v_merc.y))));
  vec2 g = vec2((lon - u_lattice.x) / u_lattice.z, (lat - u_lattice.y) / u_lattice.w);
  vec2 cells = u_nodes - 1.0;
  if (g.x < 0.0 || g.y < 0.0 || g.x > cells.x || g.y > cells.y) discard;
  vec2 c0 = min(floor(g), cells - 1.0);
  vec2 w = clamp(g - c0, 0.0, 1.0);
  int nlon = int(u_nodes.x);
  int i00 = int(c0.y) * nlon + int(c0.x);
  ivec4 n = ivec4(i00, i00 + 1, i00 + nlon, i00 + nlon + 1);
  // Sea and lakes read at sea level (the terrain carries depths below it).
  float z = max(0.0, dem(v_merc));
  vec2 lo = level(0, n, w);
  vec2 hi = level(1, n, w);
  for (int k = 2; k < NL; k++) {
    if (hi.x >= z) break;
    lo = hi;
    hi = level(k, n, w);
  }
  float dz = hi.x - lo.x;
  float temp = lo.y + (dz != 0.0 ? (z - lo.x) / dz : 0.0) * (hi.y - lo.y);
  if (u_feels) {
    // ECCC wind chill or humidex, as the readout (core/temperature/feels-like.ts).
    vec2 sw = level(NL, n, w); // 10 m wind (km/h), dew point (°C)
    if (temp <= 0.0 && sw.x >= 5.0) {
      float v16 = pow(sw.x, 0.16);
      temp = 13.12 + 0.6215 * temp - 11.37 * v16 + 0.3965 * temp * v16;
    } else if (temp >= 20.0) {
      float e = 6.11 * exp(5417.753 * (1.0 / 273.16 - 1.0 / (273.15 + sw.y)));
      float hx = temp + 0.5555 * (e - 10.0);
      if (hx >= 25.0 && hx - temp >= 1.0) temp = hx;
    }
  }
  float x = clamp((temp - u_range.x) / (u_range.y - u_range.x), 0.0, 1.0);
  vec4 c = texture(u_strip, vec2(x, 0.5));
  float a = c.a * u_opacity;
  fragColor = vec4(c.rgb * a, a);
}`;

const toMercX = (lon: number) => (lon + 180) / 360;
const toMercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2;
};

export class TerrainTemperatureLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private strip: WebGLTexture | null = null;
  private demTex: WebGLTexture | null = null;
  private dem: ElevationMosaic | null = null;
  private profCur: { lattice: ProfileLattice; tex: WebGLTexture } | null = null;
  private profPrev: { lattice: ProfileLattice; tex: WebGLTexture } | null = null;
  private fadeStart = 0;
  private readonly fadeMs = 200;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private drape = new DrapeRevision();
  private _visible = true;
  get visible(): boolean { return this._visible; }
  set visible(v: boolean) { if (v !== this._visible) { this._visible = v; this.drape.changed(this.map); } }
  private _feels = false;
  /** Colour feels-like (wind chill, humidex) instead of air temperature. */
  get feels(): boolean { return this._feels; }
  set feels(v: boolean) { if (v !== this._feels) { this._feels = v; this.drape.changed(this.map); } }

  constructor(readonly id: string, private style: TemperatureStyle, private levels: number) {}

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    const g = gl as WebGL2RenderingContext;
    this.gl = g;
    const compile = (type: number, src: string) => {
      const sh = g.createShader(type)!;
      g.shaderSource(sh, src);
      g.compileShader(sh);
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error(`shader: ${g.getShaderInfoLog(sh)}`);
      return sh;
    };
    const p = g.createProgram()!;
    g.attachShader(p, compile(g.VERTEX_SHADER, VERT));
    g.attachShader(p, compile(g.FRAGMENT_SHADER, fragment(this.levels)));
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(`program: ${g.getProgramInfoLog(p)}`);
    this.program = p;
    for (const u of ['u_matrix', 'u_dem', 'u_profA', 'u_profB', 'u_strip', 'u_demBox', 'u_demSize', 'u_lattice', 'u_nodes', 'u_t', 'u_range', 'u_opacity', 'u_feels']) {
      this.loc[u] = g.getUniformLocation(p, u);
    }
    this.buffer = g.createBuffer();
    this.uploadStrip();
    if (this.dem) this.setElevation(this.dem);
  }

  onRemove(): void {
    const g = this.gl;
    if (!g) return;
    for (const t of [this.demTex, this.strip, this.profCur?.tex, this.profPrev?.tex]) if (t) g.deleteTexture(t);
    if (this.buffer) g.deleteBuffer(this.buffer);
    if (this.program) g.deleteProgram(this.program);
    this.demTex = this.strip = null;
    this.profCur = this.profPrev = null;
    this.gl = null;
  }

  setElevation(m: ElevationMosaic): void {
    this.dem = m;
    const g = this.gl;
    if (!g) return;
    if (!this.demTex) this.demTex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.demTex);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.R32F, m.width, m.height, 0, g.RED, g.FLOAT, m.data);
    this.nearest(g);
    this.drape.changed(this.map);
  }

  get elevationKey(): string | null { return this.dem?.key ?? null; }

  /** Show these profiles; the previous ones blend into them when the lattice is the same. */
  setProfiles(l: ProfileLattice | null): void {
    const g = this.gl;
    if (!g) return;
    if (this.profPrev) g.deleteTexture(this.profPrev.tex);
    this.profPrev = null;
    if (!l) {
      if (this.profCur) g.deleteTexture(this.profCur.tex);
      this.profCur = null;
      this.drape.changed(this.map);
      return;
    }
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RG32F, l.levels + 1, l.lons.length * l.lats.length, 0, g.RG, g.FLOAT, l.data);
    this.nearest(g);
    const same = this.profCur && this.profCur.lattice.lons.join() === l.lons.join() && this.profCur.lattice.lats.join() === l.lats.join();
    if (same) this.profPrev = this.profCur;
    else if (this.profCur) g.deleteTexture(this.profCur.tex);
    this.profCur = { lattice: l, tex };
    this.fadeStart = performance.now();
    this.drape.changed(this.map);
  }

  private nearest(g: WebGL2RenderingContext) {
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }

  private uploadStrip(): void {
    const g = this.gl;
    if (!g) return;
    const row = this.style.strip;
    const bytes = new Uint8Array(row.length * 4);
    row.forEach((c, i) => { bytes[i * 4] = c[0]; bytes[i * 4 + 1] = c[1]; bytes[i * 4 + 2] = c[2]; bytes[i * 4 + 3] = Math.round(c[3] * 255); });
    if (!this.strip) this.strip = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.strip);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, row.length, 1, 0, g.RGBA, g.UNSIGNED_BYTE, bytes);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    this.draw(gl as WebGL2RenderingContext, options.defaultProjectionData.mainMatrix as unknown as Float32Array);
  }

  /** With 3D terrain: the same picture into one terrain tile, which MapLibre drapes over the terrain. */
  renderToTerrainTile(gl: WebGL2RenderingContext, input: CustomTerrainRenderInput): void {
    this.draw(gl, tileMatrix(input.tileID));
  }

  get terrainTileRevision(): number { return this.drape.value; }

  private draw(gl: WebGL2RenderingContext, matrix: Float32Array): void {
    const g = gl as WebGL2RenderingContext;
    const cur = this.profCur;
    if (!this.visible || !this.program || !cur || !this.demTex || !this.dem) return;
    const t = Math.min(1, (performance.now() - this.fadeStart) / this.fadeMs);
    const prev = t < 1 ? this.profPrev : null;
    const l = cur.lattice;
    g.useProgram(this.program);
    g.uniformMatrix4fv(this.loc.u_matrix!, false, matrix);
    g.uniform4f(this.loc.u_demBox!, ...this.dem.merc);
    g.uniform2f(this.loc.u_demSize!, this.dem.width, this.dem.height);
    g.uniform4f(this.loc.u_lattice!, l.lons[0]!, l.lats[0]!, l.lons[1]! - l.lons[0]!, l.lats[1]! - l.lats[0]!);
    g.uniform2f(this.loc.u_nodes!, l.lons.length, l.lats.length);
    // Blend from the previous hour (A) to the current (B).
    g.uniform1f(this.loc.u_t!, prev ? t : 1);
    g.uniform2f(this.loc.u_range!, this.style.min, this.style.max);
    g.uniform1f(this.loc.u_opacity!, this.style.opacity);
    g.uniform1i(this.loc.u_feels!, this.feels ? 1 : 0);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, this.demTex); g.uniform1i(this.loc.u_dem!, 0);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, prev ? prev.tex : cur.tex); g.uniform1i(this.loc.u_profA!, 1);
    g.activeTexture(g.TEXTURE2); g.bindTexture(g.TEXTURE_2D, cur.tex); g.uniform1i(this.loc.u_profB!, 2);
    g.activeTexture(g.TEXTURE3); g.bindTexture(g.TEXTURE_2D, this.strip); g.uniform1i(this.loc.u_strip!, 3);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.disable(g.DEPTH_TEST);
    g.disable(g.STENCIL_TEST);
    // Draw over the mosaic's box, clipped to the lattice in the shader.
    const [mx0, my0, mx1, my1] = this.dem.merc;
    const x0 = Math.max(mx0, toMercX(l.lons[0]!)), x1 = Math.min(mx1, toMercX(l.lons[l.lons.length - 1]!));
    const y0 = Math.max(my0, toMercY(l.lats[l.lats.length - 1]!)), y1 = Math.min(my1, toMercY(l.lats[0]!));
    if (x1 <= x0 || y1 <= y0) return;
    g.bindBuffer(g.ARRAY_BUFFER, this.buffer);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]), g.STREAM_DRAW);
    const aPos = g.getAttribLocation(this.program, 'a_pos');
    g.enableVertexAttribArray(aPos);
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);
    g.drawArrays(g.TRIANGLES, 0, 6);
    if (t < 1) this.drape.changed(this.map);
  }
}
