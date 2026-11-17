// Adapter: surface weather stations from ECCC's OGC API collection
// "swob-realtime" (SWOB-ML observations, decoded).
//
// Checked Nov 17, 2026 (pygeoapi 0.20.0 at api.weather.gc.ca):
// - Items: /collections/swob-realtime/items?f=json, GeoJSON, one feature per
//   station per report. Answers any site (Access-Control-Allow-Origin: *),
//   gzip on request (a 1° cell over 24 h: about 96 kB, 6 kB compressed).
// - Each station sends a report on the hour ("_is-minutely_obs-value" false)
//   and, for some MSC stations, one every minute. Only the hourly reports are
//   read here: one per hour is what a chart needs, and they carry the hour's
//   precipitation and highest wind.
// - Filters that work: bbox, datetime=<start>/.., msc_id-value=<id>,
//   _is-minutely_obs-value=false, sortby=(-)date_tm-value, and
//   properties=<list> to keep only the fields used. A name not in the
//   collection's queryables makes the whole request fail (HTTP 400), so the
//   request is retried once without the list.
// - Not only ECCC's own stations: NAV CANADA airports, BC Wildfire (BC-FOR,
//   e.g. Mount Cayley 1,592 m), Parks Canada (PC-NRMB) and Metro Vancouver
//   (BC-MVRD) also report here. BC highways (BC-TRAN) and BC snow pillows
//   (BC-ENV-ASW) do not (zero reports); theirs are only on the Datamart,
//   which sends no CORS header.
// - Partner reports carry an attribution notice ("data_attrib_not-value",
//   "Observational data provided by … All rights reserved."), shown with the
//   station word for word. ECCC's own (MSC) reports carry none.
// - Fields used (the first one present wins):
//   temperature: air_temp, then avg_air_temp_pst1hr (°C)
//   wind: avg_wnd_spd_10m_pst10mts / avg_wnd_dir_10m_pst10mts, then
//         avg_wnd_spd_pst10mts / avg_wnd_dir_pst10mts (km/h, degrees from)
//   highest wind: max_wnd_spd_10m_pst1hr (the past hour), then
//         max_wnd_gst_spd_10m_pst10mts (NAV CANADA's gust, past 10 min)
//   precipitation: pcpn_amt_pst1hr, then rnfl_amt_pst1hr (mm, past hour)
//   snow depth: snw_dpth, then avg_snw_dpth_pst5mts (cm)
//   elevation: the point's third coordinate (m).
// - The collection keeps about a month of reports; 48 h of one station's
//   hourly reports is about 25 kB.

import type { Box, Station, StationLatest, StationObservation } from '../../core/stations/stations';
import { newest } from '../../core/stations/stations';

export const source = {
  id: 'eccc-swob',
  name: 'ECCC surface weather stations',
  publisher: 'Environment and Climate Change Canada',
  provides: 'Measured temperature, wind, precipitation and snow depth at weather stations (ECCC and partner networks)',
  baseUrl: 'https://api.weather.gc.ca/collections/swob-realtime/items',
  licence: 'Open Government Licence – Canada (ECCC stations); partner stations: their own notice, shown with each station',
  attribution: 'Contains information from Environment and Climate Change Canada (surface weather observations)',
  link: 'https://eccc-msc.github.io/open-data/msc-data/obs_station/readme_obs_insitu_en',
  offline: false,
} as const;

/** The fields read, and nothing else (keeps answers small). */
export const FIELDS = [
  'stn_nam-value', 'msc_id-value', 'data_pvdr-value', 'date_tm-value', 'data_attrib_not-value',
  'air_temp', 'avg_air_temp_pst1hr',
  'avg_wnd_spd_10m_pst10mts', 'avg_wnd_dir_10m_pst10mts', 'avg_wnd_spd_pst10mts', 'avg_wnd_dir_pst10mts',
  'max_wnd_spd_10m_pst1hr', 'max_wnd_gst_spd_10m_pst10mts',
  'pcpn_amt_pst1hr', 'rnfl_amt_pst1hr',
  'snw_dpth', 'avg_snw_dpth_pst5mts',
] as const;

/** How far back the map's markers look for a station's newest report. Some partner stations report only now and then. */
export const LATEST_WINDOW_H = 24;

const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

function params(extra: Record<string, string>, withFields: boolean): URLSearchParams {
  const p = new URLSearchParams({ f: 'json', ...extra, '_is-minutely_obs-value': 'false' });
  if (withFields) p.set('properties', FIELDS.join(','));
  return p;
}

/** Hourly reports in a box over the past day, newest first: the map's markers. */
export function latestUrl(box: Box, now: Date, withFields = true): string {
  const from = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - LATEST_WINDOW_H * 3_600_000);
  return `${source.baseUrl}?${params({ bbox: box.join(','), datetime: `${iso(from)}/..`, sortby: '-date_tm-value', limit: '2000' }, withFields)}`;
}

/** One station's hourly reports since `from`, oldest first: the chart. */
export function seriesUrl(stationId: string, from: Date, withFields = true): string {
  return `${source.baseUrl}?${params({ 'msc_id-value': stationId, datetime: `${iso(from)}/..`, sortby: 'date_tm-value', limit: '500' }, withFields)}`;
}

type Props = Record<string, unknown>;
interface Feature { geometry?: { coordinates?: unknown[] } | null; properties?: Props }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const first = (p: Props, ...keys: string[]): number | null => {
  for (const k of keys) { const v = num(p[k]); if (v !== null) return v; }
  return null;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function station(f: Feature): Station | null {
  const p = f.properties ?? {};
  const c = f.geometry?.coordinates ?? [];
  const lon = num(c[0]), lat = num(c[1]);
  const id = str(p['msc_id-value']);
  if (lon === null || lat === null || !id) return null;
  const provider = str(p['data_pvdr-value']) || 'MSC';
  return {
    id: `${source.id}:${id}`,
    name: titleCase(str(p['stn_nam-value']) || id),
    provider,
    sourceId: source.id,
    lat, lon,
    elevation: num(c[2]),
    attribution: str(p['data_attrib_not-value']).split(' | ')[0] || source.attribution,
    link: source.link,
  };
}

function observation(p: Props): StationObservation | null {
  const t = new Date(str(p['date_tm-value']));
  if (Number.isNaN(t.getTime())) return null;
  return {
    time: t,
    airTemp: first(p, 'air_temp', 'avg_air_temp_pst1hr'),
    windSpeed: first(p, 'avg_wnd_spd_10m_pst10mts', 'avg_wnd_spd_pst10mts'),
    windDir: first(p, 'avg_wnd_dir_10m_pst10mts', 'avg_wnd_dir_pst10mts'),
    gust: first(p, 'max_wnd_spd_10m_pst1hr', 'max_wnd_gst_spd_10m_pst10mts'),
    precip1h: first(p, 'pcpn_amt_pst1hr', 'rnfl_amt_pst1hr'),
    snowDepth: first(p, 'snw_dpth', 'avg_snw_dpth_pst5mts'),
  };
}

/** "WHISTLER - NESTERS" → "Whistler - Nesters"; names already in mixed case stay as given. */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s\-(/.])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Cs|Aut|Ccg)\b/g, (m) => m.toUpperCase());
}

function features(json: unknown): Feature[] {
  const f = (json as { features?: unknown })?.features;
  return Array.isArray(f) ? (f as Feature[]) : [];
}

/** Every station in an answer with its newest report that has a value. */
export function parseLatest(json: unknown): StationLatest[] {
  const byId = new Map<string, { station: Station; obs: StationObservation[] }>();
  for (const f of features(json)) {
    const s = station(f);
    const o = observation(f.properties ?? {});
    if (!s || !o) continue;
    const e = byId.get(s.id) ?? { station: s, obs: [] };
    e.obs.push(o);
    byId.set(s.id, e);
  }
  return [...byId.values()].map((e) => ({ station: e.station, latest: newest(e.obs) }));
}

/** One station's reports, as given (the overlay orders them for the chart). */
export function parseSeries(json: unknown): { station: Station | null; observations: StationObservation[] } {
  const fs = features(json);
  const observations = fs.flatMap((f) => { const o = observation(f.properties ?? {}); return o ? [o] : []; });
  return { station: fs.length ? station(fs[fs.length - 1]!) : null, observations };
}

/** The network's own id for a station id from this adapter. */
export const networkId = (stationId: string) => stationId.slice(source.id.length + 1);

/** GET, retried once without the field list when the collection refuses one of its names. */
async function getJson(url: (withFields: boolean) => string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const init = signal ? { signal } : undefined;
  let res = await fetchFn(url(true), init);
  if (res.status === 400) res = await fetchFn(url(false), init);
  if (!res.ok) throw new Error(`ECCC stations: HTTP ${res.status}`);
  return res.json();
}

/** Stations in a box with their newest hourly report. Throws when ECCC cannot be reached. */
export async function fetchLatest(box: Box, now: Date, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<StationLatest[]> {
  return parseLatest(await getJson((w) => latestUrl(box, now, w), fetchFn, signal));
}

/** One station's hourly reports since `from`. */
export async function fetchSeries(stationId: string, from: Date, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<StationObservation[]> {
  return parseSeries(await getJson((w) => seriesUrl(networkId(stationId), from, w), fetchFn, signal)).observations;
}
