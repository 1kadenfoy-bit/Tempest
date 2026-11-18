#!/usr/bin/env node
// Build public/ates/index.json: every ATES area Avalanche Canada serves, with
// its name, box, a simplified outline and its zone counts. The app draws the
// outlines at low zoom and asks for an area's full file only when it is on
// screen, closer in. Run by hand (not in CI), about once a month in winter or
// when Avalanche Canada adds areas:
//
//   NODE_USE_ENV_PROXY=1 node tools/ates-index.mjs [--from=340] [--to=700] [--keep=DIR] [--dir=DIR]
//
// Needs Node 22.18 or newer (it loads the adapter's TypeScript directly; on
// 22.12–22.17 add --experimental-strip-types). Polite: one request a second,
// one at a time. Ids are not listed anywhere public, so it walks them upward
// and stops after GAP missing ids in a row once areas have been found.
// --keep=DIR also saves each KMZ there (for checks; never commit them).
// --dir=DIR reads KMZ files saved by --keep instead of asking the network.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { areaUrl, parseAtesKmz, source } from '../adapters/avalanche-canada/ates.ts';
import { bboxOfRings, simplifyRing } from '../core/avalanche/ates.ts';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('='); return [k, v ?? true];
}));
const FROM = Number(args.from ?? 340);
const TO = Number(args.to ?? 700);
const GAP = Number(args.gap ?? 40);
const OUT = 'public/ates/index.json';
/** About 300 m (a few pixels at zoom 9): an outline to find the area by; the zones come from the area file. */
const TOLERANCE = 0.003;
const round = (v) => Math.round(v * 1e3) / 1e3;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const areas = [];
const styles = new Map();
let misses = 0, unknown = 0, bytesAll = 0;
for (let id = FROM; id <= TO; id++) {
  const started = Date.now();
  if (args.dir) {
    const f = `${args.dir}/${id}.kmz`;
    if (!existsSync(f)) { if (id > TO) break; continue; }
  }
  const res = args.dir ? { ok: true, arrayBuffer: async () => readFileSync(`${args.dir}/${id}.kmz`) } : await fetch(areaUrl(id), { headers: { 'user-agent': 'Tempest ATES index (personal, non-commercial)' } }).catch((e) => ({ ok: false, status: String(e) }));
  if (res.ok) {
    misses = 0;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (args.keep) { mkdirSync(args.keep, { recursive: true }); writeFileSync(`${args.keep}/${id}.kmz`, bytes); }
    try {
      const { area, parsed } = await parseAtesKmz(id, bytes);
      for (const [k, n] of parsed.styles) styles.set(k, (styles.get(k) ?? 0) + n);
      unknown += parsed.unknown;
      bytesAll += bytes.length;
      const zones = {};
      for (const z of area.zones) zones[z.rating] = (zones[z.rating] ?? 0) + 1;
      const outline = area.boundary.map((poly) => [simplifyRing(poly[0], TOLERANCE).map(([x, y]) => [round(x), round(y)])]);
      const bbox = bboxOfRings(area.boundary.length ? area.boundary : area.zones.flatMap((z) => z.polygons)).map(round);
      areas.push({ id, name: area.name, bbox, outline, zones, points: area.points.length, bytes: bytes.length });
      console.error(`${id} ${area.name}: ${area.zones.length} zones, ${area.ratedLines.length} rated lines, ${area.routes.length} routes, ${area.points.length} points, ${(bytes.length / 1024).toFixed(0)} kB${parsed.unknown ? `, ${parsed.unknown} unplaced` : ''}`);
    } catch (err) {
      console.error(`${id}: could not read (${err.message})`);
    }
  } else {
    misses++;
    if (res.status !== 404) console.error(`${id}: ${res.status}`);
    if (areas.length && misses >= GAP) { console.error(`stopping after ${GAP} missing ids in a row (last tried ${id})`); break; }
  }
  if (!args.dir) await pause(Math.max(0, 1000 - (Date.now() - started)));
}

areas.sort((a, b) => a.name.localeCompare(b.name));
mkdirSync('public/ates', { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ made: new Date().toISOString(), source: `${source.baseUrl}/ates/en/areas/{id}.kmz`, areas })}\n`);
console.error(`\n${areas.length} areas, ${(bytesAll / 1e6).toFixed(1)} MB of KMZ in all; ${unknown} placemarks unplaced`);
console.error('styles used:', Object.fromEntries([...styles].sort()));
