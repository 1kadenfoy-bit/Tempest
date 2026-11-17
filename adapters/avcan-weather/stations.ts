// Adapter: Avalanche Canada's weather stations (mountain telemetry stations,
// many run by avalanche programs, parks and highways).
//
// Read from Avalanche Canada's API documentation (https://avalanche.ca/api-docs),
// Nov 17, 2026:
// - Base https://weather.prod.avalanche.ca (the old api.avalanche.ca/weather
//   paths answer 404).
// - GET /stations: every station, as a list of { stationId, name, latitude,
//   longitude, elevation (m), timezone, externalId, source }. No box filter:
//   the list is asked for once and kept for a day.
// - GET /stations/{stationId}/measurements?fromDate=<ISO>&toDate=<ISO>: the
//   station's readings, the past week when no dates are given. Each reading
//   has measurementDateTime, airTempAvg/Max/Min (°C), windSpeedAvg and
//   windSpeedGust (km/h), windDirAvg (degrees), relativeHumidity, snowHeight
//   (cm), and when measured hourlyPrecip (mm), hourlySnow, newSnow,
//   snowWaterEquivalent, stationPressure, snowTemp. The schema calls the
//   answer `measurements[]`; the example shows a bare list. Both are read.
// - No API terms; the site's Terms of Use and Data Sharing Policy apply (see
//   docs/spikes/04-avalanche-canada.md). Credit: "Avalanche Canada", and the
//   station's own source.
//
// - The public page https://avalanche.ca/weather/stations carries the same
//   station list in its page data (154 stations, Nov 17, 2026: 107 from BC
//   highways, 28 Parks Canada, 8 Avalanche Canada, 5 Kananaskis, 5 Avalanche
//   Québec, 1 Yukon), including Mt. Strachan 1,420 m above the North Shore
//   and Blowdown Peak 2,320 m. That list is the stations fixture. The site
//   itself reads the measurements from weather.prod.avalanche.ca in the
//   browser, and shows "Avalanche Canada makes no guarantee regarding the
//   completeness or accuracy of this data."
//
// NOT VERIFIED LIVE: weather.prod.avalanche.ca is refused by the cloud
// session's network, so its real answers, whether it lets other sites read
// it (CORS) and its rate limits could not be checked. The measurements
// fixture is the documentation's own example. The overlay asks for it and,
// if the phone's browser cannot read it, simply shows ECCC's stations alone.

import type { Station, StationObservation } from '../../core/stations/stations';

export const source = {
  id: 'avcan-weather',
  name: 'Avalanche Canada weather stations',
  publisher: 'Avalanche Canada',
  provides: 'Measured temperature, wind, precipitation and snow height at mountain weather stations',
  baseUrl: 'https://weather.prod.avalanche.ca',
  licence: 'Avalanche Canada Terms of Use and Data Sharing Policy (no API-specific licence)',
  attribution: 'Weather station data from Avalanche Canada',
  link: 'https://avalanche.ca/weather/stations',
  terms: 'https://avalanche.ca/terms-of-use',
  offline: false,
} as const;

export const stationsUrl = () => `${source.baseUrl}/stations`;

const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

export function measurementsUrl(stationId: string, from: Date, to?: Date): string {
  const p = new URLSearchParams({ fromDate: iso(from) });
  if (to) p.set('toDate', iso(to));
  return `${source.baseUrl}/stations/${encodeURIComponent(stationId)}/measurements?${p}`;
}

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** The station list. Entries without a place are skipped. */
export function parseStations(json: unknown): Station[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { stations?: unknown })?.stations) ? (json as { stations: unknown[] }).stations : [];
  const out: Station[] = [];
  for (const raw of list as Obj[]) {
    const id = str(raw?.stationId);
    const lat = num(raw?.latitude), lon = num(raw?.longitude);
    if (!id || lat === null || lon === null) continue;
    const runBy = str(raw.source);
    out.push({
      id: `${source.id}:${id}`,
      name: str(raw.name) || id,
      provider: runBy ? `Avalanche Canada · ${runBy}` : 'Avalanche Canada',
      sourceId: source.id,
      lat, lon,
      elevation: num(raw.elevation),
      attribution: runBy ? `${source.attribution}; station run by ${runBy}` : source.attribution,
      link: source.link,
    });
  }
  return out;
}

/** A station's readings, as given. */
export function parseMeasurements(json: unknown): StationObservation[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { measurements?: unknown })?.measurements) ? (json as { measurements: unknown[] }).measurements : [];
  const out: StationObservation[] = [];
  for (const m of list as Obj[]) {
    const t = new Date(str(m?.measurementDateTime));
    if (Number.isNaN(t.getTime())) continue;
    out.push({
      time: t,
      airTemp: num(m.airTempAvg),
      windSpeed: num(m.windSpeedAvg),
      windDir: num(m.windDirAvg),
      gust: num(m.windSpeedGust),
      precip1h: num(m.hourlyPrecip),
      snowDepth: num(m.snowHeight),
    });
  }
  return out;
}

export const networkId = (stationId: string) => stationId.slice(source.id.length + 1);

/** Every station. Throws when Avalanche Canada cannot be reached (or the browser may not read it). */
export async function fetchStations(fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<Station[]> {
  const res = await fetchFn(stationsUrl(), signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`Avalanche Canada stations: HTTP ${res.status}`);
  return parseStations(await res.json());
}

/** One station's readings since `from`. */
export async function fetchMeasurements(stationId: string, from: Date, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<StationObservation[]> {
  const res = await fetchFn(measurementsUrl(networkId(stationId), from), signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`Avalanche Canada measurements: HTTP ${res.status}`);
  return parseMeasurements(await res.json());
}
