// Lines on the map from the node profiles and the elevation mosaic, at a
// coarser grid than the GPU fill, smoothed for drawing:
// - the 0 °C line: where the terrain-corrected temperature crosses 0 °C,
//   labelled with the freezing level's height ("0 °C · 1,150 m");
// - the snow line: where the wet-bulb temperature at the terrain falls to
//   0.5 °C, labelled "Snow line · 1,000 m" (needs humidity at the nodes).
// Also returns the temperatures sampled over the screen, for In view.
import { cellOf, freezingLevel, interpolateProfile, isothermSegments, joinSegments, newProfile, sampleProfile, smoothLine, type NodeGrid } from '../../core/temperature/toposcale';
import { SNOW_WET_BULB, snowLine, wetBulb } from '../../core/temperature/wet-bulb';
import { formatElevation } from '../../core/units/format';
import { shareFromWetBulb } from '../../core/precip/type';
import { PROFILE_LEVELS } from '../../core/vocabulary';
import type { Mosaic } from './elevation';

const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export type LineKind = '0c' | 'wetbulb';

export interface LineResult {
  features: { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { label: string }; geometry: { type: 'LineString'; coordinates: [number, number][] } }[] };
  /** Temperature at the terrain on the coarse grid, with each cell's place. */
  cells: { lon: number; lat: number; value: number }[];
  /**
   * Snow share at the terrain (wet-bulb rule, core/precip/type.ts), on the same
   * grid, rows north to south over the mosaic's box; null without humidity.
   */
  share: { merc: [number, number, number, number]; width: number; height: number; data: Float32Array } | null;
}

export function levelLine(grid: NodeGrid & { values?: Record<string, number>[] }, m: Mosaic, kind: LineKind, maxSize = 400): LineResult {
  const step = Math.max(1, Math.ceil(Math.max(m.width, m.height) / maxSize));
  const w = Math.floor(m.width / step);
  const h = Math.floor(m.height / step);
  const [x0, y0, x1, y1] = m.merc;
  const colLons = Array.from({ length: w }, (_, c) => (x0 + ((c + 0.5) / w) * (x1 - x0)) * 360 - 180);
  const rowLats = Array.from({ length: h }, (_, r) => latOf(y0 + ((r + 0.5) / h) * (y1 - y0)));
  const nl = grid.profiles[0]!.gh.length;
  const rhOf = (n: number) => Float32Array.from(PROFILE_LEVELS, (l) => grid.values?.[n]?.[`relative_humidity_${l}hPa`] ?? NaN);
  const hasRh = grid.profiles.every((_, n) => rhOf(n).every(Number.isFinite));
  const rh = hasRh ? grid.profiles.map((_, n) => rhOf(n)) : [];
  if (kind === 'wetbulb' && !hasRh) kind = '0c';
  const nx = grid.lons.length;
  const prof = newProfile(nl);
  const rhP = new Float32Array(nl);
  // Value whose 0 marks the line: temperature (0 °C), or wet-bulb minus 0.5 °C.
  const field = new Float32Array(w * h);
  const temps = new Float32Array(w * h);
  const share = hasRh ? new Float32Array(w * h) : null;
  for (let r = 0; r < h; r++) {
    const [iLat, wLat] = cellOf(grid.lats, rowLats[r]!);
    for (let c = 0; c < w; c++) {
      const [iLon, wLon] = cellOf(grid.lons, colLons[c]!);
      let z = 0;
      for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) z += Math.max(0, m.data[(r * step + dy) * m.width + c * step + dx]!);
      z /= step * step;
      interpolateProfile(grid, iLat, wLat, iLon, wLon, prof);
      const t = sampleProfile(prof.gh, prof.temp, z);
      temps[r * w + c] = t;
      let tw = NaN;
      if (hasRh) {
        const n00 = iLat * nx + iLon;
        const ws = [(1 - wLat) * (1 - wLon), (1 - wLat) * wLon, wLat * (1 - wLon), wLat * wLon];
        const ns = [n00, n00 + 1, n00 + nx, n00 + nx + 1];
        for (let k = 0; k < nl; k++) rhP[k] = ns.reduce((a, n, j) => a + ws[j]! * rh[n]![k]!, 0);
        tw = wetBulb(t, sampleProfile(prof.gh, rhP, z));
        share![r * w + c] = shareFromWetBulb(tw);
      }
      field[r * w + c] = kind === 'wetbulb' ? tw - SNOW_WET_BULB : t;
    }
  }
  const inside = (lon: number, lat: number) => lon >= grid.lons[0]! && lon <= grid.lons[nx - 1]! && lat >= grid.lats[0]! && lat <= grid.lats[grid.lats.length - 1]!;
  const toLonLat = (px: number, py: number): [number, number] => [(x0 + (px / w) * (x1 - x0)) * 360 - 180, latOf(y0 + (py / h) * (y1 - y0))];
  const features: LineResult['features']['features'] = [];
  for (const raw of joinSegments(isothermSegments(field, w, h, 0))) {
    if (raw.length < 8) continue; // specks
    const line = smoothLine(raw, 1.2);
    const coords: [number, number][] = [];
    for (let i = 0; i < line.length; i += 2) coords.push(toLonLat(line[i]!, line[i + 1]!));
    const mid = coords[Math.floor(coords.length / 2)]!;
    if (!inside(mid[0], mid[1])) continue;
    // The level's height where the label sits.
    const [iLat, wLat] = cellOf(grid.lats, mid[1]);
    const [iLon, wLon] = cellOf(grid.lons, mid[0]);
    interpolateProfile(grid, iLat, wLat, iLon, wLon, prof);
    let height: number | null;
    if (kind === 'wetbulb') {
      const n00 = iLat * nx + iLon;
      const ws = [(1 - wLat) * (1 - wLon), (1 - wLat) * wLon, wLat * (1 - wLon), wLat * wLon];
      const ns = [n00, n00 + 1, n00 + nx, n00 + nx + 1];
      const rr = Float32Array.from({ length: nl }, (_, k) => ns.reduce((a, n, j) => a + ws[j]! * rh[n]![k]!, 0));
      height = snowLine({ ...prof, rh: rr });
    } else height = freezingLevel(prof);
    const name = kind === 'wetbulb' ? 'Snow line' : '0 °C';
    features.push({ type: 'Feature', properties: { label: height === null ? name : `${name} · ${formatElevation(Math.round(height / 10) * 10)}` }, geometry: { type: 'LineString', coordinates: coords } });
  }
  const cells: LineResult['cells'] = [];
  for (let r = 0; r < h; r += 2) for (let c = 0; c < w; c += 2) cells.push({ lon: colLons[c]!, lat: rowLats[r]!, value: temps[r * w + c]! });
  return { features: { type: 'FeatureCollection', features }, cells, share: share ? { merc: m.merc, width: w, height: h, data: share } : null };
}
