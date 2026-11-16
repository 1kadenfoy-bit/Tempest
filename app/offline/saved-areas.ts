// Saving one area for offline use (M3, minimal): precipitation for every step
// of the current run, the base map and terrain for the box, and the map's
// fonts and icons. Everything goes through the normal adapters into the store
// on the device; reading it back uses the same path as live data.
import type { StyleSpecification } from 'maplibre-gl';
import { source, stepFileUrl, type RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import { readNativeBox, type NativeBox } from '../../render/openmeteo-starter';
import { gridRequest } from '../../core/geo/grid-request';
import { SAVED_AREA_VERSION, parseSavedAreas, tilesInBox, type SavedArea } from '../../core/offline/saved-area';
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

export async function saveArea(opts: {
  bbox: [number, number, number, number];
  /** Hours from now to keep, or null for every step to the model's end. */
  hours: number | null;
  run: RunMetadata;
  variables: VariableName[];
  basemap: Basemap;
  style: StyleSpecification;
  onProgress: (p: SaveProgress) => void;
}): Promise<SavedArea> {
  const { bbox, run, variables, basemap } = opts;
  void requestPersistence();
  const id = `a${Date.now().toString(36)}`;
  const now = Date.now();
  const H = 3_600_000;
  const times = run.validTimes.slice(1).filter((t) =>
    opts.hours === null || (t.getTime() > now - H && t.getTime() <= now + opts.hours * H));
  const req = gridRequest(bbox, 12, bbox, 1e-9)!; // the box itself, at the model's own spacing
  const terrainTiles = tilesInBox(bbox, 0, TERRAIN_MAXZOOM);
  const extras = glyphAndSpriteUrls(opts.style);
  const total = times.length + 1 + terrainTiles.length + extras.length;
  let done = 0;
  const tick = (label: string) => opts.onProgress({ done: ++done, total, label });

  // 1. Weather: every step of the run, as the model's own cells for the box,
  //    so the numbers offline are exactly the numbers online.
  const steps: Record<string, Float32Array[]> = Object.fromEntries(variables.map((v) => [v, new Array<Float32Array>(times.length)]));
  const { nx, ny } = req;
  let ranges: { start: number; end: number }[] = [];
  await pool(times.map((t, i) => ({ t, i })), 6, async ({ t, i }) => {
    const box = await readNativeBox(run.model, stepFileUrl(run.model, run.referenceTime, t), variables, bbox, 1);
    ranges = box.ranges;
    for (const v of variables) steps[v]![i] = box.values[v] ?? new Float32Array(0);
    tick('Precipitation');
  });
  const perStep = steps[variables[0]!]![0]?.length ?? 0;
  const files: Record<string, string> = {};
  let weatherBytes = 0;
  for (const v of variables) {
    const name = `${id}-${v}.bin`;
    const buf = encodeRegionFile({
      header: {
        version: REGION_FILE_VERSION, source: source.id, model: run.model, run: run.referenceTime.toISOString(), variable: v,
        unit: 'mm per step', bbox, validTimes: times.map((t) => t.toISOString()), valuesPerStep: perStep,
        savedAt: new Date().toISOString(), nx, ny, stepHours: 1, ranges,
      },
      steps: steps[v]!,
    });
    weatherBytes += await writeFile(name, new Uint8Array(buf));
    files[v] = name;
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
    version: SAVED_AREA_VERSION, id, bbox, savedAt: new Date().toISOString(),
    weather: { source: source.id, model: run.model, run: run.referenceTime.toISOString(), validTimes: times.map((t) => t.toISOString()), stepHours: 1, files, ranges, nx, ny },
    basemap: { file: basemapFile, minzoom: 0, maxzoom: BASEMAP_MAXZOOM },
    cached,
    bytes: { weather: weatherBytes, basemap: basemapBytes, terrain: terrainBytes, other: otherBytes },
  };
  // M3 keeps one area: the new one replaces any earlier one.
  for (const old of await listSavedAreas()) await deleteArea(old, area);
  await writeFile(INDEX, JSON.stringify([area]));
  return area;
}

export async function deleteArea(area: SavedArea, keepFor?: SavedArea): Promise<void> {
  for (const f of Object.values(area.weather.files)) await removeFile(f);
  await removeFile(area.basemap.file);
  const keepUrls = new Set(keepFor?.cached ?? []);
  const cache = await caches.open(SAVED_CACHE);
  for (const url of area.cached) if (!keepUrls.has(url)) await cache.delete(url);
  if (!keepFor) {
    const rest = (await listSavedAreas()).filter((a) => a.id !== area.id);
    await writeFile(INDEX, JSON.stringify(rest));
  }
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
