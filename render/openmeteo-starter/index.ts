// Starter-library seam. The only module that imports the GPL-2.0 library
// (@openmeteo/weather-map-layer). Since M3 it only reads Open-Meteo's .om map
// files (values at a point, or a box resampled to latitude/longitude); the
// drawing is the app's own (render/grid-gl). The library's file decoder
// (@openmeteo/file-reader) is GPL-2.0 too.
import {
  GridFactory,
  defaultDerivationRules,
  defaultOmProtocolSettings,
  domainOptions,
  getProtocolInstance,
  type OmProtocolSettings,
} from '@openmeteo/weather-map-layer';

export const renderer = {
  name: 'Open-Meteo weather-map-layer',
  version: '0.3.2',
  licence: 'GPL-2.0',
  link: 'https://github.com/open-meteo/weather-map-layer',
} as const;

// Reader settings. Since M3 the app draws with its own renderer
// (render/grid-gl); the starter library only reads the model files.
const settings: OmProtocolSettings = {
  ...defaultOmProtocolSettings,
  colorScales: { ...defaultOmProtocolSettings.colorScales },
  fileReaderConfig: {
    ...defaultOmProtocolSettings.fileReaderConfig,
    derivationRules: [...defaultDerivationRules],
  },
  maxStatesWithData: 4,
};

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

/** A box of the model's own grid cells, as read from one step's file. */
export interface NativeBox {
  model: string;
  ranges: { start: number; end: number }[];
  /** Values per variable, in the file's own cell order. */
  values: Record<string, Float32Array>;
}

function domainFor(model: string) {
  const domain = domainOptions.find((d) => d.value === model);
  if (!domain) throw new Error(`Unknown model ${model}`);
  return domain;
}

/** Read the model cells covering a box (plus a margin) from one step's file. */
export async function readNativeBox(model: string, fileUrl: string, variables: string[], bbox: [number, number, number, number], stepHours = 1): Promise<NativeBox> {
  const domain = domainFor(model);
  const [w, s, e, n] = bbox;
  const pad = 0.05;
  const ranges = GridFactory.create(domain.grid).getCoveringRanges(s - pad, w - pad, n + pad, e + pad);
  const reader = getProtocolInstance(settings).omFileReader;
  const values: Record<string, Float32Array> = {};
  for (const v of variables) {
    const data = await reader.readVariable(fileUrl, v, ranges, undefined, { deltaTimeHours: stepHours, domain });
    values[v] = Float32Array.from(data.values ?? []);
  }
  return { model, ranges, values };
}

/** Resample model cells onto a regular latitude/longitude grid (rows south to north). */
export function regridNative(box: NativeBox, variable: string, bbox: [number, number, number, number], nx: number, ny: number): Float32Array {
  const grid = GridFactory.create(domainFor(box.model).grid, box.ranges);
  const src = box.values[variable];
  const [w, s, e, n] = bbox;
  const dst = new Float32Array(nx * ny);
  if (!src || !src.length) return dst;
  for (let j = 0; j < ny; j++) {
    const lat = s + ((j + 0.5) / ny) * (n - s);
    for (let i = 0; i < nx; i++) {
      const lon = w + ((i + 0.5) / nx) * (e - w);
      const val = grid.getLinearInterpolatedValue(src, lat, lon);
      dst[j * nx + i] = Number.isFinite(val) ? val : 0;
    }
  }
  return dst;
}

/** The nearest model cell's value at a point (as Open-Meteo's point forecast reads it). */
export function sampleNative(box: NativeBox, variable: string, lat: number, lon: number): number {
  const src = box.values[variable];
  if (!src || !src.length) return NaN;
  return GridFactory.create(domainFor(box.model).grid, box.ranges).getInterpolatedValue(src, lat, lon, 'nearest');
}

/**
 * Read variables from one step's file for a box, and resample them onto a
 * regular latitude/longitude grid (rows south to north). The model grid
 * (rotated for HRDPS) never leaves this seam.
 */
export async function readRegularGrid(
  model: string,
  fileUrl: string,
  variables: string[],
  bbox: [number, number, number, number],
  nx: number,
  ny: number,
  stepHours = 1,
): Promise<Record<string, Float32Array>> {
  const box = await readNativeBox(model, fileUrl, variables, bbox, stepHours);
  return Object.fromEntries(variables.map((v) => [v, regridNative(box, v, bbox, nx, ny)]));
}
export { coveringRanges } from './om-reader';
