#!/usr/bin/env node
// Glaciers for all of BC, from the BC government's Freshwater Atlas glacier
// polygons (DataBC WHSE_BASEMAPPING.FWA_GLACIERS_POLY, through the public WFS at
// openmaps.gov.bc.ca). Simplified to about 70 m and the corners rounded, then
// written as one file the map draws: public/zones/glaciers.json.
//
//   node tools/build-glaciers.mjs
//
// Licence: Open Government Licence - British Columbia (to be confirmed against
// the data catalogue, which this machine cannot reach). The outlines come from
// the province's base mapping and may be older than today's ice; the map says so
// in its credits (see the handoff).
import { mkdirSync, writeFileSync } from 'node:fs';
import { rounded, simplify, roundPoint, ringArea } from './lib/geometry.mjs';

const WFS = 'https://openmaps.gov.bc.ca/geo/pub/WHSE_BASEMAPPING.FWA_GLACIERS_POLY/ows';
const MIN_HA = 15; // smaller patches are specks at the zooms the map is used at
const TOLERANCE = 0.0012; // degrees, about 120 m: glaciers are large and smooth, and the corners are rounded after
const MIN_AREA = 2e-5; // square degrees
const PAGE = 400;

async function get(url) {
  for (let n = 1; n <= 4; n++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (r.ok) return await r.json();
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (n === 4) throw e;
      console.error(`retrying (${n}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * n));
    }
  }
}

const features = [];
for (let start = 0; ; start += PAGE) {
  const q = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'pub:WHSE_BASEMAPPING.FWA_GLACIERS_POLY',
    outputFormat: 'application/json', srsName: 'EPSG:4326', count: String(PAGE), startIndex: String(start), sortBy: 'OBJECTID',
    propertyName: 'OBJECTID,AREA_HA,GEOMETRY', cql_filter: `AREA_HA>=${MIN_HA}`,
  });
  const fc = await get(`${WFS}?${q}`);
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      const out = rings
        .map((ring) => { const s = simplify(ring, TOLERANCE); return s.length >= 4 ? rounded(s, 1).map(roundPoint) : null; })
        .filter((ring) => ring && ringArea(ring) > MIN_AREA);
      if (out.length) features.push({ type: 'Feature', properties: { z: 'ice' }, geometry: { type: 'Polygon', coordinates: out } });
    }
  }
  console.error(`glaciers: ${start + fc.features.length} read, ${features.length} shapes kept`);
  if (fc.features.length < PAGE) break;
}

mkdirSync('public/zones', { recursive: true });
writeFileSync('public/zones/glaciers.json', JSON.stringify({
  type: 'FeatureCollection',
  name: 'BC glaciers',
  source: 'DataBC WHSE_BASEMAPPING.FWA_GLACIERS_POLY (openmaps.gov.bc.ca)',
  licence: 'Open Government Licence - British Columbia',
  built: new Date().toISOString().slice(0, 10),
  features,
}));
console.error(`glaciers.json: ${features.length} shapes`);
