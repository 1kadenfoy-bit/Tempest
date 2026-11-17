// Adapter: Avalanche Canada's avalanche terrain ratings (ATES areas).
//
// Checked Nov 17, 2026:
// - The Trip Planner (avalanche.ca/planning/trip-planner) draws its zones from
//   a private Mapbox style, which an app cannot use. The same areas are served
//   one file per area by Avalanche Canada's services API:
//     GET https://avcan-services-api.prod.avalanche.ca/ates/{en|fr}/areas/{id}.kmz
//   application/vnd.google-earth.kmz, Access-Control-Allow-Origin: *, served
//   through CloudFront (cached; x-cache "Hit from cloudfront"). No key, no
//   stated rate limit. Unknown ids answer 404. 24 Mile (id 350) is 94 kB.
// - A KMZ is a zip: doc.kml plus icons/ (parking.png, shelter.png,
//   destination.png, decision-point-icon.png, dot.png; 250 × 250 PNG).
// - doc.kml: one Document with Styles, then a Folder named after the area
//   holding the outline (styleUrl #area_styles, a MultiGeometry of Polygons),
//   "Points of Interest", "Access Routes" and "Zones" (subfolders such as
//   "Class 1 – Simple", "Class 2 – Challenging"). Every Placemark carries a
//   styleUrl that says what it is:
//     zone_green_style / zone_blue_style / zone_black_style     zones
//     ates_line_green_style / _blue_ / _black_                    rated lines
//     area_styles                                                 the outline
//     access_road_styles                                          access routes
//     avalanche_path_styles                                       avalanche paths
//     decision_point_styles                                       decision points
//     point_of_interest_{parking,cabin,destination,other}_styles  points
//   Zone placemarks are named by class ("Simple") and carry the scale's
//   description of that class as published.
// - Ratings follow the colours' meaning on the Avalanche Terrain Exposure
//   Scale (green Simple, blue Challenging, black Complex; see
//   core/avalanche/ates.ts for the citation). The folder name ("Class 2 –
//   Challenging") and the placemark name are used only when a style is not
//   one of these.
//
// Parsing runs without a browser: a small zip reader (central directory, then
// each entry stored or inflated with DecompressionStream('deflate-raw'), which
// browsers and Node 22 both have) and a small XML reader. This file imports
// types only, so tools/ates-index.mjs can load it in Node directly.

import type { AtesArea, AtesPoint, AtesPointKind, AtesRating, PolygonRings, Position } from '../../core/avalanche/ates';

export const source = {
  id: 'avalanche-canada-ates',
  name: 'Avalanche Canada avalanche terrain ratings (ATES)',
  publisher: 'Avalanche Canada',
  provides: 'Avalanche terrain ratings: zones, rated lines, access routes and points of interest for each ATES area, shown as published',
  baseUrl: 'https://avcan-services-api.prod.avalanche.ca',
  licence: 'Public files (no licence stated); used for a personal, non-commercial app, politely: one area file at a time, only for areas on screen, kept on the phone afterwards',
  attribution: 'Avalanche terrain ratings by Avalanche Canada (ATES areas from the Trip Planner)',
  link: 'https://avalanche.ca/planning/trip-planner',
  terms: 'The website’s Terms of Use (avalanche.ca/terms-of-use) say its material may not be reproduced without written consent; shown unchanged, with a link to the Trip Planner.',
  offline: true,
} as const;

export const areaUrl = (id: number, lang: 'en' | 'fr' = 'en') => `${source.baseUrl}/ates/${lang}/areas/${id}.kmz`;
export const tripPlannerUrl = 'https://avalanche.ca/planning/trip-planner';

// ---- Zip ----------------------------------------------------------------

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files in a zip, by path. Stored and deflated entries only (all a KMZ uses). */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  // End of central directory: the last "PK\5\6" within the final 64 kB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const out = new Map<string, Uint8Array>();
  const names = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error('Broken zip directory');
    const method = u16(bytes, p + 10);
    const size = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = names.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (u32(bytes, local) !== 0x04034b50) throw new Error(`Broken zip entry ${name}`);
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, data.slice());
    else if (method === 8) out.set(name, await inflateRaw(data));
    else throw new Error(`Zip method ${method} not supported (${name})`);
  }
  return out;
}

// ---- XML ----------------------------------------------------------------

export interface XmlNode { name: string; children: XmlNode[]; text: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

/** A small XML reader: elements (namespace prefixes dropped), their text, CDATA. Attributes are not kept (KML here needs only `id`, read separately). */
export function parseXml(text: string): XmlNode & { ids: Map<XmlNode, string> } {
  const root: XmlNode = { name: '#root', children: [], text: '' };
  const ids = new Map<XmlNode, string>();
  const stack: XmlNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[6] !== undefined) { top.text += decode(m[6]); continue; }
    if (m[3] === undefined) continue; // comment, declaration
    const name = m[3].replace(/^.*:/, '');
    if (m[2] === '/') {
      // Close the nearest open element of that name (tolerates stray tags).
      for (let i = stack.length - 1; i > 0; i--) if (stack[i]!.name === name) { stack.length = i; break; }
      continue;
    }
    const node: XmlNode = { name, children: [], text: '' };
    const id = /\bid\s*=\s*"([^"]*)"|\bid\s*=\s*'([^']*)'/.exec(m[4] ?? '');
    if (id) ids.set(node, decode(id[1] ?? id[2] ?? ''));
    top.children.push(node);
    if (m[5] !== '/') stack.push(node);
  }
  return Object.assign(root, { ids });
}

const child = (n: XmlNode, name: string) => n.children.find((c) => c.name === name);
const childText = (n: XmlNode, name: string) => child(n, name)?.text.trim() ?? '';
function* descendants(n: XmlNode, name: string): Generator<XmlNode> {
  for (const c of n.children) {
    if (c.name === name) yield c;
    yield* descendants(c, name);
  }
}

// ---- Descriptions ---------------------------------------------------------

export interface DescriptionPart { heading: string; items: string[] }

const stripTags = (h: string) => decode(decode(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))).replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/**
 * A description as words. Most are plain text. Decision points carry a small
 * HTML table ("Concern" and "Managing risk", one line per row), read here into
 * headed lists with the publisher's words unchanged. Styles, scripts, comments
 * and the rest of the markup are dropped; a description that is only markup
 * (a few files carry a cut-off <html><head><style> block) becomes empty.
 */
export function readDescription(raw: string): { text: string; parts: DescriptionPart[] } {
  if (!/<[a-z!/]/i.test(raw)) return { text: raw.trim(), parts: [] };
  const h = raw
    .replace(/<(style|script)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/<meta[^>]*>/gi, '');
  const parts: DescriptionPart[] = [];
  const cells = [...h.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
  if (cells.length) {
    for (const [, tag, body] of cells) {
      const words = stripTags(body!);
      if (!words) continue;
      if (tag!.toLowerCase() === 'th') parts.push({ heading: words, items: [] });
      else {
        if (!parts.length) parts.push({ heading: '', items: [] });
        // The tick or cross the table draws before each line is a picture, not words.
        parts[parts.length - 1]!.items.push(words.replace(/^[\u2713\u2717\u2714\u2718]\s*/, ''));
      }
    }
    const filled = parts.filter((p) => p.items.length || p.heading);
    return { text: filled.map((p) => [p.heading, ...p.items].filter(Boolean).join('\n')).join('\n'), parts: filled };
  }
  return { text: stripTags(h), parts: [] };
}

// ---- KML ----------------------------------------------------------------

function coords(text: string): Position[] {
  const out: Position[] = [];
  for (const t of text.trim().split(/\s+/)) {
    const [x, y] = t.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x!, y!]);
  }
  return out;
}

interface Geometry { polygons: PolygonRings[]; lines: Position[][]; points: Position[] }

function geometryOf(pm: XmlNode): Geometry {
  const g: Geometry = { polygons: [], lines: [], points: [] };
  for (const poly of descendants(pm, 'Polygon')) {
    const rings: PolygonRings = [];
    const outer = child(poly, 'outerBoundaryIs');
    const outerRing = outer && [...descendants(outer, 'coordinates')][0];
    if (!outerRing) continue;
    rings.push(coords(outerRing.text));
    for (const inner of poly.children.filter((c) => c.name === 'innerBoundaryIs')) {
      for (const c of descendants(inner, 'coordinates')) rings.push(coords(c.text));
    }
    if (rings[0]!.length >= 4) g.polygons.push(rings);
  }
  for (const l of descendants(pm, 'LineString')) {
    const c = coords(childText(l, 'coordinates'));
    if (c.length >= 2) g.lines.push(c);
  }
  for (const p of descendants(pm, 'Point')) {
    const c = coords(childText(p, 'coordinates'));
    if (c[0]) g.points.push(c[0]);
  }
  return g;
}

const BY_COLOUR: Record<string, AtesRating> = { green: 'simple', blue: 'challenging', black: 'complex', white: 'non-avalanche', red: 'extreme', doubleblack: 'extreme', 'double-black': 'extreme' };
const BY_WORD: [RegExp, AtesRating][] = [
  [/non[-\s]?avalanche|class 0/i, 'non-avalanche'],
  [/simple|class 1/i, 'simple'],
  [/challenging|class 2/i, 'challenging'],
  [/complex|class 3/i, 'complex'],
  [/extreme|class 4/i, 'extreme'],
];

/** The class a zone or line style means (its colour), or null when the style says none. */
export function ratingOfStyle(styleId: string): AtesRating | null {
  const m = /^(?:zone|ates_line)_([a-z-]+?)_style$/.exec(styleId);
  return m ? BY_COLOUR[m[1]!] ?? null : null;
}

/** The class named in words ("Class 2 – Challenging", "Simple"), or null. */
export function ratingOfWords(...texts: string[]): AtesRating | null {
  for (const t of texts) for (const [re, r] of BY_WORD) if (re.test(t)) return r;
  return null;
}

const POINT_KINDS: Record<string, AtesPointKind> = {
  parking: 'parking', cabin: 'cabin', shelter: 'cabin', hut: 'cabin', destination: 'destination',
  first_aid: 'first-aid', 'first-aid': 'first-aid', firstaid: 'first-aid', other: 'other',
};

/** What a point is, from its style id; null when the style is not a point style. */
export function pointKindOfStyle(styleId: string): AtesPointKind | null {
  if (styleId === 'decision_point_styles') return 'decision-point';
  const m = /^point_of_interest_(.+)_styles?$/.exec(styleId);
  return m ? POINT_KINDS[m[1]!] ?? 'other' : null;
}

export interface ParsedKml {
  area: Omit<AtesArea, 'id'>;
  /** Style id → icon path inside the file. */
  icons: Map<string, string>;
  /** Style id → KML colour (aabbggrr) of its polygon fill, when it has one. */
  fills: Map<string, string>;
  /** Every style id a placemark used, with how many used it (for the index tool's checks). */
  styles: Map<string, number>;
  /** Placemarks the reader did not place (unknown style and no words to go by). */
  unknown: number;
}

/** Read an ATES area's doc.kml into the standard shape. */
export function parseAtesKml(text: string): ParsedKml {
  const root = parseXml(text);
  const doc = [...descendants(root, 'Document')][0] ?? root;
  const icons = new Map<string, string>();
  const fills = new Map<string, string>();
  for (const st of descendants(doc, 'Style')) {
    const id = root.ids.get(st);
    if (!id) continue;
    const href = [...descendants(st, 'IconStyle')].flatMap((i) => [...descendants(i, 'href')])[0]?.text.trim();
    if (href) icons.set(id, href);
    const poly = child(st, 'PolyStyle');
    const colour = poly && childText(poly, 'color');
    if (colour) fills.set(id, colour.toLowerCase());
  }
  const area: Omit<AtesArea, 'id'> = { name: childText(doc, 'name'), boundary: [], zones: [], ratedLines: [], paths: [], routes: [], points: [] };
  const styles = new Map<string, number>();
  let unknown = 0;

  const walk = (n: XmlNode, folders: string[]) => {
    for (const c of n.children) {
      if (c.name === 'Folder' || c.name === 'Document') { walk(c, [...folders, childText(c, 'name')]); continue; }
      if (c.name !== 'Placemark') continue;
      const style = childText(c, 'styleUrl').replace(/^.*#/, '');
      styles.set(style, (styles.get(style) ?? 0) + 1);
      const name = childText(c, 'name');
      const { text: description, parts } = readDescription(childText(c, 'description'));
      const g = geometryOf(c);
      const folder = folders[folders.length - 1] ?? '';
      const inFolder = (re: RegExp) => folders.some((f) => re.test(f));
      if (style === 'area_styles' || (!style && g.polygons.length && folders.length <= 2 && name === area.name)) {
        area.boundary.push(...g.polygons);
        continue;
      }
      if (style === 'access_road_styles' || (!style && inFolder(/access/i) && g.lines.length)) {
        area.routes.push({ name, description, lines: g.lines });
        continue;
      }
      if (style === 'avalanche_path_styles') {
        area.paths.push({ name, description, lines: g.lines });
        continue;
      }
      const kind = pointKindOfStyle(style) ?? (g.points.length && inFolder(/decision/i) ? 'decision-point' : g.points.length && inFolder(/point/i) ? 'other' : null);
      if (kind && g.points.length) {
        for (const at of g.points) area.points.push({ kind, name, description, parts, at, icon: icons.get(style) ?? null } satisfies AtesPoint);
        continue;
      }
      const rating = ratingOfStyle(style) ?? ratingOfWords(folder, name);
      if (rating && g.polygons.length) { area.zones.push({ rating, name, description, polygons: g.polygons }); continue; }
      if (rating && g.lines.length) { area.ratedLines.push({ rating, name, description, lines: g.lines }); continue; }
      unknown++;
    }
  };
  walk(doc, []);
  return { area, icons, fills, styles, unknown };
}

/** A KML colour (aabbggrr) as CSS #rrggbb and its opacity. */
export function kmlColour(c: string): { hex: string; alpha: number } {
  const v = c.padStart(8, 'f');
  return { hex: `#${v.slice(6, 8)}${v.slice(4, 6)}${v.slice(2, 4)}`.toUpperCase(), alpha: parseInt(v.slice(0, 2), 16) / 255 };
}

export interface AtesFile {
  area: AtesArea;
  /** The icon images the file carries, by path ("icons/parking.png"). */
  images: Map<string, Uint8Array>;
}

/** Read a whole KMZ: the area and its icon images. */
export async function parseAtesKmz(id: number, bytes: Uint8Array): Promise<AtesFile & { parsed: ParsedKml }> {
  const files = await unzip(bytes);
  const kmlName = files.has('doc.kml') ? 'doc.kml' : [...files.keys()].find((k) => k.toLowerCase().endsWith('.kml'));
  if (!kmlName) throw new Error('No KML in the file');
  const parsed = parseAtesKml(new TextDecoder().decode(files.get(kmlName)));
  const images = new Map<string, Uint8Array>();
  for (const [k, v] of files) if (/\.(png|jpe?g)$/i.test(k)) images.set(k, v);
  return { area: { id, ...parsed.area }, images, parsed };
}
