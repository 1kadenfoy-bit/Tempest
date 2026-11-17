// A lean reader for Open-Meteo's .om map files, on the library's own decoder
// (@openmeteo/file-reader, GPL-2.0, kept inside this seam).
//
// Why not the weather-map-layer reader: it fetches 64 kB blocks and reads
// variables one after another. A temperature profile needs about 30
// variables, which cost ~3.8 MB and ~12 s per hour that way (measured Nov 16).
// Small blocks and parallel reads fetch only the chunks the box touches.
import { LruBlockCache, OmDataType, OmHttpBackendPool, type OmFileReader } from '@openmeteo/file-reader';
import { GridFactory, domainOptions } from '@openmeteo/weather-map-layer';
import type { NativeBox } from './index';

/** 8 kB blocks: one compressed chunk of a small box is a few kB. */
const BLOCK = 8 * 1024;
const cache = new LruBlockCache(BLOCK, 4096);
const pool = new OmHttpBackendPool({ backendOptions: { retries: 2, timeoutMs: 20_000 } });
/** Browsers open about six connections per host; more only queue. */
const PARALLEL = 6;

function domainFor(model: string) {
  const domain = domainOptions.find((d) => d.value === model);
  if (!domain) throw new Error(`Unknown model ${model}`);
  return domain;
}

/** The model's cell ranges covering a box, with a small margin. */
export function coveringRanges(model: string, bbox: [number, number, number, number], pad = 0.05) {
  const [w, s, e, n] = bbox;
  return GridFactory.create(domainFor(model).grid).getCoveringRanges(s - pad, w - pad, n + pad, e + pad);
}

/**
 * Decimals the point API keeps for a variable (checked Nov 17, 2026):
 * temperatures and wind speeds to 0.1, humidity, heights and directions whole.
 * The map files keep more; rounding them the same way means the map files
 * and the point API give the same numbers, so online, offline and fallback
 * readings agree (a snow line once read 1,020 m from one and 1,030 m from the
 * other).
 */
export function pointApiDecimals(variable: string): number | null {
  if (/^(temperature|dew_point)_/.test(variable) || /^wind_(speed|gusts)_/.test(variable)) return 1;
  if (/^(relative_humidity|geopotential_height|wind_direction)_/.test(variable)) return 0;
  return null;
}

/** Round values in place as the point API does (unchanged for other variables). */
export function roundLikePointApi(variable: string, values: Float32Array): void {
  const d = pointApiDecimals(variable);
  if (d === null) return;
  const f = 10 ** d;
  for (let i = 0; i < values.length; i++) values[i] = Math.round(values[i]! * f) / f;
}

/** Run tasks with at most `limit` in flight. */
async function limited<T>(tasks: (() => Promise<T>)[], limit = PARALLEL): Promise<T[]> {
  const out = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

async function readOne(root: OmFileReader, variable: string, ranges: { start: number; end: number }[]): Promise<Float32Array> {
  const child = await root.getChildByName(variable);
  if (!child) return new Float32Array(0);
  try {
    const dims = child.getDimensions();
    // Map files hold [y, x], or [y, x, time] with one time.
    const r = dims.length === 3 ? [...ranges, { start: 0, end: 1 }] : ranges;
    const data = await child.read({ type: OmDataType.FloatArray, ranges: r });
    const out = Float32Array.from(data as Float32Array);
    // The files keep wind in m/s; the app's vocabulary is km/h (checked Nov 17
    // against the point service, which answers in km/h).
    if (/^wind_(speed|gusts)_/.test(variable)) for (let i = 0; i < out.length; i++) out[i]! *= 3.6;
    roundLikePointApi(variable, out);
    return out;
  } finally {
    child.dispose();
  }
}

/**
 * Read several variables over the same model cells from one step's file,
 * in parallel. Plain (instantaneous) variables only: amounts need the
 * library's per-step conversion and go through readNativeBox.
 */
export async function readBoxFast(model: string, fileUrl: string, variables: string[], ranges: { start: number; end: number }[]): Promise<NativeBox> {
  const values: Record<string, Float32Array> = {};
  await pool.withReader(fileUrl, cache, async (root) => {
    const got = await limited(variables.map((v) => () => readOne(root, v, ranges)));
    variables.forEach((v, i) => { values[v] = got[i]!; });
  });
  return { model, ranges, values };
}

/** Several steps' files at once (one reader per file, a shared limit across them). */
export async function readStepsFast(model: string, fileUrls: string[], variables: string[], ranges: { start: number; end: number }[], onStep?: (i: number, box: NativeBox) => void): Promise<NativeBox[]> {
  return limited(fileUrls.map((url, i) => async () => {
    const box = await readBoxFast(model, url, variables, ranges);
    onStep?.(i, box);
    return box;
  }), 2);
}

/**
 * Values at one point from many steps' files: the nearest model cell, as the
 * library's readPointSeries gives, but with small blocks and in parallel.
 * The library's per-hour conversion divides by the step length, so with
 * hourly files the stored values are the same (checked Nov 17).
 */
export async function readPointFast(model: string, fileUrls: string[], variables: string[], lat: number, lon: number): Promise<Record<string, number[]>> {
  const ranges = coveringRanges(model, [lon, lat, lon, lat], 0.03);
  const grid = GridFactory.create(domainFor(model).grid, ranges);
  const out: Record<string, number[]> = Object.fromEntries(variables.map((v) => [v, new Array<number>(fileUrls.length).fill(NaN)]));
  await limited(fileUrls.map((url, i) => async () => {
    const box = await readBoxFast(model, url, variables, ranges);
    for (const v of variables) {
      const src = box.values[v];
      out[v]![i] = src && src.length ? grid.getInterpolatedValue(src, lat, lon, 'nearest') : NaN;
    }
  }), 4);
  return out;
}

/**
 * The model cells a box's values hold, in the same order as readBoxFast's
 * arrays: their centres, so a source that answers by place (the point API,
 * nearest cell) can fill the same box.
 */
export function cellCentres(model: string, ranges: { start: number; end: number }[]): { lat: number; lon: number }[] {
  const grid = GridFactory.create(domainFor(model).grid, ranges);
  const out: { lat: number; lon: number }[] = [];
  grid.forEachPoint((p) => { out[p.index] = { lat: p.lat, lon: p.lon }; });
  return out;
}
