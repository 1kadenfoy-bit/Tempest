// Rendering seam. The only module that imports the GPL-2.0 starter library
// (@openmeteo/weather-map-layer). Everything else asks for a "weather fill" by
// model, variable and file; replacing this folder replaces the renderer.
import type { Map as MapLibreMap } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import { defaultOmProtocolSettings, omProtocol, type OmProtocolSettings } from '@openmeteo/weather-map-layer';

let registered = false;
// Colour scales are replaced per variable before a fill is shown; the library
// reads them when it renders each tile on the device.
const settings: OmProtocolSettings = { ...defaultOmProtocolSettings, colorScales: { ...defaultOmProtocolSettings.colorScales } };

/** Evenly spaced RGBA entries (alpha 0..1) from min to max, built in core from the tokens. */
export interface LookupStrip {
  min: number;
  max: number;
  unit: string;
  colors: [number, number, number, number][];
}

export interface WeatherFill {
  /** Address of the .om file for one valid time. */
  fileUrl: string;
  variable: string;
  /** Hours covered by one step, for amounts turned into rates. */
  stepHours: number;
  strip: LookupStrip;
  opacity?: number;
  beforeLayerId?: string;
}

export const renderer = {
  name: 'Open-Meteo weather-map-layer',
  version: '0.3.2',
  licence: 'GPL-2.0',
  link: 'https://github.com/open-meteo/weather-map-layer',
} as const;

export function registerRenderer(): void {
  if (registered) return;
  maplibregl.addProtocol('om', (params, abort) => omProtocol(params, abort, settings));
  registered = true;
}

const SOURCE = 'weather-fill';

export function showWeatherFill(map: MapLibreMap, fill: WeatherFill): void {
  registerRenderer();
  settings.colorScales[fill.variable] = { type: 'rgba', ...fill.strip };
  if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  const params = new URLSearchParams({
    variable: fill.variable,
    delta_time_hours: String(fill.stepHours),
  });
  map.addSource(SOURCE, { type: 'raster', url: `om://${fill.fileUrl}?${params}`, tileSize: 512 });
  map.addLayer(
    { id: SOURCE, type: 'raster', source: SOURCE, paint: { 'raster-opacity': fill.opacity ?? 0.75 } },
    fill.beforeLayerId,
  );
}

/** Whether the page can share decoded data with workers (the fast path). */
export function fastPathAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
}
