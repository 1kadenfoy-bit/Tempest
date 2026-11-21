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

const base = () => new URL('satellite/', document.baseURI).href;

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
        for (const f of filesForTile({ files: m.entries } as unknown as BasemapManifest, z, x, y)) {
          try {
            const tile = await archive(f.file).getZxy(z, x, y, abort.signal);
            if (tile?.data) return { data: tile.data };
          } catch { /* a missing file reads as no picture here */ }
        }
        return { data: new ArrayBuffer(0) };
      });
    }
    map.addSource(SOURCE, { type: 'raster', tiles: [`${PROTOCOL}://{z}/{x}/{y}`], tileSize: m.manifest.tileSize, minzoom: 0, maxzoom: m.manifest.maxzoom, attribution: m.manifest.attribution });
    const below = map.getLayer('terrain_under') ? 'terrain_under' : undefined;
    // A little less saturated and bright than the raw picture, so weather colours (drawn above) stay the loudest thing.
    map.addLayer({ id: SATELLITE_LAYER, type: 'raster', source: SOURCE, layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.2, 'raster-brightness-max': 0.9 } }, below);
    ready = true;
    applyMapSettings(map);
  });
}
