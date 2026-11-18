// Wildfires as BC Wildfire Service issues them, and which ones were burning
// at a time. Pure: no map, no network. Nothing here rates or recolours a
// fire; the app only chooses which issued fires apply to the cursor's time.

export interface Fire {
  /** The fire number, e.g. "K61186" (letter = fire centre). */
  id: string;
  year: number | null;
  /** The incident name; BC Wildfire uses the fire number when there is none. */
  name: string;
  /** "Pasayten River" — the place words as issued, trimmed. */
  place: string;
  /** Calendar dates as issued (YYYY-MM-DD), or null. */
  ignition: string | null;
  out: string | null;
  /** "Out", "Out of Control", "Being Held", "Under Control", as issued. */
  status: string;
  sizeHa: number | null;
  cause: string;
  centre: number | null;
  response: string;
  ofNote: boolean;
  type: string;
  url: string;
  lat: number;
  lon: number;
}

/**
 * Fire centre codes. Matched Nov 18, 2026 against the fire numbers' first
 * letter across all 1,480 fires of the season (C Cariboo 7, G Prince George
 * 4, K Kamloops 5, N Southeast 6, R Northwest 3, V Coastal 2).
 */
export const FIRE_CENTRES: Readonly<Record<number, string>> = {
  2: 'Coastal', 3: 'Northwest', 4: 'Prince George', 5: 'Kamloops', 6: 'Southeast', 7: 'Cariboo',
};

/** "2026-07-24Z" or "2026-07-24" → "2026-07-24"; anything else → null. */
export function issuedDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1]! : null;
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The BC calendar date of a time, YYYY-MM-DD. */
export function bcDate(t: Date): string {
  return dayFormat.format(t);
}

const H = 3_600_000;

/**
 * Was this fire burning at time t, by what BC Wildfire Service issued? Its
 * dates decide: discovered on or before that BC day, and not declared out by
 * then (the out day itself counts as out). The dates are calendar days, so a
 * fire counts for the whole day it was discovered. A fire with no out date
 * is burning from the present hour on unless its status says "Out"; for the
 * past it needs a discovery date.
 */
export function burningAt(f: Fire, t: Date, now: Date): boolean {
  const d = bcDate(t);
  if (f.ignition && f.ignition > d) return false;
  if (f.out) return f.out > d;
  if (t.getTime() >= now.getTime() - H) return f.status !== 'Out';
  return f.ignition !== null;
}

export function firesAt(list: readonly Fire[], t: Date, now: Date): Fire[] {
  return list.filter((f) => burningAt(f, t, now));
}

/** Distance in km between two places (haversine). */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Eight compass points from a to b ("SE"). */
export function directionTo(a: { lat: number; lon: number }, b: { lat: number; lon: number }): string {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  const deg = (Math.atan2(y, x) / r + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]!;
}

/** Fires burning at t within `km` of a place, nearest first, with their distance and direction. */
export function firesNear(list: readonly Fire[], at: { lat: number; lon: number }, t: Date, now: Date, km: number): { fire: Fire; km: number; dir: string }[] {
  return firesAt(list, t, now)
    .map((fire) => ({ fire, km: kmBetween(at, fire), dir: directionTo(at, fire) }))
    .filter((x) => x.km <= km)
    .sort((a, b) => a.km - b.km);
}

/** The name to show: the incident name when it is more than the number, else the place, else the number. */
export function fireTitle(f: Fire): string {
  if (f.name && f.name !== f.id) return f.name;
  return f.place || f.id;
}
