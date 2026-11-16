// Open-Meteo's point forecast API, used to check the app's pin numbers (read
// from the map files) against Open-Meteo's own figures for the same model.
// Not a data source for the layer.
export const POINT_API_MODEL: Record<string, string> = { cmc_gem_hrdps: 'gem_hrdps_continental' };

/** The run Open-Meteo's point API is serving now, which can lag the map files by a run. */
export async function fetchApiRun(model: string, fetchFn: typeof fetch = fetch): Promise<Date> {
  const res = await fetchFn(`https://api.open-meteo.com/data/${model}/static/meta.json`);
  const json = (await res.json()) as { last_run_initialisation_time?: number };
  if (!res.ok || !json.last_run_initialisation_time) throw new Error(`point API metadata ${res.status}`);
  return new Date(json.last_run_initialisation_time * 1000);
}

export interface ApiSeries { times: Date[]; precipitation: number[]; snowfallCm: number[] }

export async function fetchApiSeries(model: string, lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<ApiSeries> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    hourly: 'precipitation,snowfall',
    models: POINT_API_MODEL[model] ?? model,
    // The grid cell nearest the point, as the app reads it.
    cell_selection: 'nearest',
    timezone: 'GMT', past_days: '1', forecast_days: '3',
  });
  const res = await fetchFn(`https://api.open-meteo.com/v1/forecast?${params}`);
  const json = (await res.json()) as { error?: boolean; reason?: string; hourly?: { time: string[]; precipitation: (number | null)[]; snowfall: (number | null)[] } };
  if (!res.ok || json.error || !json.hourly) throw new Error(json.reason ?? `point API ${res.status}`);
  return {
    times: json.hourly.time.map((t) => new Date(`${t}:00Z`)),
    precipitation: json.hourly.precipitation.map((v) => v ?? NaN),
    snowfallCm: json.hourly.snowfall.map((v) => v ?? NaN),
  };
}

export interface Comparison { hours: number; maxDiffMm: number; meanDiffMm: number; appTotalMm: number; apiTotalMm: number; matchedWithin01: number }

/** Hour by hour over the times both cover. */
export function comparePrecip(appTimes: Date[], app: number[], api: ApiSeries): Comparison {
  const byTime = new Map(api.times.map((t, i) => [t.getTime(), api.precipitation[i]!]));
  let hours = 0, max = 0, sum = 0, appTotal = 0, apiTotal = 0, within = 0;
  appTimes.forEach((t, i) => {
    const a = app[i];
    const b = byTime.get(t.getTime());
    if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return;
    const d = Math.abs(a - b);
    hours++; sum += d; max = Math.max(max, d); appTotal += a; apiTotal += b;
    if (d <= 0.1) within++;
  });
  return { hours, maxDiffMm: max, meanDiffMm: hours ? sum / hours : NaN, appTotalMm: appTotal, apiTotalMm: apiTotal, matchedWithin01: within };
}
