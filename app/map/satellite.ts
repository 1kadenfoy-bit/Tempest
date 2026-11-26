// Satellite ground (Maps section): the one cloud-free Sentinel-2 picture of BC that
// the Data section builds into map tiles (public/satellite/satellite.json and its
// PMTiles files; tools/build-satellite.py). The map reads it like the base map: each
// tile request goes to the file that holds it, and only that piece is read.
//
// Picture: Contains modified Copernicus Sentinel data, Sentinel-2 cloudless by EOX
// (CC BY-NC-SA 4.0, non-commercial: fine for Kaden's personal app). One picture for
// the whole year, not a summer or winter one. It needs the network, so it is not
// available offline or when only saved areas are read.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PMTiles } from 'pmtiles';
import { filesForTile, type BBox, type BasemapFile, type BasemapManifest } from '../../core/basemap/manifest';
import { maplibregl } from './maplibre';
import { RangeOrWholeSource } from './range-source';
import { applyMapSettings } from './map-settings';
import { satelliteLook } from './look';

export const SATELLITE_LAYER = 'satellite-ground';
const SOURCE = 'satellite';
const PROTOCOL = 'satellite';

interface SatelliteManifest {
  attribution: string;
  year: number;
  tileSize: number;
  maxzoom: number;
  files: { file: string; minzoom: number; maxzoom: number; tile: [number, number, number] | null; areas?: { name: string; bbox: BBox }[]; bbox?: BBox }[];
}

let loaded: Promise<{ manifest: SatelliteManifest; entries: BasemapFile[] } | null> | null = null;
const archives = new Map<string, PMTiles>();
let protocolOn = false;
let ready = false;

/** Where the picture's files are. A section preview reads them from the main site (the publish removes its own copy to stay under the site's size limit): VITE_SATELLITE_BASE at build time. */
const base = () => new URL((import.meta.env.VITE_SATELLITE_BASE as string | undefined) ?? 'satellite/', document.baseURI).href;

function load() {
  loaded ??= fetch(new URL('satellite.json', base()).href)
    .then((r) => (r.ok ? (r.json() as Promise<SatelliteManifest>) : Promise.reject(new Error(String(r.status)))))
    .then((manifest) => {
      // A close-up file can cover several boxes: one entry per box, so each box is checked.
      const entries: BasemapFile[] = manifest.files.flatMap((f) => (f.areas?.length
        ? f.areas.map((a) => ({ file: f.file, minzoom: f.minzoom, maxzoom: f.maxzoom, tile: f.tile, bbox: a.bbox, bytes: 0 }))
        : [{ file: f.file, minzoom: f.minzoom, maxzoom: f.maxzoom, tile: f.tile, ...(f.bbox ? { bbox: f.bbox } : {}), bytes: 0 }]));
      return { manifest, entries };
    })
    .catch(() => null);
  return loaded;
}

function archive(file: string): PMTiles {
  let a = archives.get(file);
  if (!a) { a = new PMTiles(new RangeOrWholeSource(new URL(file, base()).href)); archives.set(file, a); }
  return a;
}

/**
 * One tile of an enlarged picture: the (dx, dy) piece out of `scale` x `scale` pieces of
 * `parent`, drawn at full size. Soft, as an enlarged picture is, but never blank.
 */
async function enlarge(parent: ArrayBuffer, scale: number, dx: number, dy: number, size: number): Promise<ArrayBuffer | null> {
  try {
    const bmp = await createImageBitmap(new Blob([parent]));
    const piece = bmp.width / scale;
    const canvas = new OffscreenCanvas(size, size);
    const g = canvas.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, dx * piece, dy * piece, piece, piece, 0, 0, size, size);
    bmp.close();
    return await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })).arrayBuffer();
  } catch {
    return null;
  }
}

/** True once the satellite picture is in the map and can be shown. */
export const satelliteReady = () => ready;

/**
 * Adds the satellite picture under the terrain colours (hidden until the ground
 * setting is Satellite). Called once the map's layers exist; does nothing if the
 * picture's files are missing.
 */
export function addSatellite(map: MapLibreMap): void {
  void load().then((m) => {
    if (!m || map.getSource(SOURCE)) return;
    if (!protocolOn) {
      protocolOn = true;
      maplibregl.addProtocol(PROTOCOL, async (params, abort) => {
        const t = /(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
        if (!t) throw new Error(`bad tile url ${params.url}`);
        const [z, x, y] = [Number(t[1]), Number(t[2]), Number(t[3])];
        const manifest = { files: m.entries } as unknown as BasemapManifest;
        const stored = async (zz: number, xx: number, yy: number): Promise<ArrayBuffer | undefined> => {
          for (const f of filesForTile(manifest, zz, xx, yy)) {
            try {
              const tile = await archive(f.file).getZxy(zz, xx, yy, abort.signal);
              if (tile?.data) return tile.data;
            } catch { /* a missing file reads as no picture here */ }
          }
          return undefined;
        };
        const direct = await stored(z, x, y);
        if (direct) return { data: direct };
        // Past the deepest picture held here (zoom 10 in most of BC), enlarge the nearest one up the pyramid.
        for (let az = z - 1; az >= Math.max(0, z - 4); az--) {
          const scale = 2 ** (z - az);
          const parent = await stored(az, x >> (z - az), y >> (z - az));
          if (parent) {
            const data = await enlarge(parent, scale, x - ((x >> (z - az)) << (z - az)), y - ((y >> (z - az)) << (z - az)), m.manifest.tileSize);
            if (data) return { data };
            break;
          }
        }
        return { data: new ArrayBuffer(0) };
      });
    }
    map.addSource(SOURCE, { type: 'raster', tiles: [`${PROTOCOL}://{z}/{x}/{y}`], tileSize: m.manifest.tileSize, minzoom: 0, maxzoom: m.manifest.maxzoom, attribution: m.manifest.attribution });
    const below = map.getLayer('terrain_under') ? 'terrain_under' : undefined;
    // The game-style colour (app/map/look.ts); the sun look dims it at night.
    map.addLayer({ id: SATELLITE_LAYER, type: 'raster', source: SOURCE, layout: { visibility: 'none' }, paint: satelliteLook(0) as never }, below);
    ready = true;
    applyMapSettings(map);
  });
}
