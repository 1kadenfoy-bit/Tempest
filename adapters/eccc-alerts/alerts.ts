// Adapter: ECCC public weather alerts (warnings, watches, advisories,
// statements) from the OGC API collection "weather-alerts".
//
// Checked Nov 17, 2026 (pygeoapi 0.20.0 at api.weather.gc.ca):
// - Items: /collections/weather-alerts/items?f=json, GeoJSON, one feature per
//   alert per area. Answers any site (Access-Control-Allow-Origin: *).
// - A tiny bbox around the pin returns only the areas whose polygons contain
//   it (a point in the City of Lethbridge returned the city only, not the
//   county that surrounds it), so it serves as a point query.
//   skipGeometry=true keeps the answer to a few kB.
// - Fields used: alert_type (warning, watch, advisory, statement),
//   alert_name_en ("snowfall warning"), feature_name_en (area),
//   risk_colour_en (yellow, orange, red; null for statements),
//   publication_datetime, expiration_datetime, status_en (issued,
//   continued…), province. There is no link field: the link is ECCC's
//   provincial warnings page for the alert's province.
// - ECCC colour-codes warnings, watches and advisories since Nov 26, 2025;
//   statements have no colour.

import type { IssuedAlert } from '../../core/alerts/alerts';

export const source = {
  id: 'eccc-alerts',
  name: 'ECCC weather alerts',
  /** Who issues the alerts, as the panel names them. */
  publisher: 'Environment and Climate Change Canada',
  provides: 'Public weather alerts at the pin, shown as issued',
  baseUrl: 'https://api.weather.gc.ca/collections/weather-alerts/items',
  licence: 'Open Government Licence – Canada',
  attribution: 'Contains information from Environment and Climate Change Canada (public weather alerts)',
  // The collection's own canonical link (its metadata, Nov 17, 2026).
  link: 'https://eccc-msc.github.io/open-data/msc-data/readme_en',
  offline: false,
} as const;

/**
 * ECCC's own alert colours, read from the legend of its GeoMet map layer
 * Current-Alerts (GetLegendGraphic, Nov 17, 2026). Watches use the lighter
 * swatch of the same level; statements are grey. These are the issuer's data,
 * not the app's palette.
 */
export const OFFICIAL_COLOURS = {
  warning: { red: '#DA3333', orange: '#FF9500', yellow: '#FFFF00' },
  watch: { red: '#EB9898', orange: '#FDC87F', yellow: '#FDFD7F' },
  statement: '#DBDBDB',
} as const;

/** ECCC's legend swatch for an alert, or null when ECCC's legend has none for it. */
export function officialColour(a: Pick<IssuedAlert, 'type' | 'colour'>): string | null {
  const type = a.type.toLowerCase();
  if (type === 'statement') return OFFICIAL_COLOURS.statement;
  const level = a.colour?.toLowerCase() as 'red' | 'orange' | 'yellow' | undefined;
  // The legend groups advisories with warnings ("Warnings / Advisory").
  const set = type === 'watch' ? OFFICIAL_COLOURS.watch : type === 'warning' || type === 'advisory' ? OFFICIAL_COLOURS.warning : null;
  return set && level && level in set ? set[level] : null;
}

/** The items request for alerts whose areas contain the point. */
export function alertsUrl(lat: number, lon: number): string {
  const d = 0.0001;
  const params = new URLSearchParams({
    f: 'json', skipGeometry: 'true', limit: '100',
    bbox: [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(5)).join(','),
  });
  return `${source.baseUrl}?${params}`;
}

/** ECCC's alerts page for a province or territory ("BC" → …?prov=bc). */
export function warningsPage(province: string): string {
  const p = province.trim().toLowerCase();
  return /^[a-z]{2}$/.test(p) ? `https://weather.gc.ca/warnings/index_e.html?prov=${p}` : 'https://weather.gc.ca/warnings/index_e.html';
}

type Props = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const date = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The alerts in an items answer, as issued. Features missing their times or title are skipped. */
export function parseAlerts(json: unknown): IssuedAlert[] {
  const features = (json as { features?: { id?: unknown; properties?: Props }[] })?.features;
  if (!Array.isArray(features)) return [];
  const out: IssuedAlert[] = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    const issued = date(p.publication_datetime);
    const expires = date(p.expiration_datetime);
    const title = str(p.alert_name_en);
    if (!issued || !expires || !title) continue;
    const id = str(f.id) || `${title}-${str(p.feature_id)}`;
    out.push({
      id,
      // "<alert>_<area>": the part before the area is the alert.
      alertId: id.includes('_') ? id.slice(0, id.lastIndexOf('_')) : id,
      type: str(p.alert_type),
      title,
      area: str(p.feature_name_en),
      colour: typeof p.risk_colour_en === 'string' && p.risk_colour_en ? p.risk_colour_en : null,
      status: str(p.status_en),
      issued,
      expires,
      province: str(p.province),
      link: warningsPage(str(p.province)),
    });
  }
  return out;
}

/** Alerts covering the point. Throws when ECCC cannot be reached or answers with an error. */
export async function fetchAlerts(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<IssuedAlert[]> {
  const res = await fetchFn(alertsUrl(lat, lon));
  if (!res.ok) throw new Error(`ECCC alerts: HTTP ${res.status}`);
  return parseAlerts(await res.json());
}
