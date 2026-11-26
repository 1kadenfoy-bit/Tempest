#!/usr/bin/env node --experimental-strip-types
// Builds the terrain tiles the map reads: the BC terrain zones (forest, parkland,
// alpine) and the BC glaciers, cut into vector tiles from zoom 0 to 11 and written
// as one PMTiles file, public/zones/terrain.pmtiles. The app then loads only the
// pieces on screen instead of 12 MB of outlines on every start.
//
//   node --experimental-strip-types tools/build-terrain-tiles.mjs [--reuse=DIR]
//
// It runs tools/build-zones.mjs and tools/build-glaciers.mjs (they read the BC
// government's public WFS), unless --reuse points at a folder that already holds
// their output (zones.json, glaciers.json) from an earlier run.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { tileLayers } from './lib/mvt.mjs';
import { writePmtiles, zxyToTileId } from '../core/pmtiles/writer.ts';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const MAXZOOM = 11;
const dir = typeof args.reuse === 'string' ? args.reuse : `${tmpdir()}/tempest-terrain-${Date.now()}`;
mkdirSync(dir, { recursive: true });
const zonesFile = `${dir}/zones.json`, glaciersFile = `${dir}/glaciers.json`;
if (!existsSync(zonesFile)) execFileSync('node', ['tools/build-zones.mjs', `--out=${zonesFile}`], { stdio: 'inherit' });
if (!existsSync(glaciersFile)) execFileSync('node', ['tools/build-glaciers.mjs', `--out=${glaciersFile}`], { stdio: 'inherit' });

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const zones = read(zonesFile), glaciers = read(glaciersFile);
const asLayer = (name, fc) => ({ name, features: fc.features.map((f) => ({ props: f.properties, polygons: [f.geometry.coordinates] })) });
const layers = [asLayer('zones', zones), asLayer('glaciers', glaciers)];

const tiles = [];
let bytes = 0;
for (let z = 0; z <= MAXZOOM; z++) {
  const cut = tileLayers(layers, z);
  for (const [key, data] of cut) {
    const [x, y] = key.split('/').map(Number);
    const gz = gzipSync(data, { level: 9 });
    tiles.push({ tileId: zxyToTileId(z, x, y), data: new Uint8Array(gz) });
    bytes += gz.length;
  }
  console.error(`zoom ${z}: ${cut.size} tiles, ${(bytes / 1e6).toFixed(2)} MB so far`);
}

const archive = await writePmtiles(tiles, {
  bbox: [-139.1, 48.2, -114.0, 60.0],
  minZoom: 0,
  maxZoom: MAXZOOM,
  tileType: 1,
  tileCompression: 2,
  metadata: {
    name: 'Tempest BC terrain: zones and glaciers',
    description: 'BEC zones (forest, parkland, alpine) for the North Shore, Sea to Sky and Kootenay Pass; glaciers for all of BC. Province of British Columbia, Open Government Licence - British Columbia.',
    built: new Date().toISOString().slice(0, 10),
    zones: { source: zones.source, regions: zones.regions },
    glaciers: { source: glaciers.source },
    vector_layers: [
      { id: 'zones', fields: { z: 'String', bec: 'String' }, minzoom: 0, maxzoom: MAXZOOM },
      { id: 'glaciers', fields: { z: 'String' }, minzoom: 0, maxzoom: MAXZOOM },
    ],
  },
});
mkdirSync('public/zones', { recursive: true });
writeFileSync('public/zones/terrain.pmtiles', archive);
console.error(`public/zones/terrain.pmtiles: ${(archive.length / 1e6).toFixed(2)} MB, ${tiles.length} tiles`);
