// Place search, without UI or provider: the standard place shape every
// geocoder adapter fills, query clean-up, and the ranking that puts the
// places a mountain trip is likely to mean first.

/** The app's own place kinds. Adapters map their source's feature types onto these. */
export type PlaceKind = 'mountain' | 'locality' | 'park' | 'water' | 'other';

export interface Place {
  /** Stable id within the source. */
  id: string;
  /** The feature's id within the source: two names (current and former) can share one. */
  featureId: string;
  name: string;
  kind: PlaceKind;
  /** The source's own feature type, for the row ("Mountain", "Lake", "Community"). */
  type: string;
  /** Where it is, in the source's words ("Between Seymour River and Indian Arm…"), when given. */
  area: string | null;
  lat: number;
  lon: number;
  /** Metres, when the source gives one. */
  elevation: number | null;
  /** An official, current name (not a former or unofficial one). */
  official: boolean;
  /** A name the source has withdrawn (a former name). */
  rescinded: boolean;
}

/** Fewer letters than this is not a search yet. */
export const MIN_QUERY_LETTERS = 2;
export const MAX_QUERY_LENGTH = 60;
/** Rows shown at most. */
export const MAX_RESULTS = 20;

/** British Columbia's extent, with a little margin, as [west, south, east, north]. */
export const BC_BOX = [-139.1, 48.2, -114.0, 60.05] as const;

export function inBC(lat: number, lon: number): boolean {
  const [w, s, e, n] = BC_BOX;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** The query as typed, tidied: trimmed, single spaces, no wildcard or markup characters, bounded length. */
export function normaliseQuery(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[*?%"<>{}[\]\\^|~`=+;:!@#$&()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

/** Whether the tidied query has enough letters to search. */
export function isSearchable(query: string): boolean {
  return (query.match(/\p{L}|\p{N}/gu) ?? []).length >= MIN_QUERY_LETTERS;
}

const ABBREVIATIONS: Record<string, string> = { mt: 'mount', mtn: 'mountain', pk: 'peak', lk: 'lake', st: 'saint', ste: 'sainte' };

/** Lower-case words with accents folded and common abbreviations spelled out. */
export function words(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w);
}

/**
 * The words to send to a geocoder: abbreviations spelled out ("Mt Seymour" →
 * "Mount Seymour"), the case kept as typed.
 */
export function expandQuery(query: string): string {
  return normaliseQuery(query)
    .split(' ')
    .map((w) => {
      const long = ABBREVIATIONS[w.toLowerCase().replace(/\.$/, '')];
      return long ? long[0]!.toUpperCase() + long.slice(1) : w;
    })
    .join(' ');
}

/** Leading words that name the kind of place, not the place ("Mount Seymour", "Lake Lovely Water"). */
const GENERIC_FIRST = new Set(['mount', 'mountain', 'lake', 'peak', 'little', 'upper', 'lower']);

/**
 * How well a name matches the query: 0 the whole name, 1 the name starts
 * with it (or after a leading "Mount" or "Lake"), 2 every word of the query starts a word of the name; null for no
 * match.
 */
export function matchTier(query: string, name: string): 0 | 1 | 2 | null {
  const q = words(query);
  const n = words(name);
  if (!q.length || !n.length) return null;
  if (q.join(' ') === n.join(' ')) return 0;
  // The query's last word may still be being typed: it only has to start a word.
  const prefixOfName = q.every((w, i) => (i === q.length - 1 ? n[i]?.startsWith(w) : n[i] === w));
  if (prefixOfName) return 1;
  // "Seymour" means Mount Seymour as much as Seymour Lake: a leading generic
  // word ("Mount", "Lake") counts as part of the name's start.
  if (GENERIC_FIRST.has(n[0]!) && n.length > 1 && q[0] !== n[0]) {
    const rest = n.slice(1);
    if (q.every((w, i) => (i === q.length - 1 ? rest[i]?.startsWith(w) : rest[i] === w))) return 1;
  }
  const used = new Set<number>();
  for (const w of q) {
    const i = n.findIndex((x, j) => !used.has(j) && x.startsWith(w));
    if (i < 0) return null;
    used.add(i);
  }
  return 2;
}

/** Mountain features first, then towns, then parks, water and the rest. */
const KIND_WEIGHT: Record<PlaceKind, number> = { mountain: 0, locality: 0.5, park: 1.5, water: 2, other: 3 };

/** Places closer than this (km) with the same name and kind are one place. */
const SAME_PLACE_KM = 2;

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The rows to show for a query: matching places inside BC, current names
 * only, one row per place, best first. Order: how well the name matches plus
 * what kind of place it is (so "Seymour" brings Mount Seymour up among the
 * Seymour lakes and creeks), then official names, then the nearest to
 * `near` (the map's centre: of three Mount Seymours, the one in view), then
 * shorter names.
 */
export function rankPlaces(query: string, places: readonly Place[], limit = MAX_RESULTS, near?: { lat: number; lon: number }): Place[] {
  const scored: { p: Place; score: number; d: number }[] = [];
  for (const p of places) {
    if (p.rescinded || !inBC(p.lat, p.lon) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const tier = matchTier(query, p.name);
    if (tier === null) continue;
    scored.push({ p, score: tier + KIND_WEIGHT[p.kind], d: near ? km(near, p) : 0 });
  }
  scored.sort((a, b) =>
    a.score - b.score
    || Number(b.p.official) - Number(a.p.official)
    || a.d - b.d
    || a.p.name.length - b.p.name.length
    || a.p.name.localeCompare(b.p.name));
  const out: Place[] = [];
  for (const { p } of scored) {
    const dup = out.some((q) => q.featureId === p.featureId
      || (q.kind === p.kind && words(q.name).join(' ') === words(p.name).join(' ') && km(q, p) < SAME_PLACE_KM));
    if (dup) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** The row's second line: "Mountain · Between Seymour River and Indian Arm…". */
export function placeLine(p: Place): string {
  return [p.type, p.area].filter(Boolean).join(' · ');
}
