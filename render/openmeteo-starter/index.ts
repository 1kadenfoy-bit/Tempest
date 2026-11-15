// Rendering seam. The only module that imports the GPL-2.0 starter library
// (@openmeteo/weather-map-layer). Everything else asks for "weather fills" by
// file, variable and colour strip, and for values at a point; replacing this
// folder replaces the renderer.
import type { Map as MapLibreMap } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import {
  GridFactory,
  defaultDerivationRules,
  defaultOmProtocolSettings,
  domainOptions,
  getProtocolInstance,
  omProtocol,
  type OmProtocolSettings,
} from '@openmeteo/weather-map-layer';
import { precipTypeRules } from './precip-type-rules';

export const renderer = {
  name: 'Open-Meteo weather-map-layer',
  version: '0.3.2',
  licence: 'GPL-2.0',
  link: 'https://github.com/open-meteo/weather-map-layer',
} as const;

/** Evenly spaced RGBA entries (alpha 0..1) from min to max, built in core from the tokens. */
export interface LookupStrip {
  min: number;
  max: number;
  unit: string;
  colors: [number, number, number, number][];
}

export interface WeatherFill {
  id: string;
  /** Address of the .om file for one valid time. */
  fileUrl: string;
  variable: string;
  /** Hours covered by one step, for amounts turned into rates. */
  stepHours: number;
  strip: LookupStrip;
  opacity?: number;
}

// Colour scales are set per variable before a fill is shown; the library reads
// them when it renders each tile on the device. Derivation rules must be in
// place before the first request.
const settings: OmProtocolSettings = {
  ...defaultOmProtocolSettings,
  colorScales: { ...defaultOmProtocolSettings.colorScales },
  fileReaderConfig: {
    ...defaultOmProtocolSettings.fileReaderConfig,
    derivationRules: [...precipTypeRules, ...defaultDerivationRules],
  },
  // Three typed fills, plus the next step while scrubbing.
  maxStatesWithData: 8,
};

let registered = false;
export function registerRenderer(): void {
  if (registered) return;
  maplibregl.addProtocol('om', (params, abort) => omProtocol(params, abort, settings));
  registered = true;
}

const fillUrl = (f: WeatherFill) => {
  const params = new URLSearchParams({ variable: f.variable, delta_time_hours: String(f.stepHours) });
  return `om://${f.fileUrl}?${params}`;
};

/**
 * Show these fills, below `beforeLayerId`. Existing fills with the same id
 * switch to their new file in place; others are removed.
 */
export function showWeatherFills(map: MapLibreMap, fills: WeatherFill[], beforeLayerId?: string): void {
  registerRenderer();
  const keep = new Set(fills.map((f) => `wx-${f.id}`));
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('wx-') && !keep.has(layer.id)) {
      map.removeLayer(layer.id);
      map.removeSource(layer.id);
    }
  }
  for (const f of fills) {
    const id = `wx-${f.id}`;
    settings.colorScales[f.variable] = { type: 'rgba', ...f.strip };
    const url = fillUrl(f);
    const source = map.getSource(id) as maplibregl.RasterTileSource | undefined;
    if (source) {
      if ((source as unknown as { url?: string }).url !== url) source.setUrl(url);
      continue;
    }
    map.addSource(id, { type: 'raster', url, tileSize: 512 });
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': f.opacity ?? 0.85, 'raster-fade-duration': 0 } }, beforeLayerId);
  }
}

/** Whether the page can share decoded data with workers (the fast path). */
export function fastPathAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
}

/**
 * Values of several variables at one point, one per file, from the nearest
 * grid cell (as Open-Meteo's point forecast does for precipitation). Reads only
 * the few bytes around the point from each file, six files at a time.
 */
export async function readPointSeries(
  model: string,
  fileUrls: string[],
  variables: string[],
  lat: number,
  lon: number,
  stepHours = 1,
): Promise<Record<string, number[]>> {
  const domain = domainOptions.find((d) => d.value === model);
  if (!domain) throw new Error(`Unknown model ${model}`);
  const d = 0.05;
  const ranges = GridFactory.create(domain.grid).getCoveringRanges(lat - d, lon - d, lat + d, lon + d);
  const grid = GridFactory.create(domain.grid, ranges);
  const reader = getProtocolInstance(settings).omFileReader;
  const out: Record<string, number[]> = Object.fromEntries(variables.map((v) => [v, new Array<number>(fileUrls.length).fill(NaN)]));
  let next = 0;
  const worker = async () => {
    while (next < fileUrls.length) {
      const i = next++;
      for (const v of variables) {
        const data = await reader.readVariable(fileUrls[i]!, v, ranges, undefined, { deltaTimeHours: stepHours, domain });
        out[v]![i] = data.values ? grid.getInterpolatedValue(data.values, lat, lon, 'nearest') : NaN;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}
