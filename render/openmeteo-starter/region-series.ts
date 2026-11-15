// Read one variable for one box across a run's valid times, using the starter
// library's partial-read file reader, and sample it at a point. Used by the M0
// region-file spike (docs/spikes/08-region-file.md); a candidate for the M3
// saved-area path.
import { GridFactory, defaultOmProtocolSettings, domainOptions, getProtocolInstance } from '@openmeteo/weather-map-layer';

export type BBox = [west: number, south: number, east: number, north: number];

export interface RegionSeries {
  model: string;
  variable: string;
  validTimes: Date[];
  /** One array per valid time, on the model's own grid inside the box. */
  steps: Float32Array[];
  /** Interpolated value at a point for step i. */
  sample(i: number, lat: number, lon: number): number;
  bytesPerStep: number;
}

export async function readRegionSeries(
  model: string,
  fileUrls: string[],
  validTimes: Date[],
  variable: string,
  bbox: BBox,
  onStep?: (done: number, total: number) => void,
): Promise<RegionSeries> {
  const domain = domainOptions.find((d) => d.value === model);
  if (!domain) throw new Error(`Unknown model ${model}`);
  const [w, s, e, n] = bbox;
  const ranges = GridFactory.create(domain.grid).getCoveringRanges(s, w, n, e);
  const grid = GridFactory.create(domain.grid, ranges);
  const reader = getProtocolInstance(defaultOmProtocolSettings).omFileReader;
  // Six files at a time: polite to the server, and far faster than one by one.
  const steps: Float32Array[] = new Array<Float32Array>(fileUrls.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < fileUrls.length) {
      const i = next++;
      const data = await reader.readVariable(fileUrls[i]!, variable, ranges, undefined, { deltaTimeHours: 1 });
      // Copy out of any shared buffer so the step can be stored.
      steps[i] = Float32Array.from(data.values ?? []);
      onStep?.(++done, fileUrls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return {
    model,
    variable,
    validTimes,
    steps,
    sample: (i, lat, lon) => {
      const step = steps[i];
      return step ? grid.getLinearInterpolatedValue(step, lat, lon) : NaN;
    },
    bytesPerStep: (steps[0]?.length ?? 0) * 4,
  };
}
