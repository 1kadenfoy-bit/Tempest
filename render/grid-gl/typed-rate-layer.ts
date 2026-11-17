// The app's own grid renderer (replaces the starter library's drawing).
//
// A MapLibre custom layer in WebGL 2. Each grid field arrives as two numbers
// per cell: an amount rate, and the part of it of the second kind (for
// precipitation: total and snow water, in mm/h). The shader blends between
// cells (bilinear, done by hand so it works without float-texture filtering),
// works out the share per pixel, and colours from lookup strips: three rows
// (first kind, mixed, second kind) blended by the share. Values reach the GPU
// as numbers; colour is applied on the device. Changing steps cross-fades the
// picture; readouts never see the blend.
import type { CustomLayerInterface, CustomRenderMethodInput, CustomTerrainRenderInput, Map as MapLibreMap } from 'maplibre-gl';
import { DrapeRevision, tileMatrix } from './terrain-drape';

export type RGBA = [number, number, number, number];

export interface DrawField {
  /** Identifies the grid's box and spacing, so steps on the same grid can blend. */
  gridKey: string;
  bbox: [number, number, number, number];
  nx: number;
  ny: number;
  /** nx * ny * 2 values, rows south to north: [rate, part rate, ...]. */
  data: Float32Array;
}

/** A share field on the terrain: Web Mercator box (west x, north y, east x, south y), rows north to south. */
export interface ShareField { merc: [number, number, number, number]; width: number; height: number; data: Float32Array }

export interface TypedRateStyle {
  /** Three rows of the same length: first kind, mixed, second kind. Alpha 0..1. */
  strips: [RGBA[], RGBA[], RGBA[]];
  /** Rate at the right end of the strips. */
  max: number;
  /** Share of the second kind where mixed starts and where the second kind is full. */
  mixedFrom: number;
  secondFrom: number;
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

const FRAG = `#version 300 es
precision highp float;
in vec2 v_merc;
uniform highp sampler2D u_cur;
uniform highp sampler2D u_prev;
uniform sampler2D u_strip;
uniform float u_t;
uniform bool u_hasPrev;
uniform vec4 u_bbox;
uniform vec2 u_size;
uniform float u_max;
uniform float u_opacity;
uniform vec2 u_share;
uniform highp sampler2D u_shareTex;
uniform bool u_hasShare;
uniform vec4 u_shareBox;
uniform vec2 u_shareSize;
out vec4 fragColor;

// The second kind's share from a field on the terrain (wet-bulb at the ground),
// when one covers this pixel; -1 when not.
float shareField(vec2 merc) {
  if (!u_hasShare) return -1.0;
  vec2 uv = (merc - u_shareBox.xy) / (u_shareBox.zw - u_shareBox.xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1.0;
  vec2 p = uv * u_shareSize - 0.5;
  vec2 f = fract(p);
  ivec2 i0 = ivec2(floor(p));
  ivec2 mx = ivec2(u_shareSize) - 1;
  float a = texelFetch(u_shareTex, clamp(i0, ivec2(0), mx), 0).r;
  float b = texelFetch(u_shareTex, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).r;
  float c = texelFetch(u_shareTex, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).r;
  float d = texelFetch(u_shareTex, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 bilinear(highp sampler2D tex, vec2 uv) {
  vec2 p = uv - 0.5;
  vec2 f = fract(p);
  ivec2 i0 = ivec2(floor(p));
  ivec2 mx = ivec2(u_size) - 1;
  vec2 a = texelFetch(tex, clamp(i0, ivec2(0), mx), 0).rg;
  vec2 b = texelFetch(tex, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).rg;
  vec2 c = texelFetch(tex, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).rg;
  vec2 d = texelFetch(tex, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).rg;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float lon = v_merc.x * 360.0 - 180.0;
  float lat = degrees(atan(sinh(3.14159265358979 * (1.0 - 2.0 * v_merc.y))));
  vec2 uv = vec2((lon - u_bbox.x) / (u_bbox.z - u_bbox.x), (lat - u_bbox.y) / (u_bbox.w - u_bbox.y)) * u_size;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > u_size.x || uv.y > u_size.y) discard;
  vec2 v = bilinear(u_cur, uv);
  if (u_hasPrev) v = mix(bilinear(u_prev, uv), v, u_t);
  float rate = v.x;
  if (rate <= 0.0) discard;
  float sf = shareField(v_merc);
  float share = sf >= 0.0 ? sf : clamp(v.y / rate, 0.0, 1.0);
  float x = clamp(rate / u_max, 0.0, 1.0);
  vec4 first = texture(u_strip, vec2(x, 1.0 / 6.0));
  vec4 mixed = texture(u_strip, vec2(x, 0.5));
  vec4 second = texture(u_strip, vec2(x, 5.0 / 6.0));
  float wSecond = smoothstep(u_share.x + (u_share.y - u_share.x) * 0.5, u_share.y, share);
  float wFirst = 1.0 - smoothstep(u_share.x, u_share.x + (u_share.y - u_share.x) * 0.5, share);
  float wMixed = max(0.0, 1.0 - wFirst - wSecond);
  vec4 c = first * wFirst + mixed * wMixed + second * wSecond;
  float a = c.a * u_opacity;
  if (a <= 0.0) discard;
  fragColor = vec4(c.rgb * a, a);
}`;

const toMercX = (lon: number) => (lon + 180) / 360;
const toMercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2;
};

interface GpuField { field: DrawField; tex: WebGLTexture }

export class TypedRateLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private strip: WebGLTexture | null = null;
  private current: GpuField[] = [];
  private previous: GpuField[] = [];
  private fadeStart = 0;
  private readonly fadeMs = 200;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private drape = new DrapeRevision();

  constructor(readonly id: string, private style: TypedRateStyle) {}

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
    g.attachShader(p, compile(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(`program: ${g.getProgramInfoLog(p)}`);
    this.program = p;
    for (const u of ['u_matrix', 'u_cur', 'u_prev', 'u_strip', 'u_t', 'u_hasPrev', 'u_bbox', 'u_size', 'u_max', 'u_opacity', 'u_share', 'u_shareTex', 'u_hasShare', 'u_shareBox', 'u_shareSize']) {
      this.loc[u] = g.getUniformLocation(p, u);
    }
    this.buffer = g.createBuffer();
    this.uploadStrip();
  }

  onRemove(): void {
    const g = this.gl;
    if (!g) return;
    for (const f of [...this.current, ...this.previous]) g.deleteTexture(f.tex);
    if (this.strip) g.deleteTexture(this.strip);
    if (this.shareTex) g.deleteTexture(this.shareTex);
    this.shareTex = null;
    if (this.buffer) g.deleteBuffer(this.buffer);
    if (this.program) g.deleteProgram(this.program);
    this.current = [];
    this.previous = [];
  }

  private shareTex: WebGLTexture | null = null;
  private shareField: ShareField | null = null;

  /**
   * A field of the second kind's share on the terrain (for precipitation: snow
   * from the wet-bulb at the ground), which replaces the per-cell share where
   * it covers, so the colours follow the same rule as the snow line. Null
   * returns to the model's own split.
   */
  setShare(f: ShareField | null): void {
    this.shareField = f;
    const g = this.gl;
    if (!g) return;
    if (!f) { this.drape.changed(this.map); return; }
    if (!this.shareTex) this.shareTex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.shareTex);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.R32F, f.width, f.height, 0, g.RED, g.FLOAT, f.data);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    this.drape.changed(this.map);
  }

  setStyle(style: TypedRateStyle): void {
    this.style = style;
    this.uploadStrip();
    this.drape.changed(this.map);
  }

  /** Show these fields; the previous ones on the same grid fade out under them. */
  setFields(fields: DrawField[]): void {
    const g = this.gl;
    if (!g) return;
    for (const f of this.previous) g.deleteTexture(f.tex);
    this.previous = this.current;
    this.current = fields.map((field) => ({ field, tex: this.uploadField(field) }));
    this.fadeStart = performance.now();
    this.drape.changed(this.map);
  }

  private uploadField(f: DrawField): WebGLTexture {
    const g = this.gl!;
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RG32F, f.nx, f.ny, 0, g.RG, g.FLOAT, f.data);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return tex;
  }

  private uploadStrip(): void {
    const g = this.gl;
    if (!g) return;
    const rows = this.style.strips;
    const w = rows[0].length;
    const bytes = new Uint8Array(w * 3 * 4);
    rows.forEach((row, r) => row.forEach((c, i) => {
      const o = (r * w + i) * 4;
      bytes[o] = c[0]; bytes[o + 1] = c[1]; bytes[o + 2] = c[2]; bytes[o + 3] = Math.round(c[3] * 255);
    }));
    if (!this.strip) this.strip = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.strip);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, w, 3, 0, g.RGBA, g.UNSIGNED_BYTE, bytes);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    this.draw(gl as WebGL2RenderingContext, options.defaultProjectionData.mainMatrix as unknown as Float32Array, true);
  }

  /**
   * With 3D terrain: the same picture into one terrain tile, which MapLibre
   * drapes over the terrain. No cross-fade here: MapLibre redraws changed
   * tiles a few per frame, so a fade would cost a full redraw of every tile
   * per frame and still arrive unevenly. Steps change at once instead.
   */
  renderToTerrainTile(gl: WebGL2RenderingContext, input: CustomTerrainRenderInput): void {
    this.draw(gl, tileMatrix(input.tileID), false);
  }

  get terrainTileRevision(): number { return this.drape.value; }

  private draw(gl: WebGL2RenderingContext, matrix: Float32Array, fade: boolean): void {
    const g = gl as WebGL2RenderingContext;
    if (!this.program || !this.current.length) return;
    const t = fade ? Math.min(1, (performance.now() - this.fadeStart) / this.fadeMs) : 1;
    g.useProgram(this.program);
    // Projects 0..1 web-mercator coordinates (MapLibre 6: defaultProjectionData.mainMatrix).
    g.uniformMatrix4fv(this.loc.u_matrix!, false, matrix);
    g.uniform1f(this.loc.u_max!, this.style.max);
    g.uniform1f(this.loc.u_opacity!, this.style.opacity);
    g.uniform2f(this.loc.u_share!, this.style.mixedFrom, this.style.secondFrom);
    g.uniform1f(this.loc.u_t!, t);
    g.activeTexture(g.TEXTURE2);
    g.bindTexture(g.TEXTURE_2D, this.strip);
    g.uniform1i(this.loc.u_strip!, 2);
    const sf = this.shareField;
    g.uniform1i(this.loc.u_hasShare!, sf && this.shareTex ? 1 : 0);
    g.activeTexture(g.TEXTURE3);
    g.bindTexture(g.TEXTURE_2D, this.shareTex ?? this.strip);
    g.uniform1i(this.loc.u_shareTex!, 3);
    if (sf) {
      g.uniform4f(this.loc.u_shareBox!, ...sf.merc);
      g.uniform2f(this.loc.u_shareSize!, sf.width, sf.height);
    }
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.disable(g.DEPTH_TEST);
    g.disable(g.STENCIL_TEST);

    for (const cur of this.current) {
      const f = cur.field;
      const prev = t < 1 ? this.previous.find((p) => p.field.gridKey === f.gridKey) : undefined;
      const [w, s, e, n] = f.bbox;
      const x0 = toMercX(w), x1 = toMercX(e), y0 = toMercY(n), y1 = toMercY(s);
      g.bindBuffer(g.ARRAY_BUFFER, this.buffer);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]), g.STREAM_DRAW);
      const aPos = g.getAttribLocation(this.program, 'a_pos');
      g.enableVertexAttribArray(aPos);
      g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, cur.tex);
      g.uniform1i(this.loc.u_cur!, 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, prev ? prev.tex : cur.tex);
      g.uniform1i(this.loc.u_prev!, 1);
      g.uniform1i(this.loc.u_hasPrev!, prev ? 1 : 0);
      g.uniform4f(this.loc.u_bbox!, w, s, e, n);
      g.uniform2f(this.loc.u_size!, f.nx, f.ny);
      g.drawArrays(g.TRIANGLES, 0, 6);
    }
    if (t < 1) this.drape.changed(this.map);
  }
}
