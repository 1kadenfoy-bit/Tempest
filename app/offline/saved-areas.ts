// Saving areas for offline use: the chosen layers' weather for every step in
// the window (HRDPS, then RDPS past its end), the base map and terrain for the
// box, and the map's fonts and icons. Several areas are kept side by side. Everything goes through the normal adapters into the store
// on the device; reading it back uses the same path as live data.
import type { StyleSpecification } from 'maplibre-gl';
import { source, stepFileUrl, type RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import { readNativeBox, type NativeBox } from '../../render/openmeteo-starter';
import { cellCentres, coveringRanges, readBoxFast } from '../../render/openmeteo-starter/om-reader';
import { fetchApiRun, fetchApiSeries, apiUrl } from '../../adapters/openmeteo-api/point-series';
import { apiWeight, cachedFetch } from '../data/api-cache';
import { gridRequest } from '../../core/geo/grid-request';
import { SAVED_AREA_VERSION, areaParts, parseSavedAreas, tilesInBox, weatherFiles, type SavedArea, type SavedWeatherPart } from '../../core/offline/saved-area';
import { writePmtiles, zxyToTileId, type TileIn } from '../../core/pmtiles/writer';
import { REGION_FILE_VERSION, decodeRegionFile, encodeRegionFile } from '../../core/region-file/format';
import type { VariableName } from '../../core/vocabulary';
import type { Basemap } from '../map/basemap-router';
import { terrainSource } from '../map/terrain';
import { readFile, readJson, removeFile, requestPersistence, writeFile } from './storage';

const INDEX = 'saved-areas.json';
export const SAVED_CACHE = 'tempest-saved-v1';
const BASEMAP_MAXZOOM = 15;
const TERRAIN_MAXZOOM = 12;

export async function listSavedAreas(): Promise<SavedArea[]> {
  return parseSavedAreas(await readJson<unknown>(INDEX));
}

export interface SaveProgress { done: number; total: number; label: string }

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Run jobs a few at a time. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

function glyphAndSpriteUrls(style: StyleSpecification): string[] {
  const urls = new Set<string>();
  const stacks = new Set<string>();
  for (const l of style.layers) {
    const font = (l as { layout?: Record<string, unknown> }).layout?.['text-font'];
    if (Array.isArray(font) && font.every((f) => typeof f === 'string')) stacks.add(font.join(','));
  }
  if (typeof style.glyphs === 'string') {
    for (const stack of stacks) {
      for (const range of ['0-255', '256-511', '8192-8447']) {
        urls.add(style.glyphs.replace('{fontstack}', encodeURIComponent(stack).replace(/%2C/g, ',')).replace('{range}', range));
      }
    }
  }
  if (typeof style.sprite === 'string') {
    for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.add(`${style.sprite}${suffix}`);
  }
  return [...urls];
}

/**
 * Above this many units of the point API's free limit (500 a minute, counted
 * on the phone), a save reads the map files instead. 2,200 is about five
 * minutes of the allowance, a box near 35 km across: the map files take about
 * as long for any box (thousands of small reads, six at a time).
 */
const API_SAVE_MAX = 2200;
/** Places per request: about 450 units each with a profile's 50 values, under the per-minute limit. */
const API_CHUNK = 90;

/**
 * Plain values for every model cell in the box and every saved hour, from the
 * point API: a few requests in place of thousands of small file reads. Null
 * when the API serves another run, or the box would use too much of its free
 * limit; the map files are read then.
 */
async function plainFromApi(run: RunMetadata, times: Date[], vars: VariableName[], ranges: { start: number; end: number }[]): Promise<Record<string, Float32Array[]> | null> {
  const cells = cellCentres(run.model, ranges);
  if (!cells.length || cells.some((c) => !c)) return null;
  const span: [Date, Date] = [times[0]!, times[times.length - 1]!];
  const chunks: { lat: number; lon: number }[][] = [];
  for (let k = 0; k < cells.length; k += API_CHUNK) chunks.push(cells.slice(k, k + API_CHUNK));
  const weight = chunks.reduce((n, c) => n + apiWeight(apiUrl(run.model, c, vars, span)), 0);
  if (weight > API_SAVE_MAX) return null;
  const apiRun = await fetchApiRun(run.model).catch(() => null);
  if (!apiRun || apiRun.getTime() !== run.referenceTime.getTime()) return null;
  const out: Record<string, Float32Array[]> = Object.fromEntries(vars.map((v) => [v, times.map(() => new Float32Array(cells.length))]));
  let at = 0;
  for (const c of chunks) {
    const series = await fetchApiSeries(run.model, run.referenceTime, vars, c, times, cachedFetch(run.referenceTime), span);
    series.forEach((s, n) => {
      const idx = times.map((t) => s.times.findIndex((x) => x.getTime() === t.getTime()));
      for (const v of vars) {
        const col = s.values[v] ?? [];
        idx.forEach((j, i) => { out[v]![i]![at + n] = j >= 0 ? col[j] ?? NaN : NaN; });
      }
    });
    at += c.length;
  }
  return out;
}

export async function saveArea(opts: {
  bbox: [number, number, number, number];
  /** Hours from now to keep, or null for every step to the last model's end. */
  hours: number | null;
  /** The runs to save, in the chain's order: each covers the hours after the one before ends. */
  runs: RunMetadata[];
  /** Amounts (read with the library's per-step conversion). */
  variables: VariableName[];
  /** Plain values, such as temperature profiles (read with the lean reader). */
  plainVariables?: VariableName[];
  /** What the list calls it, and the choices made (for refreshing). */
  name: string;
  layers: string[];
  basemap: Basemap;
  style: StyleSpecification;
  onProgress: (p: SaveProgress) => void;
}): Promise<SavedArea> {
  const { bbox, basemap } = opts;
  const amounts = opts.variables;
  const plain = opts.plainVariables ?? [];
  const variables = [...amounts, ...plain];
  void requestPersistence();
  const id = `a${Date.now().toString(36)}`;
  const now = Date.now();
  const H = 3_600_000;
  const until = opts.hours === null ? Infinity : now + opts.hours * H;
  // Each run's hours: after the previous model's end (or from now), up to the window's end.
  let after = now - H;
  const plan = opts.runs.map((run, k) => {
    const times = run.validTimes.slice(k === 0 ? 1 : 0).filter((t) => t.getTime() > after && t.getTime() <= until);
    after = Math.max(after, run.validTimes[run.validTimes.length - 1]!.getTime());
    return { run, times };
  }).filter((p) => p.times.length);
  if (!plan.length) throw new Error('no forecast hours in that window');
  const req = gridRequest(bbox, 12, bbox, 1e-9)!; // the box itself, at the model's own spacing
  const terrainTiles = tilesInBox(bbox, 0, TERRAIN_MAXZOOM);
  const extras = glyphAndSpriteUrls(opts.style);
  const total = plan.reduce((n, p) => n + p.times.length, 0) + 1 + terrainTiles.length + extras.length;
  let done = 0;
  const tick = (label: string) => opts.onProgress({ done: ++done, total, label });

  // 1. Weather: every step of each run, as the model's own cells for the box,
  //    so the numbers offline are exactly the numbers online.
  const parts: SavedWeatherPart[] = [];
  let weatherBytes = 0;
  for (const [k, { run, times }] of plan.entries()) {
    const steps: Record<string, Float32Array[]> = Object.fromEntries(variables.map((v) => [v, new Array<Float32Array>(times.length)]));
    const { nx, ny } = req;
    // Both readers cover the same model cells (the box plus the same margin).
    const ranges = coveringRanges(run.model, bbox);
    // Profiles and wind: the point API when the box is small enough, else the map files hour by hour.
    const fromApi = plain.length ? await plainFromApi(run, times, plain, ranges).catch((err) => { console.warn('saving from the map files', err); return null; }) : null;
    if (fromApi) for (const v of plain) steps[v] = fromApi[v]!;
    const filePlain = fromApi ? [] : plain;
    await pool(times.map((t, i) => ({ t, i })), 6, async ({ t, i }) => {
      const url = stepFileUrl(run.model, run.referenceTime, t);
      if (amounts.length) {
        const box = await readNativeBox(run.model, url, amounts, bbox, 1);
        for (const v of amounts) steps[v]![i] = box.values[v] ?? new Float32Array(0);
      }
      if (filePlain.length) {
        const box = await readBoxFast(run.model, url, filePlain, ranges);
        for (const v of filePlain) steps[v]![i] = box.values[v] ?? new Float32Array(0);
      }
      tick('Weather');
    });
    const perStep = steps[variables[0]!]![0]?.length ?? 0;
    // As live fields say (the reader converts amounts per hour for every model).
    const stepHours = 1;
    const files: Record<string, string> = {};
    for (const v of variables) {
      const name = `${id}-${k}-${v}.bin`;
      const buf = encodeRegionFile({
        header: {
          version: REGION_FILE_VERSION, source: source.id, model: run.model, run: run.referenceTime.toISOString(), variable: v,
          unit: amounts.includes(v) ? 'mm per step' : v.startsWith('geopotential') ? 'm' : v === 'relative_humidity_2m' ? '%' : v.startsWith('wind_') ? 'km/h' : '°C', bbox, validTimes: times.map((t) => t.toISOString()), valuesPerStep: perStep,
          savedAt: new Date().toISOString(), nx, ny, stepHours, ranges,
        },
        steps: steps[v]!,
      });
      weatherBytes += await writeFile(name, new Uint8Array(buf));
      files[v] = name;
    }
    parts.push({ source: source.id, model: run.model, run: run.referenceTime.toISOString(), validTimes: times.map((t) => t.toISOString()), stepHours, files, ranges, nx, ny });
  }

  // 2. Base map: the stored tiles inside the box, into one PMTiles file.
  const wanted = tilesInBox(bbox, 0, BASEMAP_MAXZOOM);
  const tiles: TileIn[] = [];
  await pool(wanted, 12, async ([z, x, y]) => {
    const t = await basemap.storedTile(z, x, y);
    if (t) tiles.push({ tileId: zxyToTileId(z, x, y), data: await gzip(new Uint8Array(t)) });
  });
  const pm = await writePmtiles(tiles, {
    bbox, minZoom: 0, maxZoom: BASEMAP_MAXZOOM, tileType: 1, tileCompression: 2,
    metadata: { vector_layers: basemap.manifest.vector_layers, attribution: basemap.manifest.attribution },
  });
  const basemapFile = `${id}-basemap.pmtiles`;
  const basemapBytes = await writeFile(basemapFile, pm);
  tick('Base map');

  // 3. Terrain, fonts and icons: kept in the offline cache by address, served
  //    by the service worker without signal.
  const cache = await caches.open(SAVED_CACHE);
  const cached: string[] = [];
  let terrainBytes = 0, otherBytes = 0;
  const keep = async (url: string, kind: 'terrain' | 'other') => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const size = (await res.clone().arrayBuffer()).byteLength;
        await cache.put(url, res);
        cached.push(url);
        if (kind === 'terrain') terrainBytes += size; else otherBytes += size;
      }
    } catch { /* a missing tile is drawn from its parent */ }
  };
  await pool(terrainTiles, 8, async ([z, x, y]) => {
    await keep(terrainSource.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), 'terrain');
    tick('Terrain');
  });
  await pool(extras, 4, async (url) => { await keep(url, 'other'); tick('Map labels'); });

  const area: SavedArea = {
    version: SAVED_AREA_VERSION, id, name: opts.name, layers: opts.layers, window: opts.hours, bbox, savedAt: new Date().toISOString(),
    weather: parts[0]!, more: parts.slice(1),
    basemap: { file: basemapFile, minzoom: 0, maxzoom: BASEMAP_MAXZOOM },
    cached,
    bytes: { weather: weatherBytes, basemap: basemapBytes, terrain: terrainBytes, other: otherBytes },
  };
  // Areas are kept side by side; the newest first.
  await writeFile(INDEX, JSON.stringify([area, ...await listSavedAreas()]));
  return area;
}

/** Remove an area's files and its record; cached files another area still uses stay. */
export async function deleteArea(area: SavedArea): Promise<void> {
  for (const f of weatherFiles(area)) await removeFile(f);
  await removeFile(area.basemap.file);
  const rest = (await listSavedAreas()).filter((a) => a.id !== area.id);
  const keepUrls = new Set(rest.flatMap((a) => a.cached));
  const cache = await caches.open(SAVED_CACHE);
  for (const url of area.cached) if (!keepUrls.has(url)) await cache.delete(url);
  await writeFile(INDEX, JSON.stringify(rest));
  for (const part of areaParts(area)) forgetSavedWeather(part.id);
}

/** A saved area's weather, decoded once and kept in memory. */
export interface SavedWeather { area: SavedArea; times: Date[]; steps: Record<string, Float32Array[]> }

/** One saved step as the model's own cells, for resampling or reading a point. */
export function savedStep(w: SavedWeather, i: number): NativeBox {
  return {
    model: w.area.weather.model,
    ranges: w.area.weather.ranges,
    values: Object.fromEntries(Object.entries(w.steps).map(([v, steps]) => [v, steps[i] ?? new Float32Array(0)])),
  };
}

const weatherCache = new Map<string, Promise<SavedWeather>>();
export function loadSavedWeather(area: SavedArea): Promise<SavedWeather> {
  let p = weatherCache.get(area.id);
  if (!p) {
    p = (async () => {
      const steps: Record<string, Float32Array[]> = {};
      let times: Date[] = [];
      for (const [v, name] of Object.entries(area.weather.files)) {
        const file = await readFile(name);
        if (!file) throw new Error(`saved file ${name} missing`);
        const decoded = decodeRegionFile(await file.arrayBuffer());
        steps[v] = decoded.steps;
        times = decoded.header.validTimes.map((t) => new Date(t));
      }
      return { area, times, steps };
    })();
    weatherCache.set(area.id, p);
  }
  return p;
}

export function forgetSavedWeather(id: string): void {
  weatherCache.delete(id);
}
