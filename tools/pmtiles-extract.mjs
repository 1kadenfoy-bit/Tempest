#!/usr/bin/env node
// Cut a bounding box and zoom range out of a remote PMTiles v3 archive, or
// report what it would weigh (--dry-run). Written on the pmtiles JS library so
// no separate binary is needed. Used for the download-size spike and to build
// the regional base map and terrain files the app hosts.
//
//   node tools/pmtiles-extract.mjs <url> <out.pmtiles> --bbox=w,s,e,n --minzoom=0 --maxzoom=14 [--dry-run]

import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { FetchSource, PMTiles, SharedPromiseCache, findTile, zxyToTileId } from 'pmtiles';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  }),
);
const [url, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!url || !args.bbox || (!out && !args['dry-run'])) {
  console.error('usage: pmtiles-extract.mjs <url> <out> --bbox=w,s,e,n [--minzoom=0] [--maxzoom=N] [--dry-run]');
  process.exit(1);
}
const [w, s, e, n] = String(args.bbox).split(',').map(Number);

const source = new FetchSource(url);
const cache = new SharedPromiseCache(100000);
const archive = new PMTiles(source, cache);
const header = await archive.getHeader();
const minZoom = Math.max(Number(args.minzoom ?? header.minZoom), header.minZoom);
const maxZoom = Math.min(Number(args.maxzoom ?? header.maxZoom), header.maxZoom);

const lonToX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const clamp = (v, z) => Math.min(Math.max(v, 0), 2 ** z - 1);

async function lookup(tileId) {
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

// 1. Find every tile in the box.
const found = []; // { tileId, offset, length }
const perZoom = [];
for (let z = minZoom; z <= maxZoom; z++) {
  const x0 = clamp(lonToX(w, z), z), x1 = clamp(lonToX(e, z), z);
  const y0 = clamp(latToY(n, z), z), y1 = clamp(latToY(s, z), z);
  const jobs = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const tileId = zxyToTileId(z, x, y);
      jobs.push(lookup(tileId).then((hit) => hit && found.push({ tileId, ...hit })));
    }
  }
  await Promise.all(jobs);
  perZoom.push({ z, tiles: jobs.length });
}
found.sort((a, b) => a.tileId - b.tileId);

const unique = new Map(); // source offset -> length
for (const t of found) unique.set(t.offset, t.length);
const bytes = [...unique.values()].reduce((a, b) => a + b, 0);
const mb = (b) => (b / 1e6).toFixed(1) + ' MB';

const byZoom = {};
for (let z = minZoom; z <= maxZoom; z++) byZoom[z] = 0;
const seen = new Set();
for (const t of found) {
  if (seen.has(t.offset)) continue;
  seen.add(t.offset);
  // tile zoom from id: count of tiles below each zoom
  let z = 0, acc = 0;
  while (acc + 4 ** z <= t.tileId) { acc += 4 ** z; z++; }
  byZoom[z] += t.length;
}
console.log(JSON.stringify({
  url, bbox: [w, s, e, n], minZoom, maxZoom,
  addressedTiles: found.length, uniqueTiles: unique.size, tileBytes: bytes, size: mb(bytes),
  byZoom: Object.fromEntries(Object.entries(byZoom).map(([z, b]) => [z, mb(b)])),
}, null, 2));
if (args['dry-run']) process.exit(0);

// 2. Download tile data in merged ranges.
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
    const resp = await source.getBytes(header.tileDataOffset + r.start, r.end - r.start);
    const buf = new Uint8Array(resp.data);
    for (const o of r.items) data.set(o, buf.slice(o - r.start, o - r.start + unique.get(o)));
    done += r.end - r.start;
  }));
  process.stderr.write(`\rdownloaded ${mb(done)}`);
}
process.stderr.write('\n');

// 3. Lay out the new archive: tile data in tile-id order, shared contents written once.
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
h.writeUInt8(1, 96); // clustered
h.writeUInt8(2, 97); // internal compression: gzip
h.writeUInt8(header.tileCompression, 98);
h.writeUInt8(header.tileType, 99);
h.writeUInt8(minZoom, 100);
h.writeUInt8(maxZoom, 101);
const e7 = (v) => Math.round(v * 1e7);
h.writeInt32LE(e7(w), 102); h.writeInt32LE(e7(s), 106);
h.writeInt32LE(e7(e), 110); h.writeInt32LE(e7(n), 114);
h.writeUInt8(Math.min(maxZoom, Math.max(minZoom, 10)), 118);
h.writeInt32LE(e7((w + e) / 2), 119); h.writeInt32LE(e7((s + n) / 2), 123);

writeFileSync(out, Buffer.concat([h, root, meta, leaves, ...chunks]));
console.error(`wrote ${out}: ${mb(127 + root.length + meta.length + leaves.length + cursor)}`);
