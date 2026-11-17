// Wind for the map: node profiles packed for the GPU fill, and the same wind
// read on a coarse grid over the screen for the flow, the arrows and the In
// view line. Both follow core/wind/wind.ts: profiles blended between nodes,
// then read at the ground height, over the model's own ground.
import { cellOf } from '../../core/temperature/toposcale';
import { gustAt, smoothGround, toUV, windAtHeight, type WindProfile } from '../../core/wind/wind';
import { PROFILE_LEVELS } from '../../core/vocabulary';
import type { WindLattice } from '../../render/grid-gl/terrain-wind-layer';
import type { FlowField } from '../../render/flow/flow-canvas';
import type { NodeData } from '../data/profile-source';
import type { Mosaic } from './elevation';

/** Each node's wind profile at the step, levels with missing wind borrowing the next level up. */
export function nodeProfiles(grid: NodeData): WindProfile[] {
  return grid.profiles.map((p, n) => {
    const v = grid.values[n] ?? {};
    const nl = PROFILE_LEVELS.length;
    const u = new Float32Array(nl), w = new Float32Array(nl);
    let carry: [number, number] = [NaN, NaN];
    for (let k = nl - 1; k >= 0; k--) {
      const l = PROFILE_LEVELS[k]!;
      const s = v[`wind_speed_${l}hPa`], d = v[`wind_direction_${l}hPa`];
      if (s !== undefined && d !== undefined && Number.isFinite(s) && Number.isFinite(d)) carry = toUV(s, d);
      [u[k], w[k]] = carry;
    }
    const s10 = v.wind_speed_10m ?? NaN, d10 = v.wind_direction_10m ?? NaN;
    const [u10, v10] = Number.isFinite(s10) && Number.isFinite(d10) ? toUV(s10, d10) : [u[0]!, w[0]!];
    const g10 = v.wind_gusts_10m ?? NaN;
    const sp10 = Number.isFinite(s10) ? s10 : Math.hypot(u10, v10);
    return { gh: p.gh, u, v: w, u10, v10, speed10: sp10, gust10: Number.isFinite(g10) ? g10 : sp10 };
  });
}

/** True when every node has a usable wind profile. */
export function windComplete(profiles: WindProfile[]): boolean {
  return profiles.every((p) => Number.isFinite(p.u10) && Array.from(p.u).every(Number.isFinite));
}

export function packWind(grid: NodeData, profiles: WindProfile[]): WindLattice {
  const nl = PROFILE_LEVELS.length;
  const row = nl + 1;
  const data = new Float32Array(profiles.length * row * 4);
  profiles.forEach((p, n) => {
    for (let k = 0; k < nl; k++) {
      const o = (n * row + k) * 4;
      data[o] = p.gh[k]!; data[o + 1] = p.u[k]!; data[o + 2] = p.v[k]!;
    }
    const o = (n * row + nl) * 4;
    data[o] = p.u10; data[o + 1] = p.v10; data[o + 2] = p.speed10; data[o + 3] = p.gust10;
  });
  return { lons: grid.lons, lats: grid.lats, levels: nl, data };
}

/** The model's ground under the mosaic: the terrain smoothed over one model cell. */
export function modelGround(m: Mosaic, gridKm: number): Float32Array {
  const midY = (m.merc[1] + m.merc[3]) / 2;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * midY)));
  const metresPerPixel = ((m.merc[2] - m.merc[0]) * 40_075_016 * Math.cos(lat)) / m.width;
  return smoothGround(m.data, m.width, m.height, (gridKm * 1000) / 2 / metresPerPixel);
}

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;

/** Blend the four nodes' profiles around a point, into a fresh profile. */
function blend(grid: NodeData, profiles: WindProfile[], lat: number, lon: number): WindProfile {
  const [iLat, wLat] = cellOf(grid.lats, lat);
  const [iLon, wLon] = cellOf(grid.lons, lon);
  const nx = grid.lons.length;
  const ps = [profiles[iLat * nx + iLon]!, profiles[iLat * nx + iLon + 1]!, profiles[(iLat + 1) * nx + iLon]!, profiles[(iLat + 1) * nx + iLon + 1]!];
  const ws = [(1 - wLat) * (1 - wLon), (1 - wLat) * wLon, wLat * (1 - wLon), wLat * wLon];
  const nl = ps[0]!.gh.length;
  const mix = (f: (p: WindProfile) => number) => ps.reduce((s, p, k) => s + f(p) * ws[k]!, 0);
  const gh = new Float32Array(nl), u = new Float32Array(nl), v = new Float32Array(nl);
  for (let k = 0; k < nl; k++) { gh[k] = mix((p) => p.gh[k]!); u[k] = mix((p) => p.u[k]!); v[k] = mix((p) => p.v[k]!); }
  return { gh, u, v, u10: mix((p) => p.u10), v10: mix((p) => p.v10), speed10: mix((p) => p.speed10), gust10: mix((p) => p.gust10) };
}

export interface ScreenWind {
  field: FlowField;
  /** Each grid cell's place, gust and direction, for the In view line. */
  cells: { lon: number; lat: number; gust: number; dir: number }[];
}

/**
 * The wind on a grid over the screen (one value per `step` pixels). `unproject`
 * turns a screen point into its place.
 */
export function screenWind(grid: NodeData, profiles: WindProfile[], m: Mosaic, ground: Float32Array, width: number, height: number, unproject: (x: number, y: number) => { lng: number; lat: number }, step = 24): ScreenWind {
  const cols = Math.ceil(width / step) + 1, rows = Math.ceil(height / step) + 1;
  const u = new Float32Array(cols * rows).fill(NaN), v = new Float32Array(cols * rows).fill(NaN);
  const cells: ScreenWind['cells'] = [];
  const lon0 = grid.lons[0]!, lon1 = grid.lons[grid.lons.length - 1]!, lat0 = grid.lats[0]!, lat1 = grid.lats[grid.lats.length - 1]!;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * step, y = (r + 0.5) * step;
      const { lng, lat } = unproject(x, y);
      if (lng < lon0 || lng > lon1 || lat < lat0 || lat > lat1) continue;
      const px = Math.floor(((mercX(lng) - m.merc[0]) / (m.merc[2] - m.merc[0])) * m.width);
      const py = Math.floor(((mercY(lat) - m.merc[1]) / (m.merc[3] - m.merc[1])) * m.height);
      if (px < 0 || py < 0 || px >= m.width || py >= m.height) continue;
      const z = Math.max(0, m.data[py * m.width + px]!);
      const p = blend(grid, profiles, lat, lng);
      const [a, b] = windAtHeight(p, z, ground[py * m.width + px]!);
      u[r * cols + c] = a; v[r * cols + c] = b;
      if (x <= width && y <= height) {
        const speed = Math.hypot(a, b);
        cells.push({ lon: lng, lat, gust: gustAt(speed, p.speed10, p.gust10), dir: ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360 });
      }
    }
  }
  return { field: { width, height, cols, rows, step, u, v }, cells };
}
