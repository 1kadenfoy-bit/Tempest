// Write a PMTiles v3 archive from tiles already in hand (clustered, shared
// contents stored once). Used to save a base map area on the device; the same
// layout as tools/lib/pmtiles-cut.mjs. Works in browsers and Node 18+.

export interface TileIn { tileId: number; data: Uint8Array }

export interface ArchiveInfo {
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  /** PMTiles tile type (1 = MVT, 4 = WebP) and compression of the tile bytes (1 none, 2 gzip). */
  tileType: number;
  tileCompression: number;
  metadata: unknown;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function varints(nums: number[]): Uint8Array {
  const out: number[] = [];
  for (let v of nums) {
    while (v >= 0x80) { out.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
    out.push(v);
  }
  return Uint8Array.from(out);
}

interface Entry { tileId: number; offset: number; length: number; runLength: number }

function dirBytes(list: Entry[]): Uint8Array {
  const nums = [list.length];
  let last = 0;
  for (const e of list) { nums.push(e.tileId - last); last = e.tileId; }
  for (const e of list) nums.push(e.runLength);
  for (const e of list) nums.push(e.length);
  list.forEach((e, i) => {
    const p = list[i - 1];
    nums.push(i > 0 && p && e.offset === p.offset + p.length ? 0 : e.offset + 1);
  });
  return varints(nums);
}

/** Tile ids in PMTiles order (Hilbert within each zoom). */
export { zxyToTileId } from 'pmtiles';

export async function writePmtiles(tiles: TileIn[], info: ArchiveInfo): Promise<Uint8Array> {
  const sorted = [...tiles].sort((a, b) => a.tileId - b.tileId);
  // Shared contents stored once (ocean and empty tiles repeat a lot).
  const seen = new Map<string, number>();
  const chunks: Uint8Array[] = [];
  const entries: Entry[] = [];
  let cursor = 0;
  for (const t of sorted) {
    const key = `${t.data.length}:${hash(t.data)}`;
    let off = seen.get(key);
    if (off === undefined) {
      off = cursor;
      seen.set(key, off);
      chunks.push(t.data);
      cursor += t.data.length;
    }
    const prev = entries[entries.length - 1];
    if (prev && prev.offset === off && prev.tileId + prev.runLength === t.tileId) prev.runLength++;
    else entries.push({ tileId: t.tileId, offset: off, length: t.data.length, runLength: 1 });
  }

  let root: Uint8Array = await gzip(dirBytes(entries));
  let leaves: Uint8Array = new Uint8Array(0);
  if (root.length > 16384 - 127) {
    for (let size = 4096; ; size *= 2) {
      const leafBufs: Uint8Array[] = [];
      const rootEntries: Entry[] = [];
      let lo = 0;
      for (let i = 0; i < entries.length; i += size) {
        const b = await gzip(dirBytes(entries.slice(i, i + size)));
        rootEntries.push({ tileId: entries[i]!.tileId, offset: lo, length: b.length, runLength: 0 });
        leafBufs.push(b);
        lo += b.length;
      }
      root = await gzip(dirBytes(rootEntries));
      if (root.length <= 16384 - 127) { leaves = concat(leafBufs); break; }
    }
  }
  const meta = await gzip(new TextEncoder().encode(JSON.stringify(info.metadata ?? {})));

  const header = new ArrayBuffer(127);
  const v = new DataView(header);
  new Uint8Array(header).set(new TextEncoder().encode('PMTiles'), 0);
  v.setUint8(7, 3);
  const rootOff = 127, metaOff = rootOff + root.length, leafOff = metaOff + meta.length, tileOff = leafOff + leaves.length;
  const u64 = (pos: number, n: number) => v.setBigUint64(pos, BigInt(n), true);
  u64(8, rootOff); u64(16, root.length);
  u64(24, metaOff); u64(32, meta.length);
  u64(40, leafOff); u64(48, leaves.length);
  u64(56, tileOff); u64(64, cursor);
  u64(72, sorted.length); u64(80, entries.length); u64(88, chunks.length);
  v.setUint8(96, 1); // clustered
  v.setUint8(97, 2); // directories gzip
  v.setUint8(98, info.tileCompression);
  v.setUint8(99, info.tileType);
  v.setUint8(100, info.minZoom);
  v.setUint8(101, info.maxZoom);
  const e7 = (n: number) => Math.round(n * 1e7);
  const [w, s, e, n] = info.bbox;
  v.setInt32(102, e7(w), true); v.setInt32(106, e7(s), true);
  v.setInt32(110, e7(e), true); v.setInt32(114, e7(n), true);
  v.setUint8(118, Math.min(info.maxZoom, Math.max(info.minZoom, 10)));
  v.setInt32(119, e7((w + e) / 2), true); v.setInt32(123, e7((s + n) / 2), true);
  return concat([new Uint8Array(header), root, meta, leaves, ...chunks]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Quick content hash (FNV-1a) for spotting repeated tiles. */
function hash(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]!; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
