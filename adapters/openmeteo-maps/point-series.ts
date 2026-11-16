// The pin's series from the same map files the map draws, so map and tap
// agree. Reads only the bytes around the point from each step's file.
import type { PointSeries, VariableName } from '../../core/vocabulary';
import { readPointSeries } from '../../render/openmeteo-starter';
import { source, stepFileUrl, type RunMetadata } from './run-metadata';

/** Grid spacing of the models this adapter offers. */
export const MODELS: Record<string, { label: string; gridKm: number }> = {
  cmc_gem_hrdps: { label: 'HRDPS', gridKm: 2.5 },
};

export async function fetchPointSeries(run: RunMetadata, variables: VariableName[], lat: number, lon: number): Promise<PointSeries> {
  // The run's first file is the analysis, with no accumulated amounts yet.
  const times = run.validTimes.slice(1);
  const urls = times.map((t) => stepFileUrl(run.model, run.referenceTime, t));
  // The library reads amounts as hourly rates; with hourly steps that equals
  // the amount per step, the vocabulary's unit.
  const values = await readPointSeries(run.model, urls, variables, lat, lon, 1);
  return {
    label: {
      source: source.id,
      model: run.model,
      run: run.referenceTime,
      gridKm: MODELS[run.model]?.gridKm ?? NaN,
      licence: source.licence,
      attribution: source.attribution,
      fetchedAt: new Date(),
      offline: source.offline,
    },
    lat,
    lon,
    times,
    stepHours: 1,
    values: values as PointSeries['values'],
  };
}
