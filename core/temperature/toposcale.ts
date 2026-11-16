// Temperature at terrain height: TopoSCALE (Fiddes & Gruber 2014), ported from
// Kaden's Windy plugin (docs/reference/windy-plugin/toposcale.ts).
//
// 1. Take pressure-level profiles (height and temperature of each level) on a
//    coarse grid of nodes covering the view (at most 5 × 5).
// 2. Interpolate the PROFILES between the four nodes around a point.
// 3. Read the temperature from that profile at the point's true ground height.
//
// Finished temperatures are never interpolated between nodes, so all terrain
// detail comes from the elevation data. The GPU fill does steps 2 and 3 per
// pixel with the same rules (render/grid-gl/terrain-temperature-layer.ts).
//
// Changes from the plugin: °C instead of K (the app's vocabulary); the
// free-air wind is dropped, since feels-like uses the 10 m wind (ECCC);
// profile time interpolation is left to the picture's crossfade, because
// readouts use real model steps.

/** One node's profile at one time, ordered from the ground up. */
export interface Profile {
  /** Height of each level above sea level (m). */
  gh: Float32Array;
  /** Temperature of each level (°C). */
  temp: Float32Array;
}

export const newProfile = (levels: number): Profile => ({ gh: new Float32Array(levels), temp: new Float32Array(levels) });

/**
 * Node coordinates along one axis. Nodes sit on a fixed lattice (spacing a
 * power-of-two multiple of 0.01°), so small pans reuse the same nodes and
 * their cached forecasts, and a coarser lattice's nodes are a subset of a
 * finer one's. Spacing is at least span/3, which keeps the count at 5 or
 * fewer, and never finer than `minSpacing` (the model's own resolution).
 */
export function latticeAxis(min: number, max: number, minSpacing: number): number[] {
  const desired = Math.max((max - min) / 3, minSpacing, 1e-4);
  const spacing = 0.01 * 2 ** Math.ceil(Math.log2(desired / 0.01));
  const start = Math.floor(min / spacing);
  let end = Math.ceil(max / spacing);
  if (end === start) end++;
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(Math.round(i * spacing * 1e6) / 1e6);
  return out;
}

/** Index of the cell containing v and the weight towards the upper node. */
export function cellOf(axis: readonly number[], v: number): [number, number] {
  let i = 0;
  while (i < axis.length - 2 && axis[i + 1]! < v) i++;
  const w = (v - axis[i]!) / (axis[i + 1]! - axis[i]!);
  return [i, Math.min(1, Math.max(0, w))];
}

/** The nodes of the sampling grid, with each node's profile at one time. */
export interface NodeGrid {
  /** Node latitudes, ascending. */
  lats: number[];
  /** Node longitudes, ascending. */
  lons: number[];
  /** Row-major: profiles[latIndex * lons.length + lonIndex]. */
  profiles: Profile[];
}

/**
 * Temperature at height z (m) from a profile. Linear in height between the
 * bracketing levels; below the lowest or above the highest level it
 * extrapolates linearly from the nearest two.
 */
export function sampleProfile(gh: ArrayLike<number>, temp: ArrayLike<number>, z: number): number {
  const nl = gh.length;
  let k = 1;
  while (k < nl - 1 && gh[k]! < z) k++;
  const dz = gh[k]! - gh[k - 1]!;
  const w = dz !== 0 ? (z - gh[k - 1]!) / dz : 0;
  return temp[k - 1]! + w * (temp[k]! - temp[k - 1]!);
}

/** Bilinear interpolation of the profile between the four nodes around a point, into `out`. */
export function interpolateProfile(grid: NodeGrid, iLat: number, wLat: number, iLon: number, wLon: number, out: Profile): void {
  const nx = grid.lons.length;
  const p00 = grid.profiles[iLat * nx + iLon]!;
  const p01 = grid.profiles[iLat * nx + iLon + 1]!;
  const p10 = grid.profiles[(iLat + 1) * nx + iLon]!;
  const p11 = grid.profiles[(iLat + 1) * nx + iLon + 1]!;
  const w00 = (1 - wLat) * (1 - wLon);
  const w01 = (1 - wLat) * wLon;
  const w10 = wLat * (1 - wLon);
  const w11 = wLat * wLon;
  for (let k = 0; k < out.gh.length; k++) {
    out.gh[k] = w00 * p00.gh[k]! + w01 * p01.gh[k]! + w10 * p10.gh[k]! + w11 * p11.gh[k]!;
    out.temp[k] = w00 * p00.temp[k]! + w01 * p01.temp[k]! + w10 * p10.temp[k]! + w11 * p11.temp[k]!;
  }
}

/** Temperature (°C) and the interpolated profile at one point. */
export function samplePoint(grid: NodeGrid, lat: number, lon: number, elevation: number): { temp: number; profile: Profile } {
  const [iLat, wLat] = cellOf(grid.lats, lat);
  const [iLon, wLon] = cellOf(grid.lons, lon);
  const profile = newProfile(grid.profiles[0]!.gh.length);
  interpolateProfile(grid, iLat, wLat, iLon, wLon, profile);
  return { temp: sampleProfile(profile.gh, profile.temp, elevation), profile };
}

/**
 * The whole raster. `rowLats` and `colLons` give each output row's and
 * column's coordinates; `elevation` holds each pixel's ground height
 * (row-major). Used for the 0 °C line and in tests; the map fill does the
 * same per pixel on the GPU.
 */
export function computeField(grid: NodeGrid, rowLats: ArrayLike<number>, colLons: ArrayLike<number>, elevation: ArrayLike<number>): Float32Array {
  const width = colLons.length;
  const height = rowLats.length;
  const temp = new Float32Array(width * height);
  const colCells = Array.from(colLons, (lon) => cellOf(grid.lons, lon));
  const profile = newProfile(grid.profiles[0]!.gh.length);
  for (let r = 0; r < height; r++) {
    const [iLat, wLat] = cellOf(grid.lats, rowLats[r]!);
    for (let c = 0; c < width; c++) {
      const [iLon, wLon] = colCells[c]!;
      // Interpolate the profiles, never the final temperatures.
      interpolateProfile(grid, iLat, wLat, iLon, wLon, profile);
      const idx = r * width + c;
      temp[idx] = sampleProfile(profile.gh, profile.temp, elevation[idx]!);
    }
  }
  return temp;
}

/**
 * Height (m) of the lowest crossing from above to below 0 °C going up the
 * profile, or null when the whole profile is on one side.
 */
export function freezingLevel(p: Profile): number | null {
  for (let k = 1; k < p.gh.length; k++) {
    const a = p.temp[k - 1]!;
    const b = p.temp[k]!;
    if (a >= 0 && b < 0) return p.gh[k - 1]! + (a / (a - b)) * (p.gh[k]! - p.gh[k - 1]!);
  }
  return null;
}

/**
 * Marching squares for an isotherm on a raster of temperatures (°C). Returns
 * segments in pixel coordinates as a flat [x1, y1, x2, y2, ...] list.
 */
export function isothermSegments(field: ArrayLike<number>, width: number, height: number, level = 0): number[] {
  const segs: number[] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = field[y * width + x]!;
      const tr = field[y * width + x + 1]!;
      const bl = field[(y + 1) * width + x]!;
      const br = field[(y + 1) * width + x + 1]!;
      const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      // Edge crossing points (pixel centres sit at +0.5).
      const top = [x + 0.5 + lerp(tl, tr), y + 0.5];
      const right = [x + 1.5, y + 0.5 + lerp(tr, br)];
      const bottom = [x + 0.5 + lerp(bl, br), y + 1.5];
      const left = [x + 0.5, y + 0.5 + lerp(tl, bl)];
      const add = (p: number[], q: number[]) => segs.push(p[0]!, p[1]!, q[0]!, q[1]!);
      switch (code) {
        case 1: case 14: add(left, bottom); break;
        case 2: case 13: add(bottom, right); break;
        case 3: case 12: add(left, right); break;
        case 4: case 11: add(top, right); break;
        case 6: case 9: add(top, bottom); break;
        case 7: case 8: add(left, top); break;
        case 5: add(left, top); add(bottom, right); break;
        case 10: add(top, right); add(left, bottom); break;
      }
    }
  }
  return segs;
}

/** Join marching-squares segments into polylines, so a line can be dashed and labelled. */
export function joinSegments(segs: readonly number[]): number[][] {
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const n = segs.length / 4;
  const used = new Uint8Array(n);
  const ends = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const k of [key(segs[i * 4]!, segs[i * 4 + 1]!), key(segs[i * 4 + 2]!, segs[i * 4 + 3]!)]) {
      const list = ends.get(k);
      if (list) list.push(i); else ends.set(k, [i]);
    }
  }
  const other = (i: number, x: number, y: number): [number, number] => {
    const a = key(segs[i * 4]!, segs[i * 4 + 1]!) === key(x, y);
    return a ? [segs[i * 4 + 2]!, segs[i * 4 + 3]!] : [segs[i * 4]!, segs[i * 4 + 1]!];
  };
  const lines: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const line = [segs[s * 4]!, segs[s * 4 + 1]!, segs[s * 4 + 2]!, segs[s * 4 + 3]!];
    // Grow from the tail, then from the head.
    for (const atHead of [false, true]) {
      for (;;) {
        const x = atHead ? line[0]! : line[line.length - 2]!;
        const y = atHead ? line[1]! : line[line.length - 1]!;
        const next = (ends.get(key(x, y)) ?? []).find((i) => !used[i]);
        if (next === undefined) break;
        used[next] = 1;
        const [nx, ny] = other(next, x, y);
        if (atHead) line.unshift(nx, ny); else line.push(nx, ny);
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Tidy a marching-squares line for drawing: drop points within `tolerance`
 * of a straight run (Douglas–Peucker), then round the corners (two passes of
 * Chaikin's cutting). Flat [x, y, ...] in and out; the ends stay put.
 */
export function smoothLine(line: readonly number[], tolerance = 1): number[] {
  const n = line.length / 2;
  if (n < 3) return [...line];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = line[a * 2]!, ay = line[a * 2 + 1]!, bx = line[b * 2]!, by = line[b * 2 + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1, dist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const px = line[i * 2]!, py = line[i * 2 + 1]!;
      // A closed loop's ends meet: measure from the end point instead of a line.
      const d = len > 1e-9 ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay);
      if (d > dist) { dist = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  let pts: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) pts.push(line[i * 2]!, line[i * 2 + 1]!);
  for (let pass = 0; pass < 2; pass++) {
    const m = pts.length / 2;
    if (m < 3) break;
    const out = [pts[0]!, pts[1]!];
    for (let i = 0; i < m - 1; i++) {
      const x0 = pts[i * 2]!, y0 = pts[i * 2 + 1]!, x1 = pts[i * 2 + 2]!, y1 = pts[i * 2 + 3]!;
      out.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    out.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
    pts = out;
  }
  return pts;
}
