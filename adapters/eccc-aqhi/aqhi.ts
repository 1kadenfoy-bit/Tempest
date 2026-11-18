// Adapter: ECCC's Air Quality Health Index (AQHI), observed and forecast, by
// station, from the MSC OGC API. Safety information: shown exactly as issued.
//
// Checked Nov 18, 2026 from the build machine (CORS *, no key):
// - Observations: /collections/aqhi-observations-realtime/items, one point per
//   station per hour. Queryables include bbox, `latest` (true for the newest
//   hour per station), location_id, observation_datetime. Fields used:
//   location_name_en, location_id, observation_datetime,
//   observation_datetime_text_en, aqhi (unrounded, e.g. 1.41).
// - Forecasts: /collections/aqhi-forecasts-realtime/items, one point per
//   station per forecast hour per publication (twice a day, about 38 hours
//   each; publications at 00Z and 13Z seen). `sortby=-publication_datetime,
//   forecast_datetime` puts the newest publication's hours first. Fields used:
//   publication_datetime, forecast_datetime, aqhi (whole numbers).
// - Near Manning Park three stations answered (Central and Eastern Fraser
//   Valley, South Okanagan), the nearest about 83 km away.
import type { AqhiForecast, AqhiObserved } from '../../core/air/state';
import { kmBetween } from '../../core/air/fires';

export const source = {
  id: 'eccc-aqhi',
  name: 'ECCC Air Quality Health Index (AQHI)',
  provides: 'Observed and forecast AQHI at the station nearest the pin, as issued',
  baseUrl: 'https://api.weather.gc.ca',
  licence: 'Open Government Licence – Canada',
  attribution: 'Contains information from Environment and Climate Change Canada (AQHI)',
  link: 'https://api.weather.gc.ca/collections/aqhi-observations-realtime',
  offline: false,
} as const;

/** ECCC's page for BC's AQHI, where people read it (not opened from the build machine: weather.gc.ca is blocked there). */
export const PUBLIC_PAGE = 'https://weather.gc.ca/airquality/pages/provincial_summary/bc_e.html';

/** Stations farther than this from the pin are not named as its AQHI. */
export const MAX_KM = 100;

export function observationsUrl(lat: number, lon: number, deg = 1.5): string {
  const bbox = [lon - deg * 1.5, lat - deg, lon + deg * 1.5, lat + deg].map((x) => x.toFixed(3)).join(',');
  return `${source.baseUrl}/collections/aqhi-observations-realtime/items?f=json&latest=true&limit=50&bbox=${bbox}`;
}

export function forecastsUrl(locationId: string): string {
  return `${source.baseUrl}/collections/aqhi-forecasts-realtime/items?f=json&location_id=${encodeURIComponent(locationId)}&sortby=-publication_datetime,forecast_datetime&limit=60`;
}

interface Feature { geometry?: { coordinates?: [number, number] } | null; properties?: Record<string, unknown> }
const features = (json: unknown): Feature[] => ((json as { features?: Feature[] })?.features ?? []);
const date = (x: unknown) => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? new Date(x) : null);

/** Every station's newest reading, nearest first, within MAX_KM. */
export function parseObservations(json: unknown, lat: number, lon: number): AqhiObserved[] {
  const out: AqhiObserved[] = [];
  for (const f of features(json)) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    const time = date(p.observation_datetime);
    if (!c || typeof p.aqhi !== 'number' || !time) continue;
    const km = kmBetween({ lat, lon }, { lat: c[1], lon: c[0] });
    if (km > MAX_KM) continue;
    out.push({
      station: String(p.location_name_en ?? p.location_id ?? ''), stationId: String(p.location_id ?? ''),
      lat: c[1], lon: c[0], km, value: p.aqhi, time, timeText: String(p.observation_datetime_text_en ?? ''),
    });
  }
  // One reading per station (the newest), nearest first.
  const best = new Map<string, AqhiObserved>();
  for (const o of out) { const had = best.get(o.stationId); if (!had || had.time < o.time) best.set(o.stationId, o); }
  return [...best.values()].sort((a, b) => a.km - b.km);
}

/** The newest publication's hours for one station. */
export function parseForecast(json: unknown, station: { station: string; stationId: string; km: number }): AqhiForecast | null {
  const rows = features(json).map((f) => f.properties ?? {}).flatMap((p) => {
    const pub = date(p.publication_datetime), time = date(p.forecast_datetime);
    return pub && time && typeof p.aqhi === 'number' ? [{ pub, time, value: p.aqhi }] : [];
  });
  if (!rows.length) return null;
  const newest = Math.max(...rows.map((r) => r.pub.getTime()));
  const hours = rows.filter((r) => r.pub.getTime() === newest).map((r) => ({ time: r.time, value: r.value })).sort((a, b) => a.time.getTime() - b.time.getTime());
  return { ...station, published: new Date(newest), hours };
}
