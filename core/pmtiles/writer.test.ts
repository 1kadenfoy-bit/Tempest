import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { writePmtiles, zxyToTileId } from './writer';

class Mem implements Source {
  constructor(private b: Uint8Array) {}
  getKey() { return 'mem'; }
  async getBytes(o: number, l: number): Promise<RangeResponse> {
    return { data: this.b.slice(o, o + l).buffer };
  }
}

describe('PMTiles writer', () => {
  it('writes an archive the standard reader reads back', async () => {
    const tiles = [
      { z: 0, x: 0, y: 0, d: [1, 2, 3] },
      { z: 1, x: 1, y: 0, d: [4, 5] },
      { z: 1, x: 0, y: 1, d: [9, 9, 9, 9] },
      { z: 1, x: 1, y: 1, d: [9, 9, 9, 9] }, // repeated content, stored once
    ];
    const bytes = await writePmtiles(
      tiles.map((t) => ({ tileId: zxyToTileId(t.z, t.x, t.y), data: Uint8Array.from(t.d) })),
      { bbox: [-124, 49, -122, 50], minZoom: 0, maxZoom: 1, tileType: 1, tileCompression: 1, metadata: { name: 'test' } },
    );
    const p = new PMTiles(new Mem(bytes));
    const h = await p.getHeader();
    expect([h.minZoom, h.maxZoom, h.numAddressedTiles, h.numTileContents]).toEqual([0, 1, 4, 3]);
    for (const t of tiles) {
      const got = await p.getZxy(t.z, t.x, t.y);
      expect(Array.from(new Uint8Array(got!.data))).toEqual(t.d);
    }
    expect(await p.getZxy(1, 0, 0)).toBeUndefined();
    expect(await p.getMetadata()).toEqual({ name: 'test' });
  });

  it('splits a big directory into leaves', async () => {
    const tiles = [];
    let seed = 1;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let x = 0; x < 256; x++) for (let y = 0; y < 256; y++) {
      // Random lengths, so the directory does not compress away.
      const len = Math.floor(rand() * 200) + 3;
      const d = new Uint8Array(len); d[0] = x; d[1] = y; d[2] = x ^ y;
      tiles.push({ tileId: zxyToTileId(8, x, y), data: d });
    }
    const bytes = await writePmtiles(tiles, { bbox: [-180, -85, 180, 85], minZoom: 8, maxZoom: 8, tileType: 1, tileCompression: 1, metadata: {} });
    const p = new PMTiles(new Mem(bytes));
    expect((await p.getHeader()).leafDirectoryLength).toBeGreaterThan(0);
    expect(Array.from(new Uint8Array((await p.getZxy(8, 100, 33))!.data)).slice(0, 3)).toEqual([100, 33, 100 ^ 33]);
  });
});
