// Adapter: BC Geographical Names Web Service (BCGNWS), the Province's
// official names for peaks, ranges, lakes, creeks, parks and communities.
//
// Checked Nov 17, 2026 (OpenAPI spec bcgov/api-specs bcgnws.json, v3.x.x, and
// live answers from apps.gov.bc.ca):
// - Search: GET https://apps.gov.bc.ca/pub/bcgnws/names/search with
//   outputFormat=json, name (`*` is the wildcard: "Seym*"), outputSRS=4326,
//   outputStyle=summary|detail, itemsPerPage (1–200), startIndex, sortBy
//   (relevance, name, featureType, decisionDate). Default order is relevance.
// - Matching is by whole words of the name: "Seymour" finds "Mount Seymour"
//   and "Seymour Lake"; several words return any of them (relevance first),
//   so the results are filtered again in core/search.
// - Answer: GeoJSON FeatureCollection; per feature properties.name, status
//   (adopted, recorded, rescinded…), isOfficial (0/1), featureType ("Mount",
//   "Lake", "Creek (1)"…), featureCategory (number) and its description,
//   feature.id; with outputStyle=detail also feature.relativeLocation
//   ("Between Seymour River and Indian Arm, S of Mount Elsay…") and
//   feature.landDistrict. geometry.coordinates is [lon, lat]. No elevation.
// - Browsers may call it: Access-Control-Allow-Origin: * (also on OPTIONS).
// - 40 detailed names are about 80 kB and come back in about 0.6 s.
// - Licence: the OpenAPI spec states "Crown Copyright" with the B.C.
//   copyright page; BC open data (the catalogue could not be opened from this
//   session) publishes the names under the Open Government Licence – British
//   Columbia.

import { expandQuery, type Place, type PlaceKind } from '../../core/search/search';

export const source = {
  id: 'bc-geonames',
  name: 'BC Geographical Names',
  provides: 'Place search: official names of peaks, lakes, parks and communities in BC',
  baseUrl: 'https://apps.gov.bc.ca/pub/bcgnws/names/search',
  licence: 'Crown Copyright, Province of British Columbia (Open Government Licence – British Columbia, as BC open data lists it)',
  attribution: 'Contains information licensed under the Open Government Licence – British Columbia (BC Geographical Names)',
  link: 'https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/historic-places/geographical-names',
  terms: 'Official names as the BC Geographical Names Office records them; asked only while searching',
  offline: false,
} as const;

/** Names asked for per search. */
export const PAGE_SIZE = 40;

/** The search request: the words as typed, the last one open-ended. */
export function searchUrl(query: string, pageSize = PAGE_SIZE): string {
  const name = expandQuery(query);
  const u = new URL(source.baseUrl);
  u.searchParams.set('outputFormat', 'json');
  u.searchParams.set('name', name.endsWith('*') ? name : `${name}*`);
  u.searchParams.set('outputSRS', '4326');
  u.searchParams.set('outputStyle', 'detail');
  u.searchParams.set('itemsPerPage', String(pageSize));
  return u.toString();
}

/**
 * BCGNWS feature categories (its /featureCategories list) onto the app's
 * kinds. Mountain features: Elevated (15: mounts, peaks, ranges, ridges,
 * hills), Depressed (19: passes, valleys) and 21 (glaciers, névés).
 */
const CATEGORY_KIND: Record<number, PlaceKind> = {
  1: 'locality', 2: 'locality', 3: 'locality',
  4: 'park', 5: 'park',
  7: 'water', 8: 'water', 9: 'water', 10: 'water', 11: 'water', 12: 'water', 13: 'water',
  15: 'mountain', 19: 'mountain', 21: 'mountain',
};

/** The feature type as a row shows it: "Creek (1)" → "Creek", "Mount" → "Mountain". */
export function typeLabel(featureType: string): string {
  const t = featureType.replace(/\s*\(\d+\)\s*$/, '').trim();
  return t === 'Mount' ? 'Mountain' : t;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Places from a search answer; anything malformed is left out. */
export function parsePlaces(json: unknown): Place[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: Place[] = [];
  for (const f of features as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }[]) {
    const p = f?.properties;
    const c = f?.geometry?.coordinates;
    const name = str(p?.name);
    if (!p || !name || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const feature = (p.feature ?? {}) as Record<string, unknown>;
    const category = Number(p.featureCategory);
    const status = str(p.status) ?? '';
    out.push({
      id: str(p.uri) ?? `${name}@${c[1]},${c[0]}`,
      featureId: str(feature.id) ?? str(p.uri) ?? name,
      name,
      kind: CATEGORY_KIND[category] ?? 'other',
      type: typeLabel(str(p.featureType) ?? ''),
      area: str(feature.relativeLocation) ?? str(feature.landDistrict),
      lat: c[1],
      lon: c[0],
      elevation: null,
      official: p.isOfficial === 1 || p.isOfficial === '1',
      rescinded: status === 'rescinded',
    });
  }
  return out;
}

/** Search BC's names. Throws on an error answer; abortable. */
export async function fetchPlaces(query: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const res = await fetchImpl(searchUrl(query), { signal: signal ?? null });
  if (!res.ok) throw new Error(`BC Geographical Names answered ${res.status}`);
  return parsePlaces(await res.json());
}
