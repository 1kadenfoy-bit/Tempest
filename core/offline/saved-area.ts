// A saved area's record: what was saved, from which run, and how big. Kept
// as JSON next to the files it names; a format version from the first save
// (architecture rule 7). Pure logic.

/**
 * 3 (Nov 22): the traced outline (`shape`), the model chosen for each layer and
 * the time span chosen. 2 (M8): a name, the choices made, and later models'
 * hours in `more`. Older records still read; the new fields are optional.
 */
export const SAVED_AREA_VERSION = 3;

/** One model run's weather in a saved area: one region file per variable, all its saved steps. */
export type SavedWeatherPart = SavedArea['weather'];

export interface SavedArea {
  version: number;
  id: string;
  /** The place the box is centred on (a map label), for the list. */
  name?: string;
  /** The layers ticked and the window chosen, so a refresh saves the same again. */
  layers?: string[];
  /** Hours from the save, or null for the models' end. */
  window?: number | null;
  /** The span the save covers, when it was chosen on the scrubber (version 3). */
  span?: { from: string; to: string };
  /** The model chosen for each layer ("auto": the chain), for a refresh (version 3). */
  layerModels?: { layer: string; model: string }[];
  /** The outline traced on the map, as [lng, lat] points in order. The map pieces are cut to it (version 3). */
  shape?: [number, number][];
  bbox: [number, number, number, number];
  savedAt: string;
  /** Weather: one region file per variable, all steps of one run (the first model). */
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
  /** Later models' runs, for the hours past the first model's end (the chain), in order. */
  more?: SavedWeatherPart[];
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

/**
 * Each model run in the area as an area of its own (same box and files, one
 * run each), so every reader matches a run the way it always has. Ids differ
 * per part so each is loaded and kept apart.
 */
export function areaParts(a: SavedArea): SavedArea[] {
  return [a, ...(a.more ?? []).map((w, k) => ({ ...a, id: `${a.id}~${k + 1}`, weather: w, more: [] }))];
}

/** Every file the area wrote for its weather. */
export function weatherFiles(a: SavedArea): string[] {
  return [a.weather, ...(a.more ?? [])].flatMap((w) => Object.values(w.files));
}

/** The area's last saved hour, across its models. */
export function lastHour(a: SavedArea): Date | null {
  const times = [a.weather, ...(a.more ?? [])].flatMap((w) => w.validTimes);
  return times.length ? new Date(times.reduce((x, y) => (x > y ? x : y))) : null;
}

/** Expired: every hour it holds has passed. */
export function isExpired(a: SavedArea, now: Date): boolean {
  const last = lastHour(a);
  return !last || last.getTime() < now.getTime();
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

/** Average terrain tile sizes, zoom 0 to 12, fitted to the two M3 saves (23.6 MB and 3.6 MB). */
const TERRAIN_TILE_BYTES = [1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 1.8e5, 8e4, 6e4];

/**
 * Rough size of a save before downloading, apart from the base map (whose
 * exact size comes from its files' indexes): terrain tiles the box touches at
 * each zoom times their average measured size; precipitation by area and hours
 * (0.65 MB per square degree for 48 h); fonts and icons about 0.9 MB.
 */
/** `variables`: how many weather variables are kept (precipitation is 2; temperature's profile 31). */
/**
 * `coarseHours`: of those hours, how many come from a model with 4 times the
 * spacing (RDPS's 10 km after HRDPS's 2.5 km): 16 times fewer cells each.
 */
export function estimateSaveBytes(bbox: [number, number, number, number], hours: number, variables = 2, coarseHours = 0) {
  let terrain = 0;
  TERRAIN_TILE_BYTES.forEach((b, z) => { terrain += tilesInBox(bbox, z, z).length * b; });
  const area = Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
  const fine = Math.max(0, hours - coarseHours);
  const coarse = coarseHours / 16;
  return { terrain, weather: area * 0.65e6 * ((fine + coarse) / 48) * (variables / 2), other: 0.9e6 };
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
