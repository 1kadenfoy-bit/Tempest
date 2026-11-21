// Peaks and huts for the map, cut out of the base map files already on disk.
//
// The base map holds peaks only in its zoom-13 tiles and deeper, so a map
// zoomed out to 10 or 11 has none. This reads those tiles once, at build time,
// and writes one small file (public/places/places.json, shipped with the app)
// the app draws from zoom 10, so a peak's name and height show well before you
// zoom right in. `coverage` lists the base map files it was cut from, so a
// bigger build (all of BC) knows to redo it.
//
//   { version: 1, coverage: [file, ...], peaks: [[name, elevation_m | null, lng, lat], ...],
//     huts:  [[name, kind, lng, lat], ...] }
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { lonToX, latToY } from './pmtiles-cut.mjs';

/** Base map kinds drawn as huts. Camp sites are left out: they are not shelter. */
export const HUT_KINDS = new Set(['alpine_hut', 'wilderness_hut', 'shelter', 'hut']);

class DiskSource {
  constructor(path) { this.path = path; this.fd = openSync(path, 'r'); this.size = fstatSync(this.fd).size; }
  getKey() { return this.path; }
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length);
    readSync(this.fd, buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
  }
  close() { closeSync(this.fd); }
}

/** The tiles a file holds at its deepest zoom, as [z, x, y] ranges. */
function deepTiles(file) {
  const z = file.maxzoom;
  if (file.tile) {
    const [pz, px, py] = file.tile;
    const s = 2 ** (z - pz);
    return { z, x0: px * s, x1: (px + 1) * s - 1, y0: py * s, y1: (py + 1) * s - 1 };
  }
  if (file.bbox) return { z, x0: lonToX(file.bbox[0], z), x1: lonToX(file.bbox[2], z), y0: latToY(file.bbox[3], z), y1: latToY(file.bbox[1], z) };
  return null; // the overview has none
}

export const PLACES_FILE = 'public/places/places.json';

/** Files in the manifest that hold peaks (everything but the overview) and that a peaks file has not been cut from. */
export function placesOutOfDate(manifest, out = PLACES_FILE) {
  if (!existsSync(out)) return true;
  const have = new Set(JSON.parse(readFileSync(out, 'utf8')).coverage ?? []);
  return manifest.files.filter((f) => f.tile || f.bbox).some((f) => !have.has(f.file) && existsSync(`public/tiles/${f.file}`));
}

export async function buildPeaks(dir, manifest, log = console.error, out = PLACES_FILE) {
  const peaks = new Map(); // name -> [[elev, lng, lat]]
  const huts = new Map();
  const covered = [];
  const add = (map, name, extra, lng, lat) => {
    const list = map.get(name) ?? [];
    if (list.some((p) => Math.abs(p[1] - lng) < 0.006 && Math.abs(p[2] - lat) < 0.004)) return;
    list.push([extra, lng, lat]);
    map.set(name, list);
  };
  for (const f of manifest.files) {
    const path = `${dir}/${f.file}`;
    const range = deepTiles(f);
    if (!range || !existsSync(path)) continue;
    const src = new DiskSource(path);
    const archive = new PMTiles(src);
    let found = 0;
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) {
        const t = await archive.getZxy(range.z, x, y);
        if (!t) continue;
        let data = new Uint8Array(t.data);
        if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
        const layer = new VectorTile(new PbfReader(data)).layers.pois;
        if (!layer) continue;
        for (let i = 0; i < layer.length; i++) {
          const feat = layer.feature(i);
          const { kind, name, elevation } = feat.properties;
          if (!name || (kind !== 'peak' && !HUT_KINDS.has(String(kind)))) continue;
          const [lng, lat] = feat.toGeoJSON(x, y, range.z).geometry.coordinates;
          if (kind === 'peak') add(peaks, String(name), Number.isFinite(Number(elevation)) && elevation !== '' ? Math.round(Number(elevation)) : null, lng, lat);
          else add(huts, String(name), String(kind), lng, lat);
          found++;
        }
      }
    }
    src.close();
    covered.push(f.file);
    log(`peaks: ${f.file}: ${found} peaks and huts`);
  }
  const flat = (map) => [...map].flatMap(([name, list]) => list.map(([a, lng, lat]) => [name, a, +lng.toFixed(4), +lat.toFixed(4)]));
  const result = { version: 1, coverage: covered, peaks: flat(peaks), huts: flat(huts) };
  mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  writeFileSync(out, JSON.stringify(result));
  log(`${out}: ${result.peaks.length} peaks, ${result.huts.length} huts`);
  return result;
}

export function readManifest(dir) {
  return JSON.parse(readFileSync(`${dir}/basemap.json`, 'utf8'));
}
