import { describe, expect, it } from 'vitest';
import { ancestorOf, baseMaxZoom, filesForTile, type BasemapManifest } from './manifest';

const manifest: BasemapManifest = {
  version: 1, source: 'x', attribution: '', bbox: [-139.1, 48.2, -114, 60], maxzoom: 14, vector_layers: [],
  files: [
    { file: 'bc-overview.pmtiles', minzoom: 0, maxzoom: 8, tile: null, bytes: 1 },
    { file: 'bc-6-10-21.pmtiles', minzoom: 9, maxzoom: 13, tile: [6, 10, 21], bytes: 1 },
    { file: 'bc-7-20-41.pmtiles', minzoom: 9, maxzoom: 13, tile: [7, 20, 41], bytes: 1 },
    { file: 'detail-sea-to-sky.pmtiles', minzoom: 14, maxzoom: 14, tile: null, bbox: [-123.4, 49.25, -122.7, 50.35], bytes: 1 },
  ],
};

// Mt Seymour, 49.39 N 122.94 W
const at = (z: number) => [Math.floor(((-122.94 + 180) / 360) * 2 ** z), Math.floor(((1 - Math.asinh(Math.tan((49.39 * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z)] as const;

describe('base map manifest', () => {
  it('uses the overview at low zoom', () => {
    const [x, y] = at(5);
    expect(filesForTile(manifest, 5, x, y).map((f) => f.file)).toEqual(['bc-overview.pmtiles']);
  });
  it('picks the piece whose tile contains the request', () => {
    const [x, y] = at(12);
    expect(filesForTile(manifest, 12, x, y).map((f) => f.file)).toEqual(['bc-6-10-21.pmtiles']);
  });
  it('prefers a finer split piece', () => {
    expect(filesForTile(manifest, 9, 20 * 4, 41 * 4).map((f) => f.file)).toEqual(['bc-7-20-41.pmtiles']);
  });
  it('offers the detail file at zoom 14 inside its box only', () => {
    const [x, y] = at(14);
    expect(filesForTile(manifest, 14, x, y).map((f) => f.file)).toEqual(['detail-sea-to-sky.pmtiles']);
    const kx = Math.floor(((-117 + 180) / 360) * 2 ** 14);
    expect(filesForTile(manifest, 14, kx, y)).toEqual([]);
  });
  it('knows the zoom stored everywhere', () => {
    expect(baseMaxZoom(manifest)).toBe(13);
  });
  it('finds the ancestor quarter for enlarging', () => {
    expect(ancestorOf(14, 5181, 11225, 13)).toEqual({ z: 13, x: 2590, y: 5612, scale: 2, dx: 1, dy: 1 });
    expect(ancestorOf(15, 10363, 22448, 13)).toMatchObject({ x: 2590, y: 5612, scale: 4, dx: 3, dy: 0 });
  });
});
