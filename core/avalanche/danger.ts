// Avalanche danger, as issued. The standard shapes for an avalanche bulletin
// and a field report, the danger scale's official colours, and which day of a
// bulletin applies at a time. Pure functions, no UI, no provider. Ratings,
// words and colours are never re-scored, recoloured or summarised here: this
// file only looks values up and picks which issued day applies.

/** The words Avalanche Canada's data uses for a rating (its own values). */
export type DangerValue =
  | 'low' | 'moderate' | 'considerable' | 'high' | 'extreme'
  | 'norating' | 'earlyseason' | 'spring' | 'offseason' | 'noforecast';

/** The three elevation bands, as Avalanche Canada names them in its data. */
export type Band = 'alp' | 'tln' | 'btl';
export const BANDS: readonly Band[] = ['alp', 'tln', 'btl'];
export const BAND_NAMES: Record<Band, string> = { alp: 'Alpine', tln: 'Treeline', btl: 'Below treeline' };

/** Which band colours the map: the highest of the three (Avalanche Canada's own map), or one band. */
export type BandChoice = 'highest' | Band;

/** The level number on the North American Public Avalanche Danger Scale. */
export const LEVELS: Partial<Record<DangerValue, number>> = { low: 1, moderate: 2, considerable: 3, high: 4, extreme: 5 };

/**
 * The danger scale's colours, as Avalanche Canada's own website draws them
 * (its map and forecast pages; the colour table in the site's JavaScript,
 * read Nov 17, 2026 from https://avalanche.ca/en/map). They are the North
 * American Public Avalanche Danger Scale's colours: green, yellow, orange,
 * red, black. Avalanche Canada draws "No rating" and "Off season" white,
 * "Early season" and "Spring" blue; its forecast metadata gives the same blue
 * (#0072C6) for early season and "white" for no forecast. These are the
 * issuer's data colours, not the app's palette.
 */
export const DANGER_COLOURS: Record<DangerValue, string> = {
  low: '#50B848',
  moderate: '#FFF200',
  considerable: '#F7941E',
  high: '#ED1C24',
  extreme: '#231F20',
  norating: '#FFFFFF',
  earlyseason: '#0072C6',
  spring: '#0072C6',
  offseason: '#FFFFFF',
  noforecast: '#FFFFFF',
};

/** The scale's names, for a value that arrives without its display words. */
const NAMES: Record<DangerValue, string> = {
  low: 'Low', moderate: 'Moderate', considerable: 'Considerable', high: 'High', extreme: 'Extreme',
  norating: 'No Rating', earlyseason: 'Early Season', spring: 'Spring', offseason: 'Off Season', noforecast: 'No Forecast',
};

export function isDangerValue(v: string): v is DangerValue {
  return v in DANGER_COLOURS;
}

/** One rating as issued: the value and the issuer's own words for it. */
export interface Rating { value: DangerValue; display: string }

export function rating(value: string, display?: string | null): Rating {
  const v = value.toLowerCase();
  const known: DangerValue = isDangerValue(v) ? v : 'norating';
  return { value: known, display: display?.trim() || NAMES[known] };
}

/** "Considerable (3)", or the issuer's words alone when it is not a level ("Early Season"). */
export function ratingLabel(r: Rating): string {
  const n = LEVELS[r.value];
  return n === undefined ? r.display : `${r.display} (${n})`;
}

/** Black or white text that reads on the rating's own colour (legibility only; the colour is unchanged). */
export function inkOn(value: DangerValue): '#000000' | '#FFFFFF' {
  const hex = DANGER_COLOURS[value];
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 140 ? '#000000' : '#FFFFFF';
}

/** One issued day: the date in the bulletin's own time zone and the three bands. */
export interface BulletinDay {
  /** Calendar date in the bulletin's time zone, "2026-11-17". */
  date: string;
  /** The issuer's day name, "Tuesday". */
  label: string;
  ratings: Record<Band, Rating>;
}

export interface AvalancheProblem {
  /** "Wind Slab" (the issuer's words). */
  name: string;
  elevations: string[];
  aspects: string[];
  likelihood: string | null;
  size: { min: string; max: string } | null;
  /** The issuer's comment, as HTML. */
  html: string;
}

/** A forecast product, in the app's standard shape. Text fields are the issuer's own (HTML where it sends HTML). */
export interface Bulletin {
  id: string;
  areaId: string;
  title: string;
  /** Who issues it: "Avalanche Canada", "Parks Canada", "Kananaskis". */
  owner: string;
  forecaster: string;
  issued: Date;
  validUntil: Date;
  timeZone: string;
  url: string;
  highlights: string;
  confidence: { display: string; statements: string[] } | null;
  summaries: { title: string; html: string }[];
  problems: AvalancheProblem[];
  travelAdvice: string[];
  notifications: string[];
  days: BulletinDay[];
}

/** A forecast region's outline, joined to its bulletin by area id. */
export interface ForecastRegion {
  id: string;
  bbox: [number, number, number, number];
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

/** A Mountain Information Network field report, as published. */
export interface FieldReport {
  id: string;
  title: string;
  /** The day observed, "2026-11-15". */
  date: string;
  submitted: Date;
  author: string | null;
  lat: number;
  lon: number;
  region: string | null;
  activities: string[];
  /** The observations, as written. */
  text: string;
  sawAvalanche: string | null;
  instability: string[];
  images: { url: string; width: number; height: number }[];
  link: string;
}

/** Calendar date of an instant in a time zone, "2026-11-17". */
export function localDate(t: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/** True when the three days all carry the same non-level rating in every band (an early-season or spring bulletin). */
export function seasonal(b: Bulletin): Rating | null {
  const all = b.days.flatMap((d) => BANDS.map((k) => d.ratings[k]));
  const first = all[0];
  if (!first || LEVELS[first.value] !== undefined) return null;
  return all.every((r) => r.value === first.value) ? first : null;
}

/** What a bulletin says for the time t. */
export type DayAt =
  | { kind: 'day'; day: BulletinDay; index: number }
  /** A seasonal bulletin (early season, spring, no rating) that is still valid. */
  | { kind: 'seasonal'; rating: Rating }
  /** Outside the issued days: the app says "No forecast", never guesses. */
  | { kind: 'none' };

/**
 * The issued day whose date (in the bulletin's time zone) holds t. A seasonal
 * bulletin applies from its issue time to its expiry, as Avalanche Canada's
 * own map shows it. Anything else is "No forecast": there is no fourth day.
 */
export function dayAt(b: Bulletin, t: Date): DayAt {
  const date = localDate(t, b.timeZone);
  const index = b.days.findIndex((d) => d.date === date);
  if (index >= 0) return { kind: 'day', day: b.days[index]!, index };
  const s = seasonal(b);
  if (s && t >= b.issued && t <= b.validUntil) return { kind: 'seasonal', rating: s };
  return { kind: 'none' };
}

/** The highest level among the three bands; with no level at all, the alpine rating as issued. */
export function highest(r: Record<Band, Rating>): { rating: Rating; band: Band } {
  let best: { rating: Rating; band: Band } = { rating: r.alp, band: 'alp' };
  for (const band of BANDS) {
    const n = LEVELS[r[band].value] ?? 0;
    if (n > (LEVELS[best.rating.value] ?? 0)) best = { rating: r[band], band };
  }
  return best;
}

/** The rating that colours the map for a choice of band. */
export function ratingFor(r: Record<Band, Rating>, choice: BandChoice): { rating: Rating; band: Band } {
  return choice === 'highest' ? highest(r) : { rating: r[choice], band: choice };
}

/** What the map and readout show for a bulletin at t: a rating, or no forecast. */
export function shownAt(b: Bulletin, t: Date, choice: BandChoice): { rating: Rating; band: Band | null } | null {
  const d = dayAt(b, t);
  if (d.kind === 'none') return null;
  if (d.kind === 'seasonal') return { rating: d.rating, band: null };
  return ratingFor(d.day.ratings, choice);
}

/** The value the map's colour lookup reads for a region ("none" past the issued days). */
export function mapValue(b: Bulletin | undefined, t: Date, choice: BandChoice): DangerValue | 'none' {
  if (!b) return 'none';
  return shownAt(b, t, choice)?.rating.value ?? 'none';
}

// ---- Point in region ---------------------------------------------------------

function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if ((yi! > y) !== (yj! > y) && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: number[][][], x: number, y: number): boolean {
  if (!rings[0] || !inRing(rings[0], x, y)) return false;
  return !rings.slice(1).some((hole) => inRing(hole, x, y));
}

export function regionContains(r: ForecastRegion, lon: number, lat: number): boolean {
  const [w, s, e, n] = r.bbox;
  if (lon < w || lon > e || lat < s || lat > n) return false;
  return r.geometry.type === 'Polygon'
    ? inPolygon(r.geometry.coordinates, lon, lat)
    : r.geometry.coordinates.some((p) => inPolygon(p, lon, lat));
}

/** The region holding a point, if any. */
export function regionAt(regions: ForecastRegion[], lon: number, lat: number): ForecastRegion | null {
  return regions.find((r) => regionContains(r, lon, lat)) ?? null;
}

// ---- What the app holds now ---------------------------------------------------

/** The bulletins and outlines the app holds, with when they were fetched. Set by the app, read by the layer. */
export interface AvalancheData {
  regions: ForecastRegion[];
  bulletins: Map<string, Bulletin>;
  fetchedAt: Date;
  /** Where they come from, for the footer ("Avalanche Canada"). */
  source: string;
}

let held: AvalancheData | null = null;
let failed = false;
export function setAvalancheData(d: AvalancheData | null, didFail = false): void { held = d; failed = didFail; }
export function avalancheData(): AvalancheData | null { return held; }
export function avalancheFailed(): boolean { return failed; }

/** The pin's place, which the layer's slots do not carry (they get the pin's weather series). */
let pinAt: { lon: number; lat: number } | null = null;
export function setAvalanchePin(lon: number, lat: number): void { pinAt = { lon, lat }; }
export function avalanchePin(): { lon: number; lat: number } | null { return pinAt; }

/** The region and bulletin at a point, from what the app holds. */
export function bulletinAt(lon: number, lat: number, d: AvalancheData | null = held): { region: ForecastRegion; bulletin: Bulletin | null } | null {
  if (!d) return null;
  const region = regionAt(d.regions, lon, lat);
  return region ? { region, bulletin: d.bulletins.get(region.id) ?? null } : null;
}
