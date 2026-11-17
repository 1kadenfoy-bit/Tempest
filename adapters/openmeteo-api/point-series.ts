// Adapter: Open-Meteo's point forecast API. One request returns every hour of
// a run for up to a few dozen places, which is what a pin's series and the
// temperature layer's profile nodes need. (The map files hold one hour per
// file, so a 48-hour profile series from them costs about 1,500 small reads.)
//
// Checked Nov 16, 2026: docs/05-data-sources.md lists this API for point
// forecasts. Free for non-commercial use: 600 calls a minute, 5,000 an hour,
// 10,000 a day; a request asking for more than 10 variables counts as one
// call per 10, per place. `cell_selection=nearest` reads the nearest model
// cell, as the app reads the map files, so both agree for the same run.
import type { PointSeries, VariableName } from '../../core/vocabulary';

export const source = {
  id: 'openmeteo-api',
  name: 'Open-Meteo forecast API',
  provides: 'The forecast at the pin and the terrain profiles',
  baseUrl: 'https://api.open-meteo.com',
  licence: 'CC BY 4.0',
  attribution: 'Weather data by Open-Meteo.com (CC BY 4.0), from Environment and Climate Change Canada models',
  link: 'https://open-meteo.com/',
  offline: false,
  terms: 'Free for non-commercial use; 10,000 calls a day; no uptime guarantee.',
} as const;

/** The map files' model names, as the point API calls them. */
export const API_MODEL: Record<string, string> = {
  cmc_gem_hrdps: 'gem_hrdps_continental',
  cmc_gem_rdps_10km: 'gem_regional',
  cmc_gem_gdps_15km: 'gem_global',
  cmc_gem_gdps_15km_upper_level: 'gem_global',
  ecmwf_ifs: 'ecmwf_ifs',
};
/** Days ahead to ask for: each model's own reach (asking for more than 2 weeks counts extra against the limit). */
const FORECAST_DAYS: Record<string, number> = { cmc_gem_hrdps: 3, cmc_gem_rdps_10km: 5, cmc_gem_gdps_15km: 11, cmc_gem_gdps_15km_upper_level: 11, ecmwf_ifs: 14 };
const GRID_KM: Record<string, number> = { cmc_gem_hrdps: 2.5, cmc_gem_rdps_10km: 10, cmc_gem_gdps_15km: 15, cmc_gem_gdps_15km_upper_level: 15, ecmwf_ifs: 9 };

/** The run the point API serves now (it can lag the map files by a run). */
export async function fetchApiRun(model: string, fetchFn: typeof fetch = fetch): Promise<Date> {
  const res = await fetchFn(`${source.baseUrl}/data/${model}/static/meta.json`);
  const json = (await res.json()) as { last_run_initialisation_time?: number };
  if (!res.ok || !json.last_run_initialisation_time) throw new Error(`point API metadata ${res.status}`);
  return new Date(json.last_run_initialisation_time * 1000);
}

interface ApiLocation {
  latitude: number;
  longitude: number;
  hourly?: { time: number[] } & Record<string, (number | null)[]>;
  error?: boolean;
  reason?: string;
}

/** "2026-11-17T06:00" (the API's hour format, UTC). */
const apiHour = (t: Date) => t.toISOString().slice(0, 16);

/**
 * `hours`: ask only for this span (the map's nodes need the run's own hours);
 * without it, two days back and as far ahead as the model reaches (the pin).
 */
export function apiUrl(model: string, points: readonly { lat: number; lon: number }[], variables: readonly string[], hours?: [Date, Date]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: variables.join(','),
    models: API_MODEL[model] ?? model,
    cell_selection: 'nearest',
    timeformat: 'unixtime',
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  if (hours) {
    params.set('start_hour', apiHour(hours[0]));
    params.set('end_hour', apiHour(hours[1]));
  } else {
    // Two days back (the week strip's past) and as far ahead as the longest model.
    params.set('past_days', '2');
    params.set('forecast_days', String(FORECAST_DAYS[model] ?? 3));
  }
  return `${source.baseUrl}/v1/forecast?${params}`;
}

/** Parse a response (one place, or an array for several) into point series, keeping the run's hours. */
export function parseApiSeries(json: unknown, model: string, run: Date, variables: readonly VariableName[], points: readonly { lat: number; lon: number }[], validTimes: readonly Date[]): PointSeries[] {
  const one = json as ApiLocation;
  if (!Array.isArray(json) && one?.error) throw new Error(one.reason ?? 'point API error');
  const list = (Array.isArray(json) ? json : [json]) as ApiLocation[];
  if (list.length !== points.length) throw new Error(`point API returned ${list.length} places for ${points.length}`);
  const wanted = new Set(validTimes.map((t) => t.getTime()));
  return list.map((loc, n) => {
    if (loc.error || !loc.hourly) throw new Error(loc.reason ?? 'point API: no hourly data');
    const idx: number[] = [];
    loc.hourly.time.forEach((s, i) => { if (wanted.has(s * 1000)) idx.push(i); });
    const values: PointSeries['values'] = {};
    for (const v of variables) {
      const col = loc.hourly[v];
      values[v] = idx.map((i) => col?.[i] ?? NaN);
    }
    return {
      label: { source: source.id, model, run, gridKm: GRID_KM[model] ?? NaN, licence: source.licence, attribution: source.attribution, fetchedAt: new Date(), offline: false },
      lat: points[n]!.lat,
      lon: points[n]!.lon,
      times: idx.map((i) => new Date(loc.hourly!.time[i]! * 1000)),
      stepHours: 1,
      values,
    };
  });
}

/**
 * The API said no because of its free limits (HTTP 429). `until`: when to ask
 * again, from its reason: the next minute, hour or day.
 */
export class ApiLimitError extends Error {
  constructor(readonly reason: string, readonly until: Date) { super(reason); }
}

/** When a refusal's limit resets, from its reason ("Minutely API request limit exceeded…"). */
export function limitResets(reason: string, now = new Date()): Date {
  const r = reason.toLowerCase();
  const next = new Date(now);
  if (r.includes('daily')) { next.setUTCHours(24, 0, 30, 0); return next; }
  if (r.includes('hourly')) { next.setUTCMinutes(60, 30, 0); return next; }
  next.setUTCSeconds(60, 0);
  return next;
}

const pause = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Every hour of a run at several places. A dropped connection or a server
 * error is tried again twice, after half a second and after two; a refusal
 * for the free limits throws ApiLimitError at once.
 */
export async function fetchApiSeries(model: string, run: Date, variables: readonly VariableName[], points: readonly { lat: number; lon: number }[], validTimes: readonly Date[], fetchFn: typeof fetch = fetch, hours?: [Date, Date]): Promise<PointSeries[]> {
  const url = apiUrl(model, points, variables, hours);
  let lastErr: unknown;
  for (const wait of [0, 500, 2000]) {
    if (wait) await pause(wait);
    let res: Response;
    try {
      // A connection that hangs is given up after 15 s and tried again.
      res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      lastErr = err; // dropped connection (a refusal without the CORS headers also lands here)
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as { reason?: string };
    if (res.status === 429) throw new ApiLimitError(json.reason ?? 'API request limit exceeded', limitResets(json.reason ?? ''));
    if (res.status >= 500) { lastErr = new Error(json.reason ?? `point API ${res.status}`); continue; }
    if (!res.ok) throw new Error(json.reason ?? `point API ${res.status}`);
    return parseApiSeries(json, model, run, variables, points, validTimes);
  }
  throw lastErr;
}
