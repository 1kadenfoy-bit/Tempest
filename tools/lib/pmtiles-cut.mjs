// Plan and write cut-outs of a remote PMTiles v3 archive. Used by
// tools/pmtiles-extract.mjs (one box) and tools/build-basemap.mjs (BC in pieces).
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { FetchSource, PMTiles, SharedPromiseCache, findTile, zxyToTileId } from 'pmtiles';

export async function openArchive(url) {
  const source = new FetchSource(url);
  const cache = new SharedPromiseCache(200000);
  const archive = new PMTiles(source, cache);
  const header = await archive.getHeader();
  return { url, source, cache, archive, header };
}

export const lonToX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
export const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
export const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
export const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
/** [west, south, east, north] of a tile. */
export const tileBounds = (z, x, y) => [tileLon(x, z), tileLat(y + 1, z), tileLon(x + 1, z), tileLat(y, z)];
const clamp = (v, z) => Math.min(Math.max(v, 0), 2 ** z - 1);

async function lookup(arc, tileId) {
  const { cache, source, header } = arc;
  let offset = header.rootDirectoryOffset;
  let length = header.rootDirectoryLength;
  for (let depth = 0; depth < 4; depth++) {
    const entries = await cache.getDirectory(source, offset, length, header);
    const entry = findTile(entries, tileId);
    if (!entry) return null;
    if (entry.runLength > 0) return { offset: entry.offset, length: entry.length };
    offset = header.leafDirectoryOffset + entry.offset;
    length = entry.length;
  }
  return null;
}

/**
 * Every tile of the archive inside bbox for minZoom..maxZoom, optionally
 * narrowed by keep(z, x, y). Returns [{ tileId, z, offset, length }] sorted.
 */
export async function planTiles(arc, { bbox, minZoom, maxZoom, keep }) {
  const [w, s, e, n] = bbox;
  minZoom = Math.max(minZoom ?? arc.header.minZoom, arc.header.minZoom);
  maxZoom = Math.min(maxZoom ?? arc.header.maxZoom, arc.header.maxZoom);
  const found = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = clamp(lonToX(w, z), z), x1 = clamp(lonToX(e, z), z);
    const y0 = clamp(latToY(n, z), z), y1 = clamp(latToY(s, z), z);
    const jobs = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (keep && !keep(z, x, y)) continue;
        const tileId = zxyToTileId(z, x, y);
        jobs.push(lookup(arc, tileId).then((hit) => hit && found.push({ tileId, z, ...hit })));
        if (jobs.length >= 4000) { await Promise.all(jobs.splice(0)); }
      }
    }
    await Promise.all(jobs);
  }
  found.sort((a, b) => a.tileId - b.tileId);
  return found;
}

/** Bytes of tile data a plan needs, shared contents counted once. */
export function planBytes(found) {
  const unique = new Map();
  for (const t of found) unique.set(t.offset, t.length);
  let total = 0;
  for (const l of unique.values()) total += l;
  return total;
}

export function planByZoom(found) {
  const seen = new Set();
  const byZoom = {};
  for (const t of found) {
    if (seen.has(t.offset)) continue;
    seen.add(t.offset);
    byZoom[t.z] = (byZoom[t.z] ?? 0) + t.length;
  }
  return byZoom;
}

export const mb = (b) => (b / 1e6).toFixed(1) + ' MB';

function varints(nums) {
  const outb = [];
  for (let v of nums) {
    while (v >= 0x80) { outb.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
    outb.push(v);
  }
  return outb;
}

function serializeDir(list) {
  const nums = [list.length];
  let last = 0;
  for (const en of list) { nums.push(en.tileId - last); last = en.tileId; }
  for (const en of list) nums.push(en.runLength);
  for (const en of list) nums.push(en.length);
  list.forEach((en, i) => {
    const p = list[i - 1];
    nums.push(i > 0 && en.offset === p.offset + p.length ? 0 : en.offset + 1);
  });
  return gzipSync(Uint8Array.from(varints(nums)));
}

/** Download the planned tiles and write a new clustered PMTiles v3 archive. */
export async function writeArchive(arc, found, out, { bbox, minZoom, maxZoom, log = () => {} }) {
  const { source, header, archive } = arc;
  const unique = new Map();
  for (const t of found) unique.set(t.offset, t.length);
  const offsets = [...unique.keys()].sort((a, b) => a - b);
  const data = new Map();
  const ranges = [];
  for (const o of offsets) {
    const last = ranges[ranges.length - 1];
    const end = o + unique.get(o);
    if (last && o - last.end < 65536 && end - last.start < 16e6) {
      last.end = Math.max(last.end, end);
      last.items.push(o);
    } else ranges.push({ start: o, end, items: [o] });
  }
  let done = 0;
  for (let i = 0; i < ranges.length; i += 8) {
    await Promise.all(ranges.slice(i, i + 8).map(async (r) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const resp = await source.getBytes(header.tileDataOffset + r.start, r.end - r.start);
          const buf = new Uint8Array(resp.data);
          if (buf.length !== r.end - r.start) throw new Error('short read');
          for (const o of r.items) data.set(o, buf.slice(o - r.start, o - r.start + unique.get(o)));
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        }
      }
      done += r.end - r.start;
    }));
    log(`downloaded ${mb(done)}`);
  }

  const newOffset = new Map();
  const chunks = [];
  let cursor = 0;
  const entries = [];
  for (const t of found) {
    if (!newOffset.has(t.offset)) {
      newOffset.set(t.offset, cursor);
      chunks.push(data.get(t.offset));
      cursor += t.length;
    }
    const off = newOffset.get(t.offset);
    const prev = entries[entries.length - 1];
    if (prev && prev.offset === off && prev.tileId + prev.runLength === t.tileId) prev.runLength++;
    else entries.push({ tileId: t.tileId, offset: off, length: t.length, runLength: 1 });
  }

  let root = serializeDir(entries);
  let leaves = new Uint8Array(0);
  if (root.length > 16384 - 127) {
    for (let size = 4096; ; size *= 2) {
      const leafBufs = [];
      const rootEntries = [];
      let lo = 0;
      for (let i = 0; i < entries.length; i += size) {
        const b = serializeDir(entries.slice(i, i + size));
        rootEntries.push({ tileId: entries[i].tileId, offset: lo, length: b.length, runLength: 0 });
        leafBufs.push(b);
        lo += b.length;
      }
      root = serializeDir(rootEntries);
      if (root.length <= 16384 - 127) {
        leaves = Buffer.concat(leafBufs);
        break;
      }
    }
  }
  const meta = gzipSync(Buffer.from(JSON.stringify(await archive.getMetadata())));
  const [w, s, e, n] = bbox;
  const h = Buffer.alloc(127);
  h.write('PMTiles', 0, 'ascii');
  h.writeUInt8(3, 7);
  const rootOff = 127, metaOff = rootOff + root.length, leafOff = metaOff + meta.length, tileOff = leafOff + leaves.length;
  const u64 = (pos, v) => h.writeBigUInt64LE(BigInt(v), pos);
  u64(8, rootOff); u64(16, root.length);
  u64(24, metaOff); u64(32, meta.length);
  u64(40, leafOff); u64(48, leaves.length);
  u64(56, tileOff); u64(64, cursor);
  u64(72, found.length); u64(80, entries.length); u64(88, unique.size);
  h.writeUInt8(1, 96);
  h.writeUInt8(2, 97);
  h.writeUInt8(header.tileCompression, 98);
  h.writeUInt8(header.tileType, 99);
  h.writeUInt8(minZoom, 100);
  h.writeUInt8(maxZoom, 101);
  const e7 = (v) => Math.round(v * 1e7);
  h.writeInt32LE(e7(w), 102); h.writeInt32LE(e7(s), 106);
  h.writeInt32LE(e7(e), 110); h.writeInt32LE(e7(n), 114);
  h.writeUInt8(Math.min(maxZoom, Math.max(minZoom, 10)), 118);
  h.writeInt32LE(e7((w + e) / 2), 119); h.writeInt32LE(e7((s + n) / 2), 123);
  const size = 127 + root.length + meta.length + leaves.length + cursor;
  writeFileSync(out, Buffer.concat([h, root, meta, leaves, ...chunks]));
  return size;
}
