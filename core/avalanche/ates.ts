// Avalanche terrain ratings (ATES), as published. The standard shapes for an
// ATES area (zones, rated lines, access routes, points of interest, the area
// outline), the scale's class names and the colours the publisher draws them
// in. Pure functions, no UI, no provider. Nothing here re-rates terrain: the
// app only looks up the class the publisher gave each piece.
//
// The scale: the Avalanche Terrain Exposure Scale, version 2 (Statham and
// Campbell, "The Avalanche Terrain Exposure Scale v.2", Natural Hazards and
// Earth System Sciences 25, 1113–1137, 2025, https://doi.org/10.5194/nhess-25-1113-2025;
// first version Statham, McMahon and Tomm, ISSW 2006). Five classes: 0 Non-
// avalanche, 1 Simple, 2 Challenging, 3 Complex, 4 Extreme.

export type AtesRating = 'non-avalanche' | 'simple' | 'challenging' | 'complex' | 'extreme';

/** Class numbers and names on the scale (ATES v2). */
export const ATES_CLASSES: Record<AtesRating, { number: number; name: string }> = {
  'non-avalanche': { number: 0, name: 'Non-avalanche' },
  simple: { number: 1, name: 'Simple' },
  challenging: { number: 2, name: 'Challenging' },
  complex: { number: 3, name: 'Complex' },
  extreme: { number: 4, name: 'Extreme' },
};

/** Low to high, the order a legend lists them. */
export const ATES_ORDER: readonly AtesRating[] = ['non-avalanche', 'simple', 'challenging', 'complex', 'extreme'];

/**
 * The publisher's colours. Simple, Challenging and Complex are the PolyStyle
 * colours in Avalanche Canada's own ATES files (KML aabbggrr 8800ff55,
 * 88ff0000 and 88000000 in zone_green_style, zone_blue_style and
 * zone_black_style; read Nov 17, 2026 from
 * avcan-services-api.prod.avalanche.ca/ates/en/areas/{id}.kmz), the same green,
 * blue and black as ski-run signs, which the scale's colour key follows. The
 * files draw them about half see-through (alpha 0x88). No file seen on Nov 17
 * carried a Non-avalanche or Extreme zone, and no colour for those two was
 * found published by Avalanche Canada: white and red below are placeholders
 * (UNCONFIRMED, listed in docs/06), used only if such a zone ever appears, and
 * the legend then names the class in words too. These are data colours, not
 * the app's palette.
 */
export const ATES_COLOURS: Record<AtesRating, string> = {
  'non-avalanche': '#FFFFFF',
  simple: '#55FF00',
  challenging: '#0000FF',
  complex: '#000000',
  extreme: '#E3001B',
};

/** How see-through the publisher draws zones (0x88 / 0xff). */
export const ATES_ZONE_OPACITY = 0x88 / 0xff;

export const atesLabel = (r: AtesRating) => `${ATES_CLASSES[r].name} (${ATES_CLASSES[r].number})`;

export type Lon = number;
export type Lat = number;
export type Position = [Lon, Lat];
/** Rings of one polygon: the outer ring first, then holes. */
export type PolygonRings = Position[][];

/** What a point of interest is, by the publisher's icon. */
export type AtesPointKind = 'parking' | 'cabin' | 'destination' | 'decision-point' | 'first-aid' | 'other';

export const POINT_NAMES: Record<AtesPointKind, string> = {
  parking: 'Parking',
  cabin: 'Cabin or shelter',
  destination: 'Destination',
  'decision-point': 'Decision point',
  'first-aid': 'First aid',
  other: 'Point of interest',
};

export interface AtesZone { rating: AtesRating; name: string; description: string; polygons: PolygonRings[] }
export interface AtesLine { rating: AtesRating; name: string; description: string; lines: Position[][] }
export interface AtesRoute { name: string; description: string; lines: Position[][] }
export interface AtesPoint {
  kind: AtesPointKind;
  name: string;
  description: string;
  /** Headed lists, when the publisher wrote it as a table (decision points: "Concern", "Managing risk"). */
  parts: { heading: string; items: string[] }[];
  at: Position;
  /** The icon the file uses for it (a path inside the file), when it has one. */
  icon: string | null;
}

/** One ATES area, as its file publishes it. */
export interface AtesArea {
  id: number;
  name: string;
  /** The area's outline (several polygons when it is in parts). */
  boundary: PolygonRings[];
  zones: AtesZone[];
  /** Routes rated as lines (a narrow line instead of a zone). */
  ratedLines: AtesLine[];
  /** Avalanche paths drawn as lines, when the file has them. */
  paths: AtesRoute[];
  routes: AtesRoute[];
  points: AtesPoint[];
}

/** One area in the index the app ships (tools/ates-index.mjs). */
export interface AtesIndexArea {
  id: number;
  name: string;
  bbox: [number, number, number, number];
  /** A simplified outline, for drawing at low zoom and finding the area. */
  outline: PolygonRings[];
  /** Zones by class, as counted when the index was made. */
  zones: Partial<Record<AtesRating, number>>;
  points: number;
  bytes: number;
}

export interface AtesIndex { made: string; source: string; areas: AtesIndexArea[] }

/** Bounding box of some rings. */
export function bboxOfRings(polys: PolygonRings[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}

const overlaps = (a: readonly number[], b: readonly number[]) => a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;

/** Areas whose box meets the view, nearest the view's centre first. */
/**
 * `centre`: the point the map is looking at. When the map is tilted the view's
 * box reaches toward the horizon and its middle is far from that point, so
 * the nearest areas are measured from the map's centre, not the box's.
 */
export function areasInView(index: AtesIndexArea[], view: [number, number, number, number], centre?: [number, number]): AtesIndexArea[] {
  const [cx, cy] = centre ?? [(view[0] + view[2]) / 2, (view[1] + view[3]) / 2];
  const dist = (a: AtesIndexArea) => Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - cx, (a.bbox[1] + a.bbox[3]) / 2 - cy);
  return index.filter((a) => overlaps(a.bbox, view)).sort((a, b) => dist(a) - dist(b));
}

/** Point in a ring (even-odd). */
function inRing(ring: Position[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the point is inside one of the polygons (holes respected). */
export function inPolygons(polys: PolygonRings[], x: number, y: number): boolean {
  return polys.some((p) => p[0] !== undefined && inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)));
}

/** Perpendicular distance from p to the segment a–b (plain degrees; fine for simplifying). */
function segDist(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker: fewer points, same shape within `tolerance` degrees. Closed rings keep at least four points. */
export function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1; keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, max = 0;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(ring[i]!, ring[a]!, ring[b]!);
      if (d > max) { max = d; far = i; }
    }
    if (far >= 0 && max > tolerance) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring.length >= 4 ? [ring[0]!, ring[Math.floor(ring.length / 3)]!, ring[Math.floor((2 * ring.length) / 3)]!, ring[ring.length - 1]!] : ring;
}

/**
 * The other colours the publisher's files draw with (same files, same date):
 * access routes yellow (access_road_styles ff00ffff), avalanche paths red
 * (avalanche_path_styles ff0000ff), the area outline white (area_styles
 * ffffffff). Data colours; the app adds only a neutral casing so they read on
 * either theme.
 */
export const ATES_ROUTE_COLOUR = '#FFFF00';
export const ATES_PATH_COLOUR = '#FF0000';
export const ATES_BOUNDARY_COLOUR = '#FFFFFF';

export type AtesFeatureKind = 'boundary' | 'zone' | 'rated-line' | 'route' | 'path' | 'point';

export interface AtesFeatureProps {
  kind: AtesFeatureKind;
  areaId: number;
  areaName: string;
  name: string;
  description: string;
  /** Zones and rated lines: the class. */
  rating?: AtesRating;
  /** Points: what it is, and the map image to draw it with. */
  pointKind?: AtesPointKind;
  icon?: string;
  /** Points: the headed lists as JSON (map feature properties hold only plain values). */
  parts?: string;
}

type Geo =
  | { type: 'MultiPolygon'; coordinates: PolygonRings[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Point'; coordinates: Position };
export interface AtesFeature { type: 'Feature'; properties: AtesFeatureProps; geometry: Geo }

/** The map image name for a point: one per kind (the file's own icon is drawn under that name). */
export const pointImage = (k: AtesPointKind) => `ates-${k}`;

/** An area as map features, in drawing order (outline, zones, lines, routes, points). */
export function atesFeatures(a: AtesArea): AtesFeature[] {
  const base = { areaId: a.id, areaName: a.name };
  const out: AtesFeature[] = [];
  if (a.boundary.length) out.push({ type: 'Feature', properties: { ...base, kind: 'boundary', name: a.name, description: '' }, geometry: { type: 'MultiPolygon', coordinates: a.boundary } });
  for (const z of a.zones) out.push({ type: 'Feature', properties: { ...base, kind: 'zone', name: z.name, description: z.description, rating: z.rating }, geometry: { type: 'MultiPolygon', coordinates: z.polygons } });
  for (const l of a.ratedLines) out.push({ type: 'Feature', properties: { ...base, kind: 'rated-line', name: l.name, description: l.description, rating: l.rating }, geometry: { type: 'MultiLineString', coordinates: l.lines } });
  for (const r of a.paths) out.push({ type: 'Feature', properties: { ...base, kind: 'path', name: r.name, description: r.description }, geometry: { type: 'MultiLineString', coordinates: r.lines } });
  for (const r of a.routes) out.push({ type: 'Feature', properties: { ...base, kind: 'route', name: r.name, description: r.description }, geometry: { type: 'MultiLineString', coordinates: r.lines } });
  for (const p of a.points) out.push({ type: 'Feature', properties: { ...base, kind: 'point', name: p.name, description: p.description, pointKind: p.kind, icon: pointImage(p.kind), parts: JSON.stringify(p.parts) }, geometry: { type: 'Point', coordinates: p.at } });
  return out;
}

/** The classes present in some areas, low to high (for the legend). */
export function ratingsIn(areas: Iterable<AtesArea>): AtesRating[] {
  const seen = new Set<AtesRating>();
  for (const a of areas) { for (const z of a.zones) seen.add(z.rating); for (const l of a.ratedLines) seen.add(l.rating); }
  return ATES_ORDER.filter((r) => seen.has(r));
}

/** The area (from the index) whose outline holds the point, or null. */
export function indexAreaAt(index: AtesIndexArea[], lon: number, lat: number): AtesIndexArea | null {
  for (const a of index) {
    const [w, s, e, n] = a.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n && inPolygons(a.outline, lon, lat)) return a;
  }
  return null;
}
