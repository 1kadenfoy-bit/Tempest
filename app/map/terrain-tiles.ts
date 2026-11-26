// The BC terrain zones and glaciers, read from one tile file (public/zones/terrain.pmtiles,
// built by tools/build-terrain-tiles.mjs). Each tile request reads just that piece of
// the file, so the map loads only what is on screen instead of every outline at start.
import { PMTiles } from 'pmtiles';
import { maplibregl } from './maplibre';
import { RangeOrWholeSource } from './range-source';

export const TERRAIN_PROTOCOL = 'terrain';

let registered = false;

/** Lets MapLibre ask for `terrain://z/x/y` tiles. Safe to call again. */
export function ensureTerrainProtocol(): void {
  if (registered || typeof document === 'undefined') return;
  registered = true;
  const archive = new PMTiles(new RangeOrWholeSource(new URL('zones/terrain.pmtiles', document.baseURI).href));
  maplibregl.addProtocol(TERRAIN_PROTOCOL, async (params, abort) => {
    const m = /(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m) throw new Error(`bad tile url ${params.url}`);
    try {
      const t = await archive.getZxy(Number(m[1]), Number(m[2]), Number(m[3]), abort.signal);
      return { data: t?.data ?? new ArrayBuffer(0) };
    } catch {
      // A missing file or a cancelled read: no outlines in this piece.
      return { data: new ArrayBuffer(0) };
    }
  });
}
