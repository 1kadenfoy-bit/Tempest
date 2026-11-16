// One MapLibre source over the base map files listed in tiles/basemap.json.
// Each tile request goes to the file that holds it; above the zoom stored
// everywhere (13), tiles come from a detail file where one exists, or are
// enlarged from their zoom-13 ancestor.
import type { VectorSourceSpecification } from 'maplibre-gl';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { ancestorOf, baseMaxZoom, filesForTile, type BasemapFile, type BasemapManifest } from '../../core/basemap/manifest';
import { maplibregl } from './maplibre';
import { overzoomTile } from './overzoom';
import { RangeOrWholeSource } from './range-source';

const PROTOCOL = 'basemap';
/** Labels and lines keep sharpening by enlarging up to this zoom. */
const SOURCE_MAXZOOM = 15;

export interface Basemap {
  manifest: BasemapManifest;
  source: VectorSourceSpecification;
  /** A stored tile (decompressed), from a saved area first, else the hosted files; no enlarging. */
  storedTile(z: number, x: number, y: number): Promise<ArrayBuffer | undefined>;
  /** Read a saved area's base map file before anything else, inside its box. */
  addSaved(id: string, file: File, bbox: [number, number, number, number], minzoom: number, maxzoom: number): void;
  removeSaved(id: string): void;
}

/** Reads byte ranges from a file on the device without loading it whole. */
class FileSliceSource implements Source {
  constructor(private file: File, private key: string) {}
  getKey() { return this.key; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.file.slice(offset, offset + length).arrayBuffer() };
  }
}

export async function loadBasemap(baseUrl: string): Promise<Basemap> {
  const manifestUrl = new URL('tiles/basemap.json', baseUrl).href;
  const manifest = (await (await fetch(manifestUrl)).json()) as BasemapManifest;
  const archives = new Map<string, PMTiles>();
  const archive = (file: string) => {
    let a = archives.get(file);
    if (!a) {
      a = new PMTiles(new RangeOrWholeSource(new URL(`tiles/${file}`, baseUrl).href));
      archives.set(file, a);
    }
    return a;
  };
  const stored = baseMaxZoom(manifest);
  // Saved areas' files, read first (the one read path for live and saved).
  const saved: BasemapFile[] = [];

  async function stored_tile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer | undefined> {
    const savedHere = filesForTile({ ...manifest, files: saved }, z, x, y);
    for (const f of [...savedHere, ...filesForTile(manifest, z, x, y)]) {
      try {
        const t = await archive(f.file).getZxy(z, x, y, signal);
        if (t?.data) return t.data;
      } catch {
        // A missing file (a partial local build) reads as no data.
      }
    }
    return undefined;
  }

  maplibregl.addProtocol(PROTOCOL, async (params, abort) => {
    const m = /(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m) throw new Error(`bad tile url ${params.url}`);
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const direct = await stored_tile(z, x, y, abort.signal);
    if (direct) return { data: direct };
    if (z <= stored) return { data: new ArrayBuffer(0) };
    // Enlarge from the deepest stored ancestor: a detail file's zoom-14 tile, or zoom 13.
    for (let az = z - 1; az >= stored; az--) {
      const a = ancestorOf(z, x, y, az);
      const parent = await stored_tile(a.z, a.x, a.y, abort.signal);
      if (parent) {
        const out = overzoomTile(new Uint8Array(parent), a.scale, a.dx, a.dy);
        return { data: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer };
      }
    }
    return { data: new ArrayBuffer(0) };
  });

  return {
    storedTile: (z, x, y) => stored_tile(z, x, y),
    addSaved(id, file, bbox, minzoom, maxzoom) {
      const name = `saved:${id}`;
      archives.set(name, new PMTiles(new FileSliceSource(file, name)));
      saved.splice(0, saved.length, ...saved.filter((f) => f.file !== name), { file: name, minzoom, maxzoom, tile: null, bbox, bytes: file.size });
    },
    removeSaved(id) {
      const name = `saved:${id}`;
      archives.delete(name);
      const keep = saved.filter((f) => f.file !== name);
      saved.splice(0, saved.length, ...keep);
    },
    manifest,
    source: {
      type: 'vector',
      tiles: [`${PROTOCOL}://{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: SOURCE_MAXZOOM,
      bounds: manifest.bbox,
      attribution: manifest.attribution,
    },
  };
}
