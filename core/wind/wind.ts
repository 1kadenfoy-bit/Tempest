// Wind at the terrain (M7). The model gives wind 10 m above its own, smoothed
// ground, and wind on pressure levels higher up. A ridge that stands above the
// model's ground reaches into the stronger wind aloft; a valley cut below it
// keeps the 10 m wind. So, per point:
//
// 1. Estimate the model's ground there: the real terrain smoothed over one
//    model grid cell (the files carry no surface pressure or model terrain).
// 2. Build the wind profile from the ground up: the 10 m wind at 10 m above
//    the model's ground, then each pressure level above that.
// 3. Read the profile at the point's true ground height, as east and north
//    parts (never speeds), so a turning wind is blended correctly.
//
// Profiles are blended between nodes and hours, never finished speeds
// (architecture: interpolate profiles, never finished values). The GPU fill
// does the same per pixel (render/grid-gl/terrain-wind-layer.ts).

/** One place's wind profile at one time, from the ground up. */
export interface WindProfile {
  /** Height of each pressure level above sea level (m). */
  gh: ArrayLike<number>;
  /** East and north parts of the wind on each level (km/h, towards). */
  u: ArrayLike<number>;
  v: ArrayLike<number>;
  /** 10 m wind, east and north parts (km/h). */
  u10: number;
  v10: number;
  /** 10 m wind speed and strongest gust (km/h). */
  speed10: number;
  gust10: number;
}

/** East and north parts (towards) of a wind blowing FROM `dir` degrees. */
export function toUV(speed: number, dir: number): [number, number] {
  const r = (dir * Math.PI) / 180;
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
}

/** Speed and the direction it blows FROM (0–360°, 0 = from the north). */
export function fromUV(u: number, v: number): { speed: number; dir: number } {
  const speed = Math.hypot(u, v);
  const dir = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return { speed, dir };
}

const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Eight-point compass name for a direction the wind blows from. */
export function compass(dir: number): string {
  return POINTS8[Math.round((((dir % 360) + 360) % 360) / 45) % 8]!;
}

/**
 * Wind (east and north parts, km/h) at height `z` above sea level, where the
 * model's ground is `ground`. Below 10 m above the model's ground it is the
 * 10 m wind; between that and the first pressure level above it, a straight
 * blend; then level to level; above the top level it holds the top level.
 */
export function windAtHeight(p: WindProfile, z: number, ground: number): [number, number] {
  const base = ground + 10;
  if (!(z > base)) return [p.u10, p.v10];
  const n = p.gh.length;
  let k = 0;
  while (k < n && !(p.gh[k]! > base)) k++;
  if (k === n) return [p.u10, p.v10];
  let lo = { h: base, u: p.u10, v: p.v10 };
  for (; k < n; k++) {
    const hi = { h: p.gh[k]!, u: p.u[k]!, v: p.v[k]! };
    if (z <= hi.h) {
      const w = hi.h > lo.h ? (z - lo.h) / (hi.h - lo.h) : 0;
      return [lo.u + w * (hi.u - lo.u), lo.v + w * (hi.v - lo.v)];
    }
    lo = hi;
  }
  return [lo.u, lo.v];
}

/**
 * Largest gust factor applied to the wind at the terrain. The model's 10 m
 * gust factor comes from its sheltered, rough ground (often 2 to 3 in light
 * wind); exposed ridges see about 1.3 to 1.6. Without a cap, a 40 km/h ridge
 * wind under a gusty valley read as 90+ km/h gusts (checked Nov 17, Mt Seymour).
 */
export const MAX_GUST_FACTOR = 1.5;

/**
 * Gust at a point whose sustained wind is `speed`, from the model's 10 m wind
 * and gust there. Gusts scale with the wind (the 10 m gust factor), at least
 * the 10 m gust's excess over the wind, and never less than the wind itself.
 * At the model's ground this gives back the 10 m gust exactly.
 */
export function gustAt(speed: number, speed10: number, gust10: number): number {
  if (!Number.isFinite(gust10) || !Number.isFinite(speed10)) return speed;
  const factor = Math.min(MAX_GUST_FACTOR, Math.max(1, gust10 / Math.max(speed10, 5)));
  return Math.max(speed, speed * factor, speed + (gust10 - speed10));
}

/** Wind at a point's ground: speed, gust and direction. */
export interface TerrainWind { speed: number; gust: number; dir: number; u: number; v: number }

export function terrainWind(p: WindProfile, z: number, ground: number): TerrainWind {
  const [u, v] = windAtHeight(p, z, ground);
  const { speed, dir } = fromUV(u, v);
  return { speed, gust: gustAt(speed, p.speed10, p.gust10), dir, u, v };
}

/**
 * The model's own ground, estimated by smoothing a terrain grid over one
 * model cell (a box blur `radius` cells wide on each side). Rows and columns
 * as in the input; edges average what is inside the grid.
 */
export function smoothGround(data: ArrayLike<number>, width: number, height: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  const out = new Float32Array(width * height);
  if (r === 0) { for (let i = 0; i < out.length; i++) out[i] = Math.max(0, data[i]!); return out; }
  const tmp = new Float32Array(width * height);
  // Rows, then columns, with running sums (sea and lakes count as sea level).
  for (let y = 0; y < height; y++) {
    let sum = 0, count = 0;
    const at = (x: number) => Math.max(0, data[y * width + x]!);
    for (let x = 0; x <= Math.min(r, width - 1); x++) { sum += at(x); count++; }
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / count;
      const add = x + r + 1, drop = x - r;
      if (add < width) { sum += at(add); count++; }
      if (drop >= 0) { sum -= at(drop); count--; }
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0, count = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y++) { sum += tmp[y * width + x]!; count++; }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / count;
      const add = y + r + 1, drop = y - r;
      if (add < height) { sum += tmp[add * width + x]!; count++; }
      if (drop >= 0) { sum -= tmp[drop * width + x]!; count--; }
    }
  }
  return out;
}

/** The next stretch of calm (speed below `threshold`) at or after step `from`. */
export function nextCalm(times: readonly Date[], speed: readonly number[], threshold: number, from: number): { start: Date; hours: number } | null {
  for (let i = Math.max(0, from); i < speed.length; i++) {
    if (!(speed[i]! < threshold)) continue;
    let j = i;
    while (j + 1 < speed.length && speed[j + 1]! < threshold) j++;
    const hours = Math.round((times[j]!.getTime() - times[i]!.getTime()) / 3_600_000) + 1;
    return { start: times[i]!, hours };
  }
  return null;
}

/** Smallest angle between two directions (0–180°). */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

/**
 * The first lasting change of direction after step `from`: the wind settles
 * at least 60° away from where it was, compass names differ, and it holds
 * for 3 steps. Light winds (under 5 km/h) are skipped: their direction is noise.
 */
export function directionShift(times: readonly Date[], dir: readonly number[], speed: readonly number[], from: number): { at: Date; fromDir: number; toDir: number } | null {
  const start = Math.max(0, from);
  let ref = -1;
  for (let i = start; i < dir.length; i++) if (speed[i]! >= 5 && Number.isFinite(dir[i])) { ref = i; break; }
  if (ref < 0) return null;
  const holds = (i: number) => {
    for (let k = i; k < i + 3; k++) {
      if (k >= dir.length || !(speed[k]! >= 5) || angleBetween(dir[k]!, dir[ref]!) < 60) return false;
    }
    return compass(dir[i]!) !== compass(dir[ref]!);
  };
  for (let i = ref + 1; i < dir.length; i++) {
    if (holds(i)) return { at: times[i]!, fromDir: dir[ref]!, toDir: dir[Math.min(dir.length - 1, i + 2)]! };
  }
  return null;
}

/** Values as the vocabulary names them, per step (a point series' values). */
type Values = Partial<Record<string, ArrayLike<number>>>;

/**
 * The wind profile at step `i` of a series, from the pressure levels' heights
 * and winds and the 10 m wind. Levels with any part missing are left out;
 * null when the 10 m wind is missing.
 */
export function windProfileAt(values: Values, i: number, levels: readonly number[]): WindProfile | null {
  const s10 = values.wind_speed_10m?.[i] ?? NaN;
  const d10 = values.wind_direction_10m?.[i] ?? NaN;
  if (!Number.isFinite(s10) || !Number.isFinite(d10)) return null;
  const gh: number[] = [], u: number[] = [], v: number[] = [];
  for (const l of levels) {
    const h = values[`geopotential_height_${l}hPa`]?.[i] ?? NaN;
    const s = values[`wind_speed_${l}hPa`]?.[i] ?? NaN;
    const d = values[`wind_direction_${l}hPa`]?.[i] ?? NaN;
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(d)) continue;
    const [a, b] = toUV(s, d);
    gh.push(h); u.push(a); v.push(b);
  }
  const [u10, v10] = toUV(s10, d10);
  const g = values.wind_gusts_10m?.[i] ?? NaN;
  return { gh, u, v, u10, v10, speed10: s10, gust10: Number.isFinite(g) ? g : s10 };
}
