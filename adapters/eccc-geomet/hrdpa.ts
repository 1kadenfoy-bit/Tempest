// Adapter: ECCC's High Resolution Deterministic Precipitation Analysis
// (HRDPA, also called CaPA): the best estimate of precipitation that fell,
// blending rain gauges, radar and HRDPS, at 2.5 km, in 6-hour totals.
//
// Checked Nov 16, 2026: GeoMet answers a point query (WMS GetFeatureInfo,
// JSON) from any site (CORS *). Layers: HRDPA_2.5km_Precip-Accum6h (final,
// about 6 h behind) and HRDPA-Prelim_2.5km_Precip-Accum6h (preliminary,
// sooner). TIME is the end of the 6 hours, every 6 h at 00, 06, 12, 18 UTC,
// for the past 30 days. Online only: GeoMet asks that it not be bulk-copied.

export const source = {
  id: 'eccc-hrdpa',
  name: 'ECCC precipitation analysis (HRDPA)',
  baseUrl: 'https://geo.weather.gc.ca/geomet',
  licence: 'Open Government Licence – Canada',
  attribution: 'Contains information from Environment and Climate Change Canada (HRDPA)',
  link: 'https://eccc-msc.github.io/open-data/msc-data/nwp_hrdpa/readme_hrdpa_en',
  offline: false,
} as const;

const FINAL = 'HRDPA_2.5km_Precip-Accum6h';
const PRELIM = 'HRDPA-Prelim_2.5km_Precip-Accum6h';
const H = 3_600_000;

export interface ObservedPeriod {
  /** End of the 6 hours. */
  end: Date;
  hours: 6;
  mm: number;
  prelim: boolean;
}

export function featureInfoUrl(layer: string, lat: number, lon: number, end: Date): string {
  const d = 0.01;
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo', layers: layer, query_layers: layer,
    crs: 'EPSG:4326', bbox: `${lat - d},${lon - d},${lat + d},${lon + d}`, width: '3', height: '3', i: '1', j: '1',
    info_format: 'application/json', time: end.toISOString().replace('.000Z', 'Z'),
  });
  return `${source.baseUrl}?${params}`;
}

/** The value in a GetFeatureInfo answer, or null when there is none. */
export function parseFeatureInfo(json: unknown): number | null {
  const f = (json as { features?: { properties?: { value?: unknown } }[] })?.features?.[0];
  const v = f?.properties?.value;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;
}

/** The 6-hour period ends from `from` to `to` (both rounded to 6 h). */
export function periodEnds(from: Date, to: Date): Date[] {
  const step = 6 * H;
  const out: Date[] = [];
  for (let t = Math.ceil(from.getTime() / step) * step; t <= to.getTime(); t += step) out.push(new Date(t));
  return out;
}

async function valueAt(layer: string, lat: number, lon: number, end: Date, fetchFn: typeof fetch): Promise<number | null> {
  try {
    const res = await fetchFn(featureInfoUrl(layer, lat, lon, end));
    if (!res.ok) return null;
    return parseFeatureInfo(await res.json());
  } catch {
    return null;
  }
}

/** Observed 6-hour totals at a point between two times: final where it exists, else preliminary. */
export async function fetchObserved(lat: number, lon: number, from: Date, to: Date, fetchFn: typeof fetch = fetch): Promise<ObservedPeriod[]> {
  const ends = periodEnds(from, to);
  const got = await Promise.all(ends.map(async (end) => {
    const fin = await valueAt(FINAL, lat, lon, end, fetchFn);
    if (fin !== null) return { end, hours: 6 as const, mm: fin, prelim: false };
    const pre = await valueAt(PRELIM, lat, lon, end, fetchFn);
    return pre === null ? null : { end, hours: 6 as const, mm: pre, prelim: true };
  }));
  return got.filter((x): x is ObservedPeriod => x !== null);
}
