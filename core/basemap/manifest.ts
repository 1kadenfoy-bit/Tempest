// Which base map file holds a tile. The base map is split into files so none
// passes the host's per-file limit (tools/build-basemap.mjs writes the
// manifest). Pure logic; no network.

export type BBox = [west: number, south: number, east: number, north: number];

export interface BasemapFile {
  file: string;
  minzoom: number;
  maxzoom: number;
  /** The tile [z, x, y] this file covers, or null for the whole box. */
  tile: [number, number, number] | null;
  /** Detail files: the box they cover. */
  bbox?: BBox;
  name?: string;
  bytes: number;
}

export interface BasemapManifest {
  version: number;
  source: string;
  attribution: string;
  bbox: BBox;
  maxzoom: number;
  vector_layers: unknown[];
  files: BasemapFile[];
}

const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export function tileBounds(z: number, x: number, y: number): BBox {
  return [tileLon(x, z), tileLat(y + 1, z), tileLon(x + 1, z), tileLat(y, z)];
}

function overlaps(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

function contains(file: BasemapFile, z: number, x: number, y: number): boolean {
  if (z < file.minzoom || z > file.maxzoom) return false;
  if (file.tile) {
    const [pz, px, py] = file.tile;
    if (z < pz) return false;
    return x >> (z - pz) === px && y >> (z - pz) === py;
  }
  if (file.bbox) return overlaps(file.bbox, tileBounds(z, x, y));
  return true;
}

/** Files that may hold tile z/x/y, most specific first. */
export function filesForTile(manifest: BasemapManifest, z: number, x: number, y: number): BasemapFile[] {
  return manifest.files
    .filter((f) => contains(f, z, x, y))
    .sort((a, b) => (b.tile?.[0] ?? (b.bbox ? 99 : -1)) - (a.tile?.[0] ?? (a.bbox ? 99 : -1)));
}

/** Highest zoom stored everywhere in the box (detail files add more in places). */
export function baseMaxZoom(manifest: BasemapManifest): number {
  return Math.max(...manifest.files.filter((f) => !f.bbox).map((f) => f.maxzoom));
}

/**
 * Where to find a tile above the zoom stored everywhere: its ancestor at
 * `stored` zoom, and which part of that ancestor it is.
 */
export function ancestorOf(z: number, x: number, y: number, stored: number) {
  const d = z - stored;
  const scale = 2 ** d;
  return { z: stored, x: x >> d, y: y >> d, scale, dx: x - (x >> d) * scale, dy: y - (y >> d) * scale };
}
