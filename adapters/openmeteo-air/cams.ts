// Adapter: CAMS global air quality (Copernicus Atmosphere Monitoring
// Service) through Open-Meteo's Air Quality API. The Air quality layer's
// second source: all fine particles (PM2.5), coarse (about 40 km), but with
// past days that ECCC no longer keeps.
//
// Checked Nov 18, 2026 from the build machine (CORS *, no key):
// - https://air-quality-api.open-meteo.com/v1/air-quality?latitude=..&longitude=..
//   &hourly=pm2_5&domains=cams_global&start_date=..&end_date=.. answers µg/m³,
//   hourly, UTC. Several places in one request (comma lists) answer a list.
// - The values sit on CAMS's 0.4° cells centred on multiples of 0.4°: places
//   inside one cell all answered the same number (the answer's own latitude and
//   longitude are on a finer 0.1° grid). The map therefore asks for the cell
//   centres only.
// - The forecast reached about 4½ days ahead (to Nov 22 12Z from Nov 18), and
//   August 2026 was still there.
// - Every place in a request counts as a call against Open-Meteo's free daily
//   limit, which the weather shares; the map keeps to at most 64 places a view.
import type { GridField, PointSeries } from '../../core/vocabulary';

export const source = {
  id: 'openmeteo-air',
  name: 'CAMS global air quality via Open-Meteo',
  provides: 'Fine particles (PM2.5) at about 40 km, two days back and four ahead: the Air quality layer’s second source',
  baseUrl: 'https://air-quality-api.open-meteo.com',
  licence: 'CC BY 4.0 (Open-Meteo); Copernicus licence (CAMS)',
  attribution: 'Air quality data by Open-Meteo.com (CC BY 4.0); contains modified Copernicus Atmosphere Monitoring Service information 2026',
  link: 'https://open-meteo.com/en/docs/air-quality-api',
  terms: 'Free for non-commercial use; each place asked counts against the 10,000 calls a day shared with the weather.',
  offline: false,
} as const;

/** CAMS global's cell size, degrees. */
export const CELL = 0.4;
export const MAX_PLACES = 64;
const H = 3_600_000;

export interface CamsGrid {
  /** Cell centres, south to north and west to east. */
  lats: number[];
  lons: number[];
  spacing: number;
  key: string;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Cell centres over a box, on CAMS's own lattice, spaced wider when a view would need more than `max` places. */
export function gridFor(box: [number, number, number, number], max = MAX_PLACES): CamsGrid | null {
  for (let k = 1; k <= 16; k++) {
    const sp = CELL * k;
    const axis = (a: number, b: number) => {
      const out: number[] = [];
      for (let x = Math.floor(a / sp) * sp; x <= Math.ceil(b / sp) * sp + 1e-9; x += sp) out.push(round(x));
      return out;
    };
    const lats = axis(box[1], box[3]), lons = axis(box[0], box[2]);
    if (lats.length * lons.length <= max) return { lats, lons, spacing: sp, key: `${lats[0]},${lons[0]},${lats.length}x${lons.length}@${sp}` };
  }
  return null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function gridUrl(g: CamsGrid, from: Date, to: Date): string {
  const lat: number[] = [], lon: number[] = [];
  for (const a of g.lats) for (const o of g.lons) { lat.push(a); lon.push(o); }
  return `${source.baseUrl}/v1/air-quality?latitude=${lat.join(',')}&longitude=${lon.join(',')}&hourly=pm2_5&domains=cams_global&start_date=${day(from)}&end_date=${day(to)}`;
}

export function pointUrl(lat: number, lon: number, from: Date, to: Date): string {
  // The cell centre, so the pin reads the same number the map shows there.
  const c = (x: number) => round(Math.round(x / CELL) * CELL);
  return `${source.baseUrl}/v1/air-quality?latitude=${c(lat)}&longitude=${c(lon)}&hourly=pm2_5&domains=cams_global&start_date=${day(from)}&end_date=${day(to)}`;
}

interface Answer { hourly?: { time?: string[]; pm2_5?: (number | null)[] } }

const times = (a: Answer) => (a.hourly?.time ?? []).map((t) => new Date(`${t}:00Z`));

export interface CamsBlock { grid: CamsGrid; times: Date[]; /** values[time][row * nx + col], rows south to north; NaN where missing. */ values: Float32Array[]; fetchedAt: Date }

/** A many-place answer (in the grid's order: rows south to north, west to east) as hourly fields. */
export function parseGrid(json: unknown, g: CamsGrid): CamsBlock {
  const list = (Array.isArray(json) ? json : [json]) as Answer[];
  const n = g.lats.length * g.lons.length;
  if (list.length !== n) throw new Error(`Open-Meteo answered ${list.length} places for ${n}`);
  const t = times(list[0]!);
  const values = t.map((_, i) => {
    const row = new Float32Array(n);
    list.forEach((a, k) => { const v = a.hourly?.pm2_5?.[i]; row[k] = typeof v === 'number' ? v : NaN; });
    return row;
  });
  return { grid: g, times: t, values, fetchedAt: new Date() };
}

const label = (fetchedAt: Date) => ({
  source: source.id, model: 'CAMS global', run: fetchedAt, gridKm: 40, licence: source.licence, attribution: source.attribution, fetchedAt, offline: false,
});

/** One hour of a block as a grid field (cells drawn edge to edge around their centres). */
export function fieldAt(b: CamsBlock, i: number): GridField | null {
  const v = b.values[i];
  if (!v) return null;
  const { lats, lons, spacing } = b.grid;
  const h = spacing / 2;
  return {
    label: label(b.fetchedAt), validTime: b.times[i]!, stepHours: 1,
    bbox: [lons[0]! - h, lats[0]! - h, lons[lons.length - 1]! + h, lats[lats.length - 1]! + h], nx: lons.length, ny: lats.length,
    values: { pm2_5: v },
  };
}

export function parsePoint(json: unknown, lat: number, lon: number): PointSeries {
  const a = (Array.isArray(json) ? json[0] : json) as Answer;
  const t = times(a);
  const values = (a.hourly?.pm2_5 ?? []).map((v) => (typeof v === 'number' ? v : NaN));
  return { label: label(new Date()), lat, lon, times: t, stepHours: 1, values: { pm2_5: values } };
}

/** Hours the cursor can stop on: from `pastHours` before now to the last hour with a value. */
export function stepsFor(b: { times: Date[]; values: ArrayLike<number> } | null, now: Date, aheadHours = 108, pastHours = 48): Date[] {
  const from = Math.floor(now.getTime() / H) * H - pastHours * H;
  let to = from + (pastHours + aheadHours) * H;
  if (b) {
    let last = -1;
    for (let i = 0; i < b.times.length; i++) if (Number.isFinite(b.values[i]!)) last = i;
    if (last >= 0) to = Math.min(to, b.times[last]!.getTime());
  }
  const out: Date[] = [];
  for (let x = from; x <= to; x += H) out.push(new Date(x));
  return out;
}

/** The days to ask for, for steps around now. */
export function dateRange(now: Date, aheadHours = 108, pastHours = 48): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - pastHours * H), to: new Date(now.getTime() + aheadHours * H) };
}
