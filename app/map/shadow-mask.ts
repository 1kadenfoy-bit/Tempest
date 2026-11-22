// Where mountains block the sun (Maps section): for each cell of a height grid, how far
// into shadow it is, found by looking from the cell toward the sun along the ground and
// asking whether anything rises above the sun's line. Pure numbers: no map, no browser.
//
// A cell is in shadow when, some distance d toward the sun, the ground is higher than
// cell height + d * tan(sun height). The edge is softened over a few metres of height,
// so a shadow's edge fades in rather than cutting hard (the sun is a disc, not a point).

/** Metres of height over which a shadow's edge fades from lit to dark. */
const SOFT_M = 30;
const STEPS = 64;

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export interface ShadowOptions {
  /** Metres from one cell to the next. */
  cellM: number;
  /** Sun direction in degrees clockwise from north. */
  azimuth: number;
  /** Sun height in degrees above the horizon (above 0). */
  altitude: number;
  /** The longest shadow looked for, in metres. */
  maxM?: number;
}

/**
 * Shadow depth, 0 (lit) to 255 (fully shaded), for a grid of heights in metres.
 * Rows run north to south, columns west to east.
 */
export function shadowMask(heights: Float32Array, width: number, height: number, o: ShadowOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  const tan = Math.tan((Math.max(0.5, o.altitude) * Math.PI) / 180);
  // A 4 km range of relief casts up to 4000 / tan(height) metres of shadow; capped so low sun stays quick.
  const maxM = Math.min(o.maxM ?? 14_000, 4000 / tan);
  const maxCells = maxM / o.cellM;
  // Toward the sun: east is +x, north is -y (rows run north to south).
  const dx = Math.sin((o.azimuth * Math.PI) / 180);
  const dy = -Math.cos((o.azimuth * Math.PI) / 180);
  // Distances to look at, in cells: close together near the cell, wider apart far away.
  const dist = Array.from({ length: STEPS }, (_, i) => Math.max(1, maxCells * ((i + 1) / STEPS) ** 1.35));
  const rise = dist.map((d) => d * o.cellM * tan); // height the sun's line gains by then
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h0 = heights[y * width + x]!;
      let depth = 0;
      for (let i = 0; i < STEPS; i++) {
        const sx = Math.round(x + dx * dist[i]!), sy = Math.round(y + dy * dist[i]!);
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) break;
        const over = heights[sy * width + sx]! - (h0 + rise[i]!);
        if (over > 0) {
          depth = Math.max(depth, smooth(over / SOFT_M));
          if (depth >= 1) break;
        }
      }
      out[y * width + x] = Math.round(depth * 255);
    }
  }
  return out;
}

/** Every `k`-th cell of a grid, for a smaller grid that is quicker to look through (peaks are kept: each block gives its highest cell). */
export function shrinkMax(heights: Float32Array, width: number, height: number, k: number): { data: Float32Array; width: number; height: number } {
  if (k <= 1) return { data: heights, width, height };
  const w = Math.floor(width / k), h = Math.floor(height / k);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) m = Math.max(m, heights[(y * k + j) * width + x * k + i]!);
      data[y * w + x] = m;
    }
  }
  return { data, width: w, height: h };
}
