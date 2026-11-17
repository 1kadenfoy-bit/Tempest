// The pin's series from the same map files the map draws, so map and tap
// agree. Reads only the bytes around the point from each step's file.
import { isAmount, type PointSeries, type VariableName } from '../../core/vocabulary';
import { readPointFast } from '../../render/openmeteo-starter/om-reader';
import { source, stepFileUrl, type RunMetadata } from './run-metadata';

/** Grid spacing of the models this adapter offers. */
export const MODELS: Record<string, { label: string; gridKm: number }> = {
  cmc_gem_hrdps: { label: 'HRDPS', gridKm: 2.5 },
};

export async function fetchPointSeries(run: RunMetadata, variables: VariableName[], lat: number, lon: number): Promise<PointSeries> {
  // The run's first file is the analysis, with no accumulated amounts yet.
  const times = run.validTimes.slice(1);
  const urls = times.map((t) => stepFileUrl(run.model, run.referenceTime, t));
  // Stored as hourly rates; with hourly steps that equals the amount per
  // step, the vocabulary's unit. Small parallel reads (the library's 64 kB
  // blocks cost 15 MB for one point's 48 hours; measured Nov 17).
  const values = await readPointFast(run.model, urls, variables, lat, lon);
  // Rates back to amounts per step: a 3-hour step (longer models) holds three hours' worth.
  const steps = times.map((t, i) => (t.getTime() - (i ? times[i - 1]! : run.validTimes[0]!).getTime()) / 3_600_000);
  for (const v of variables) {
    if (!isAmount(v) || !values[v]) continue;
    values[v] = values[v]!.map((x, i) => x * (steps[i] ?? 1));
  }
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
