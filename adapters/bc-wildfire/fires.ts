// Adapter: BC Wildfire Service's current-season fire locations and fire
// perimeters, from the BC government's WFS (openmaps.gov.bc.ca). Safety
// information: shown exactly as issued, with its source, time and link.
//
// Checked Nov 18, 2026 from the build machine:
// - Points: pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_PNTS_SP, GeoJSON
//   with outputFormat=application/json. The season's every fire stays listed
//   (1,480 on Nov 18; 1,462 "Out", 17 "Under Control", 1 "Being Held"), each
//   with FIRE_NUMBER, IGNITION_DATE and FIRE_OUT_DATE as dates ("2026-07-24Z"),
//   FIRE_STATUS, CURRENT_SIZE (ha), FIRE_CAUSE, FIRE_CENTRE (a number),
//   GEOGRAPHIC_DESCRIPTION, INCIDENT_NAME, FIRE_OF_NOTE_IND (Y/N), FIRE_URL,
//   RESPONSE_TYPE_DESC, FIRE_TYPE, LATITUDE, LONGITUDE. A few dates are clearly
//   typing slips (1429, 2044); they are shown as issued.
// - GeoServer's CQL_FILTER works, so only fires still burning or declared out
//   in the last days are asked for (28 on Nov 18; about 1 MB for the whole
//   season province-wide, which is not needed: the cursor reaches 2 days back).
// - Perimeters: ...PROT_CURRENT_FIRE_POLYS_SP, one polygon per fire, with
//   FIRE_NUMBER, FIRE_SIZE_HECTARES, TRACK_DATE (when it was mapped),
//   FIRE_STATUS, SOURCE, FIRE_URL.
// - CORS: the server names the asking site in Access-Control-Allow-Origin for
//   a browser's request (checked by the coordinator in a real browser).
// - Licence: the dataset pages (catalogue.data.gov.bc.ca, open.canada.ca) are
//   blocked from the build machine. Open Canada's listing says "reference
//   purposes" only; a third-party copy of the related historical dataset
//   lists the Open Government Licence – British Columbia. Not confirmed.
import { FIRE_CENTRES, issuedDate, type Fire } from '../../core/air/fires';

export const source = {
  id: 'bc-wildfire',
  name: 'BC Wildfire Service fire locations and perimeters',
  provides: 'Wildfires on the Air quality map: place, status, size, cause and dates, as issued',
  baseUrl: 'https://openmaps.gov.bc.ca/geo/pub/wfs',
  licence: 'Open Government Licence – British Columbia (to be confirmed on the dataset page)',
  attribution: 'Contains information licensed under the Open Government Licence – British Columbia (BC Wildfire Service)',
  link: 'https://wildfiresituation.nrs.gov.bc.ca/',
  terms: 'BC Wildfire Service: the data may not reflect the current fire situation and is for reference only.',
  offline: false,
} as const;

const POINTS = 'pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_PNTS_SP';
const POLYS = 'pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_POLYS_SP';
const FIELDS = [
  'FIRE_NUMBER', 'FIRE_YEAR', 'INCIDENT_NAME', 'GEOGRAPHIC_DESCRIPTION', 'IGNITION_DATE', 'FIRE_OUT_DATE', 'FIRE_STATUS', 'CURRENT_SIZE',
  'FIRE_CAUSE', 'FIRE_CENTRE', 'RESPONSE_TYPE_DESC', 'FIRE_OF_NOTE_IND', 'FIRE_URL', 'LATITUDE', 'LONGITUDE', 'FIRE_TYPE',
];

const wfs = (typeName: string, extra: Record<string, string>) => {
  const p = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeName, outputFormat: 'application/json', srsName: 'EPSG:4326', ...extra });
  return `${source.baseUrl}?${p}`;
};

/** Fires not out, and fires declared out on or after `since` (a YYYY-MM-DD date). */
export function pointsUrl(since: string): string {
  return wfs(POINTS, { propertyName: FIELDS.join(','), CQL_FILTER: `FIRE_STATUS<>'Out' OR FIRE_OUT_DATE>='${since}'` });
}

/** The perimeters of these fires (by number), when they have one. */
export function perimetersUrl(fireNumbers: string[]): string {
  const list = fireNumbers.map((n) => `'${n.replace(/[^A-Za-z0-9]/g, '')}'`).join(',');
  return wfs(POLYS, { CQL_FILTER: `FIRE_NUMBER IN (${list})` });
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function parsePoints(json: unknown): Fire[] {
  const list = (json as { features?: { properties?: Record<string, unknown> }[] })?.features ?? [];
  return list.flatMap((f) => {
    const p = f.properties ?? {};
    const lat = num(p.LATITUDE), lon = num(p.LONGITUDE);
    const id = str(p.FIRE_NUMBER);
    if (lat === null || lon === null || !id) return [];
    const centre = num(p.FIRE_CENTRE);
    return [{
      id, year: num(p.FIRE_YEAR), name: str(p.INCIDENT_NAME), place: str(p.GEOGRAPHIC_DESCRIPTION),
      ignition: issuedDate(p.IGNITION_DATE), out: issuedDate(p.FIRE_OUT_DATE), status: str(p.FIRE_STATUS),
      sizeHa: num(p.CURRENT_SIZE), cause: str(p.FIRE_CAUSE), centre, response: str(p.RESPONSE_TYPE_DESC),
      ofNote: str(p.FIRE_OF_NOTE_IND) === 'Y', type: str(p.FIRE_TYPE), url: str(p.FIRE_URL), lat, lon,
    }];
  });
}

/** The fire centre's name for its code, with the code when it is unknown. */
export const centreName = (code: number | null): string => (code === null ? '' : FIRE_CENTRES[code] ?? `Fire centre ${code}`);

export interface Perimeter {
  type: 'Feature';
  properties: { fire: string; ha: number | null; mapped: string | null; status: string; how: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

export function parsePerimeters(json: unknown): Perimeter[] {
  const list = (json as { features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> }[] })?.features ?? [];
  return list.flatMap((f) => {
    const g = f.geometry;
    const p = f.properties ?? {};
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return [];
    return [{
      type: 'Feature' as const,
      properties: { fire: str(p.FIRE_NUMBER), ha: num(p.FIRE_SIZE_HECTARES), mapped: issuedDate(p.TRACK_DATE), status: str(p.FIRE_STATUS), how: str(p.SOURCE) },
      geometry: { type: g.type, coordinates: g.coordinates },
    }];
  });
}
