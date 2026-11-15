#!/usr/bin/env node
// Cut a bounding box and zoom range out of a remote PMTiles v3 archive, or
// report what it would weigh (--dry-run). Written on the pmtiles JS library so
// no separate binary is needed.
//
//   node tools/pmtiles-extract.mjs <url> <out.pmtiles> --bbox=w,s,e,n --minzoom=0 --maxzoom=14 [--dry-run]
import { mb, openArchive, planByZoom, planBytes, planTiles, writeArchive } from './lib/pmtiles-cut.mjs';

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
const bbox = String(args.bbox).split(',').map(Number);
const arc = await openArchive(url);
const minZoom = Math.max(Number(args.minzoom ?? arc.header.minZoom), arc.header.minZoom);
const maxZoom = Math.min(Number(args.maxzoom ?? arc.header.maxZoom), arc.header.maxZoom);
const found = await planTiles(arc, { bbox, minZoom, maxZoom });
const bytes = planBytes(found);
console.log(JSON.stringify({
  url, bbox, minZoom, maxZoom, addressedTiles: found.length, tileBytes: bytes, size: mb(bytes),
  byZoom: Object.fromEntries(Object.entries(planByZoom(found)).map(([z, b]) => [z, mb(b)])),
}, null, 2));
if (!args['dry-run']) {
  const size = await writeArchive(arc, found, out, { bbox, minZoom, maxZoom, log: (m) => process.stderr.write(`\r${m}`) });
  console.error(`\nwrote ${out}: ${mb(size)}`);
}
