// A saved area's record: what was saved, from which run, and how big. Kept
// as JSON next to the files it names; a format version from the first save
// (architecture rule 7). Pure logic.

export const SAVED_AREA_VERSION = 1;

export interface SavedArea {
  version: number;
  id: string;
  bbox: [number, number, number, number];
  savedAt: string;
  /** Weather: one region file per variable, all steps of one run. */
  weather: {
    source: string;
    model: string;
    run: string;
    validTimes: string[];
    stepHours: number;
    files: Record<string, string>;
    /** The model's own cells kept (so offline numbers equal online ones). */
    ranges: { start: number; end: number }[];
    /** Regular grid the map resamples to for the area. */
    nx: number;
    ny: number;
  };
  /** Base map for the box, as one PMTiles file. */
  basemap: { file: string; minzoom: number; maxzoom: number };
  /** Terrain tiles, fonts and icons kept in the offline cache, by URL. */
  cached: string[];
  bytes: { weather: number; basemap: number; terrain: number; other: number };
}

export function parseSavedAreas(json: unknown): SavedArea[] {
  if (!Array.isArray(json)) return [];
  return json.filter((a): a is SavedArea =>
    typeof a === 'object' && a !== null && (a as SavedArea).version <= SAVED_AREA_VERSION && Array.isArray((a as SavedArea).bbox));
}

export function totalBytes(a: SavedArea): number {
  return a.bytes.weather + a.bytes.basemap + a.bytes.terrain + a.bytes.other;
}

/** Whether the area's box contains the point. */
export function areaContains(a: SavedArea, lng: number, lat: number): boolean {
  const [w, s, e, n] = a.bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** Whether the area's box overlaps another box. */
export function areaOverlaps(a: SavedArea, b: [number, number, number, number]): boolean {
  return a.bbox[0] < b[2] && b[0] < a.bbox[2] && a.bbox[1] < b[3] && b[1] < a.bbox[3];
}

/**
 * The box to save for a view: the view itself, or a box of at most `maxDeg`
 * degrees on each side around its centre (a minimal save in M3; the drag box
 * comes in M8).
 */
export function saveBoxForView(view: [number, number, number, number], maxDeg = 1): [number, number, number, number] {
  const cx = (view[0] + view[2]) / 2;
  const cy = (view[1] + view[3]) / 2;
  const halfW = Math.min((view[2] - view[0]) / 2, maxDeg / 2);
  const halfH = Math.min((view[3] - view[1]) / 2, maxDeg / 2);
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return [r(cx - halfW), r(cy - halfH), r(cx + halfW), r(cy + halfH)];
}

/** Terrain tiles (Terrarium, 512 px) covering a box, zoom 0 to maxZoom. */
export function tilesInBox(bbox: [number, number, number, number], minZoom: number, maxZoom: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const latToY = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z);
  };
  for (let z = minZoom; z <= maxZoom; z++) {
    const max = 2 ** z - 1;
    const x0 = Math.max(0, lonToX(bbox[0], z)), x1 = Math.min(max, lonToX(bbox[2], z));
    const y0 = Math.max(0, latToY(bbox[3], z)), y1 = Math.min(max, latToY(bbox[1], z));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}
