#!/usr/bin/env node
// Build the BC base map as several PMTiles files plus a manifest
// (public/tiles/basemap.json), so no file passes the host's per-file limit.
//
//   overview      zoom 0 to OVERVIEW_MAX for the whole BC box
//   pieces        zoom OVERVIEW_MAX+1 to 13, one file per zoom-6 tile
//                 (split into zoom-7 tiles when a piece is too big)
//   detail        zoom 14 (trails) for the mountain regions in regions.json
//
// The app's tile router (app/map/basemap-router.ts) reads the manifest and
// fills zoom 14 elsewhere by enlarging zoom 13.
//
//   node tools/build-basemap.mjs [--dry-run] [--only=6-10-21,...] [--build=URL]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildPeaks, readManifest } from './lib/peaks.mjs';
import { mb, openArchive, planBytes, planTiles, tileBounds, writeArchive, lonToX, latToY } from './lib/pmtiles-cut.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('='); return [k, v ?? true];
}));
const cfg = JSON.parse(readFileSync(new URL('./regions.json', import.meta.url), 'utf8'));
const { bbox: BC, overviewMaxZoom: OVERVIEW_MAX, maxZoom: MAX, detailZoom: DETAIL, pieceLimitMB } = cfg.basemap;
const LIMIT = pieceLimitMB * 1e6;
const OUT = 'public/tiles';
const only = args.only ? new Set(String(args.only).split(',')) : null;

async function latestBuild() {
  for (let back = 0; back < 21; back++) {
    const d = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10).replaceAll('-', '');
    const url = `https://build.protomaps.com/${d}.pmtiles`;
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r?.ok) return url;
  }
  throw new Error('No Protomaps build found in the last 3 weeks');
}

const intersect = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const inside = (pz, px, py) => (z, x, y) => (x >> (z - pz)) === px && (y >> (z - pz)) === py;

// The pieces asked for are already here (a rebuild, or a machine without
// network): nothing to fetch.
if (only && !args.force && !args['dry-run'] && existsSync(`${OUT}/basemap.json`)) {
  const want = [...only].map((n) => (n === 'overview' ? 'bc-overview' : n));
  if (want.every((n) => existsSync(`${OUT}/${n}.pmtiles`))) {
    console.error('base map pieces already present');
    if (!existsSync(`${OUT}/places.json`)) await buildPeaks(OUT, readManifest(OUT));
    process.exit(0);
  }
}

const url = typeof args.build === 'string' ? args.build : await latestBuild();
const arc = await openArchive(url);
console.error(`source ${url}`);

const files = [];
async function piece(name, plan, meta) {
  const bytes = planBytes(plan.found);
  files.push({ file: `${name}.pmtiles`, ...meta, bytes });
  console.error(`${name}: ${mb(bytes)} (${plan.found.length} tiles)`);
  if (args['dry-run'] || (only && !only.has(name) && !only.has(meta.group))) return;
  const out = `${OUT}/${name}.pmtiles`;
  if (existsSync(out) && !args.force) return;
  await writeArchive(arc, plan.found, out, { bbox: plan.bbox, minZoom: meta.minzoom, maxZoom: meta.maxzoom });
}

mkdirSync(OUT, { recursive: true });

// Overview
{
  const found = await planTiles(arc, { bbox: BC, minZoom: 0, maxZoom: OVERVIEW_MAX });
  await piece('bc-overview', { found, bbox: BC }, { group: 'overview', minzoom: 0, maxzoom: OVERVIEW_MAX, tile: null });
}

// Pieces by zoom-6 tile, split to zoom 7 when too big
const PZ = 6;
for (let px = lonToX(BC[0], PZ); px <= lonToX(BC[2], PZ); px++) {
  for (let py = latToY(BC[3], PZ); py <= latToY(BC[1], PZ); py++) {
    const bbox = intersect(BC, tileBounds(PZ, px, py));
    const found = await planTiles(arc, { bbox, minZoom: OVERVIEW_MAX + 1, maxZoom: MAX, keep: inside(PZ, px, py) });
    if (!found.length) continue;
    if (planBytes(found) <= LIMIT) {
      await piece(`bc-${PZ}-${px}-${py}`, { found, bbox }, { group: `bc-${PZ}-${px}-${py}`, minzoom: OVERVIEW_MAX + 1, maxzoom: MAX, tile: [PZ, px, py] });
      continue;
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const [cz, cx, cy] = [PZ + 1, px * 2 + dx, py * 2 + dy];
      const cb = intersect(BC, tileBounds(cz, cx, cy));
      if (cb[0] >= cb[2] || cb[1] >= cb[3]) continue;
      const sub = await planTiles(arc, { bbox: cb, minZoom: OVERVIEW_MAX + 1, maxZoom: MAX, keep: inside(cz, cx, cy) });
      if (!sub.length) continue;
      if (planBytes(sub) > LIMIT) throw new Error(`piece ${cz}-${cx}-${cy} is ${mb(planBytes(sub))}, over the limit`);
      await piece(`bc-${cz}-${cx}-${cy}`, { found: sub, bbox: cb }, { group: `bc-${PZ}-${px}-${py}`, minzoom: OVERVIEW_MAX + 1, maxzoom: MAX, tile: [cz, cx, cy] });
    }
  }
}

// Zoom-14 detail for mountain regions
for (const r of cfg.detailRegions) {
  const [lo, hi] = r.zooms ?? [DETAIL, DETAIL];
  const found = await planTiles(arc, { bbox: r.bbox, minZoom: lo, maxZoom: hi });
  await piece(`detail-${r.id}`, { found, bbox: r.bbox }, { group: `detail-${r.id}`, minzoom: lo, maxzoom: hi, tile: null, bbox: r.bbox, name: r.name });
}

const total = files.reduce((a, f) => a + f.bytes, 0);
console.error(`total ${mb(total)} in ${files.length} files`);
const manifest = {
  version: 1,
  source: url,
  attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
  bbox: BC,
  maxzoom: Math.max(DETAIL, ...cfg.detailRegions.map((r) => r.zooms?.[1] ?? DETAIL)),
  vector_layers: (await arc.archive.getMetadata()).vector_layers,
  files: files.map((f) => ({ file: f.file, minzoom: f.minzoom, maxzoom: f.maxzoom, tile: f.tile, ...(f.bbox ? { bbox: f.bbox, name: f.name } : {}), bytes: f.bytes })),
};
if (!args['dry-run']) {
  writeFileSync(`${OUT}/basemap.json`, JSON.stringify(manifest, null, 1));
  // Peaks and huts, cut out of the files just written (see tools/lib/peaks.mjs).
  await buildPeaks(OUT, manifest);
} else console.log(JSON.stringify(files.map((f) => [f.file, mb(f.bytes)])));
