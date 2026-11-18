// Adapter: ECCC's Regional Air Quality Deterministic Prediction System
// (RAQDPS, with FireWork's wildfire emissions folded in), through GeoMet.
//
// Checked Nov 18, 2026 from the build machine:
// - Layers (WMS and WCS, the same names): RAQDPS.Sfc_PM2.5-WildfireSmokePlume
//   (PM2.5 near the ground from wildfire smoke) and RAQDPS.SFC_PM2.5 (all
//   PM2.5 near the ground). Units kg/m³ (1e-9 kg/m³ = 1 µg/m³).
// - WMS GetCapabilities with `layer=` gives that layer's dimensions: `time`
//   hourly from the newest run's start to 72 h later
//   (2026-11-18T00:00:00Z/2026-11-21T00:00:00Z/PT1H) and `reference_time`,
//   runs every 12 h for the last 2 days (default: the newest).
// - WCS 2.0.1 GetCoverage gives the numbers: subset=lat(s,n)&subset=long(w,e)
//   (the axis is "long", not "lon"), scalesize=long(nx),lat(ny), and GeoMet's
//   own `time=` and `dim_reference_time=` parameters. image/tiff is one band of
//   32-bit floats, uncompressed (CORS *). The native grid is 0.09°; without a
//   size GeoMet answered a coarse 0.2° grid. image/x-aaigrid also works but
//   is six times larger, inside a multipart answer.
// - WMS GetFeatureInfo (JSON) gives one point's value with its time and run.
// - An earlier run's hours are reached with `dim_reference_time`; a time
//   outside the run's hours is refused (HTTP 400, NoMatch).
// Online only: GeoMet asks not to be bulk-copied.
import type { GridField, PointSeries } from '../../core/vocabulary';
import { readGeoTiff } from './geotiff';

export const source = {
  id: 'eccc-raqdps',
  name: 'ECCC air quality forecast (RAQDPS with FireWork)',
  provides: 'Wildfire smoke and fine particles (PM2.5) for the map and the pin, 72 h ahead, 10 km',
  baseUrl: 'https://geo.weather.gc.ca/geomet',
  licence: 'Open Government Licence – Canada',
  attribution: 'Contains information from Environment and Climate Change Canada (RAQDPS FireWork)',
  link: 'https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps/readme_raqdps_en/',
  offline: false,
} as const;

export const LAYERS = {
  pm2_5_smoke: 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume',
  pm2_5: 'RAQDPS.SFC_PM2.5',
} as const;
export type RaqdpsVariable = keyof typeof LAYERS;

/** The model's own spacing, degrees (about 10 km). */
export const NATIVE_DEG = 0.09;
const H = 3_600_000;
const KG_TO_UG = 1e9;

export interface RaqdpsTimes {
  /** Every hour the newest run covers. */
  times: Date[];
  /** The runs GeoMet keeps, oldest first; the last is the newest. */
  runs: Date[];
}

const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');

/** Hours in "start/end/PT1H" (or a list "a,b,c"). */
export function expandDimension(text: string): Date[] {
  const t = text.trim();
  if (t.includes('/')) {
    const [a, b, p] = t.split('/');
    const m = /^PT(\d+)H$/.exec(p ?? '');
    const step = (m ? Number(m[1]) : 1) * H;
    const out: Date[] = [];
    for (let x = Date.parse(a!); x <= Date.parse(b!); x += step) out.push(new Date(x));
    return out;
  }
  return t.split(',').map((x) => new Date(x.trim())).filter((d) => !Number.isNaN(d.getTime()));
}

export function capabilitiesUrl(layer: string): string {
  return `${source.baseUrl}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(layer)}`;
}

/** The layer's hours and runs from GetCapabilities. */
export function parseCapabilities(xml: string, layer: string): RaqdpsTimes {
  const at = xml.indexOf(`<Name>${layer}</Name>`);
  if (at < 0) throw new Error(`${layer} not in GeoMet's capabilities`);
  const block = xml.slice(at, xml.indexOf('</Layer>', at));
  const dim = (name: string) => new RegExp(`<Dimension name="${name}"[^>]*>([^<]+)</Dimension>`).exec(block)?.[1];
  const time = dim('time');
  const ref = dim('reference_time');
  if (!time || !ref) throw new Error(`${layer} has no time dimension`);
  return { times: expandDimension(time), runs: expandDimension(ref) };
}

export async function fetchTimes(layer: string, fetchFn: typeof fetch = fetch): Promise<RaqdpsTimes> {
  const res = await fetchFn(capabilitiesUrl(layer), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCapabilities(await res.text(), layer);
}

/** How many hours each run reaches past its start. */
export const RUN_HOURS = 72;

/**
 * The hours the cursor can stop on: from `pastHours` before now (as far as
 * the oldest kept run reaches) to the newest run's last hour, hourly.
 */
export function stepsFor(t: RaqdpsTimes, now: Date, pastHours = 48): Date[] {
  const first = t.runs[0];
  const last = t.times[t.times.length - 1];
  if (!first || !last) return [];
  const from = Math.max(first.getTime(), Math.floor(now.getTime() / H) * H - pastHours * H);
  const out: Date[] = [];
  for (let x = from; x <= last.getTime(); x += H) out.push(new Date(x));
  return out;
}

/** The run that serves hour t: the newest run that had started by then (an earlier run for the past). */
export function runFor(t: RaqdpsTimes, time: Date): Date | null {
  let best: Date | null = null;
  for (const r of t.runs) {
    if (r.getTime() <= time.getTime() && time.getTime() <= r.getTime() + RUN_HOURS * H) best = r;
  }
  return best;
}

export interface Box { bbox: [number, number, number, number]; nx: number; ny: number; key: string }

/**
 * The box to ask for, for a view: snapped out to whole degrees (small pans
 * reuse it), at the model's own spacing, or coarser for a wide view so an
 * answer stays under `maxCells` cells (about 100 kB).
 */
export function boxFor(view: [number, number, number, number], limit: [number, number, number, number], maxCells = 160 * 120): Box | null {
  const w = Math.max(limit[0], Math.floor(view[0]));
  const s = Math.max(limit[1], Math.floor(view[1]));
  const e = Math.min(limit[2], Math.ceil(view[2]));
  const n = Math.min(limit[3], Math.ceil(view[3]));
  if (w >= e || s >= n) return null;
  let nx = Math.round((e - w) / NATIVE_DEG);
  let ny = Math.round((n - s) / NATIVE_DEG);
  const k = Math.sqrt((nx * ny) / maxCells);
  if (k > 1) { nx = Math.max(2, Math.round(nx / k)); ny = Math.max(2, Math.round(ny / k)); }
  return { bbox: [w, s, e, n], nx, ny, key: `${w},${s},${e},${n}@${nx}x${ny}` };
}

export function coverageUrl(layer: string, box: Box, time: Date, run: Date): string {
  const [w, s, e, n] = box.bbox;
  return `${source.baseUrl}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${encodeURIComponent(layer)}`
    + `&subset=lat(${s},${n})&subset=long(${w},${e})&scalesize=long(${box.nx}),lat(${box.ny})`
    + `&format=image/tiff&time=${iso(time)}&dim_reference_time=${iso(run)}`;
}

const label = (run: Date) => ({
  source: source.id, model: 'RAQDPS', run, gridKm: 10, licence: source.licence, attribution: source.attribution, fetchedAt: new Date(), offline: false,
});

/** A GeoTIFF answer as a grid field in µg/m³ (rows south to north). */
export function tiffToField(buf: ArrayBuffer, variable: RaqdpsVariable, time: Date, run: Date): GridField {
  const r = readGeoTiff(buf);
  const out = new Float32Array(r.width * r.height);
  for (let j = 0; j < r.height; j++) {
    const src = (r.height - 1 - j) * r.width;
    for (let i = 0; i < r.width; i++) {
      const v = r.data[src + i]!;
      out[j * r.width + i] = Number.isFinite(v) ? Math.max(0, v * KG_TO_UG) : NaN;
    }
  }
  return {
    label: label(run), validTime: time, stepHours: 1,
    bbox: [r.west, r.north - r.height * r.dy, r.west + r.width * r.dx, r.north], nx: r.width, ny: r.height,
    values: { [variable]: out },
  };
}

export async function fetchField(variable: RaqdpsVariable, box: Box, time: Date, run: Date, fetchFn: typeof fetch = fetch): Promise<GridField> {
  const res = await fetchFn(coverageUrl(LAYERS[variable], box, time, run), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return tiffToField(await res.arrayBuffer(), variable, time, run);
}

export function pointUrl(layer: string, lat: number, lon: number, time: Date, run: Date): string {
  const d = 0.01;
  const p = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo', layers: layer, query_layers: layer,
    crs: 'EPSG:4326', bbox: `${lat - d},${lon - d},${lat + d},${lon + d}`, width: '3', height: '3', i: '1', j: '1',
    info_format: 'application/json', time: iso(time), dim_reference_time: iso(run),
  });
  return `${source.baseUrl}?${p}`;
}

/** One point's answer: µg/m³ with the hour and run GeoMet says it read, or null. */
export function parsePoint(json: unknown): { value: number; time: Date | null; run: Date | null } | null {
  const p = (json as { features?: { properties?: Record<string, unknown> }[] })?.features?.[0]?.properties;
  const v = p?.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const d = (x: unknown) => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? new Date(x) : null);
  return { value: Math.max(0, v * KG_TO_UG), time: d(p?.time), run: d(p?.dim_reference_time) };
}

/**
 * The pin's series: one small question per hour (GeoMet has no time range
 * for a point), a few at a time. Hours that do not answer stay empty (NaN).
 */
export async function fetchPointSeries(variable: RaqdpsVariable, t: RaqdpsTimes, steps: Date[], lat: number, lon: number, fetchFn: typeof fetch = fetch, parallel = 4): Promise<PointSeries> {
  const values = new Array<number>(steps.length).fill(NaN);
  const runs = steps.map((s) => runFor(t, s));
  let next = 0;
  const worker = async () => {
    while (next < steps.length) {
      const k = next++;
      const run = runs[k];
      if (!run) continue;
      try {
        const res = await fetchFn(pointUrl(LAYERS[variable], lat, lon, steps[k]!, run), { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) continue;
        const got = parsePoint(await res.json());
        if (got) values[k] = got.value;
      } catch { /* left empty */ }
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  const newest = t.runs[t.runs.length - 1]!;
  // Which run each stretch comes from: earlier runs before the newest run's start.
  const segments: NonNullable<PointSeries['segments']> = [];
  steps.forEach((s, k) => {
    const run = runs[k];
    if (!run) return;
    const last = segments[segments.length - 1];
    if (last && last.run.getTime() === run.getTime()) last.to = s;
    else segments.push({ model: 'RAQDPS', run, from: s, to: s, kind: run.getTime() === newest.getTime() ? 'forecast' : 'earlier' });
  });
  return { label: label(newest), lat, lon, times: steps, stepHours: 1, values: { [variable]: values }, segments };
}
