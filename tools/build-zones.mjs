#!/usr/bin/env node
// Terrain zones from the BC government's Biogeoclimatic Ecosystem Classification
// (BEC) map: forest, parkland (the treeline mix) and alpine, as issued, with
// nothing guessed. Writes public/zones/terrain-zones.json for the map to draw.
//
//   node tools/build-zones.mjs [--region=sea-to-sky,kootenay-pass]
//
// Source: DataBC layer WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY, through
// the public WFS at openmaps.gov.bc.ca. Licence: Open Government Licence - British
// Columbia (attribution to be confirmed against the data catalogue, which this
// machine cannot reach). Polygons are huge (a whole zone is one shape), so each
// is simplified here to about 300 m and its corners rounded and the three classes are written as one small file.
//
//   alpine    ZONE is CMA, IMA or BAFA (the alpine zones)
//   parkland  the subzone's name says "Parkland" (trees thin out: the treeline mix)
//   forest    every other BEC zone
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rounded, simplify, roundPoint as round, ringArea as area } from './lib/geometry.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const cfg = JSON.parse(readFileSync(new URL('./regions.json', import.meta.url), 'utf8'));
const want = args.region ? new Set(String(args.region).split(',')) : null;
const regions = cfg.detailRegions.filter((r) => !want || want.has(r.id));
const WFS = 'https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY/ows';
const TOLERANCE = 0.003; // degrees, about 300 m, then rounded off below
/** Smallest shape kept, in square degrees (about 0.1 km2). */
const MIN_AREA = 1e-5;
const CELL = [0.4, 0.25];
const ALPINE = new Set(['CMA', 'IMA', 'BAFA']);

export const classOf = (p) => (ALPINE.has(p.ZONE) ? 'alpine' : /parkland/i.test(p.SUBZONE_NAME ?? '') ? 'parkland' : 'forest');

function polygons(geom) { return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates; }

async function get(url) {
  for (let n = 1; n <= 4; n++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(240000) });
      if (r.ok) return await r.json();
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (n === 4) throw e;
      console.error(`retrying (${n}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * n));
    }
  }
}

const seen = new Map(); // feature id -> { cls, label, polygons }
for (const r of regions) {
  const [w, s, e, n] = r.bbox;
  for (let x = w; x < e; x += CELL[0]) {
    for (let y = s; y < n; y += CELL[1]) {
      const bb = [x, y, Math.min(x + CELL[0], e), Math.min(y + CELL[1], n)];
      const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=pub:WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY&outputFormat=application/json&srsName=EPSG:4326&bbox=${bb.join(',')},EPSG:4326&propertyName=ZONE,SUBZONE_NAME,MAP_LABEL,GEOMETRY`;
      const fc = await get(url);
      let fresh = 0;
      for (const f of fc.features) {
        if (!f.geometry || seen.has(f.id)) continue;
        fresh++;
        const polys = polygons(f.geometry).map((rings) => rings.map((ring) => { const s = simplify(ring, TOLERANCE); return s.length >= 4 ? rounded(s).map(round) : s.map(round); }).filter((ring) => ring.length >= 4 && area(ring) > MIN_AREA));
        seen.set(f.id, { cls: classOf(f.properties), label: f.properties.MAP_LABEL, polys: polys.filter((p) => p.length) });
      }
      console.error(`${r.id} ${bb.map((v) => v.toFixed(2)).join(',')}: ${fc.features.length} polygons, ${fresh} new`);
    }
  }
}

const features = [...seen.values()].flatMap((v) => v.polys.map((rings) => ({
  type: 'Feature', properties: { z: v.cls, bec: v.label }, geometry: { type: 'Polygon', coordinates: rings },
})));
const out = {
  type: 'FeatureCollection',
  name: 'BC biogeoclimatic zones, three classes',
  source: 'DataBC WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY (openmaps.gov.bc.ca)',
  licence: 'Open Government Licence - British Columbia',
  built: new Date().toISOString().slice(0, 10),
  regions: regions.map((r) => r.id),
  features,
};
mkdirSync('public/zones', { recursive: true });
writeFileSync('public/zones/terrain-zones.json', JSON.stringify(out));
const counts = {};
for (const f of features) counts[f.properties.z] = (counts[f.properties.z] ?? 0) + 1;
console.error(`terrain-zones.json: ${features.length} shapes`, counts);
