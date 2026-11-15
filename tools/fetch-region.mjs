#!/usr/bin/env node
// Make sure every region in tools/regions.json has its base map file in
// public/tiles. Skips files that already exist. Finds the newest Protomaps daily
// build, since old builds are removed after a while.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const { regions } = JSON.parse(readFileSync(new URL('./regions.json', import.meta.url), 'utf8'));

async function latestBuild() {
  for (let back = 0; back < 21; back++) {
    const d = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10).replaceAll('-', '');
    const url = `https://build.protomaps.com/${d}.pmtiles`;
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r?.ok) return url;
  }
  throw new Error('No Protomaps build found in the last 3 weeks');
}

let build;
for (const r of regions) {
  const out = `public/tiles/${r.id}.pmtiles`;
  if (existsSync(out)) { console.log(`${out} present`); continue; }
  build ??= await latestBuild();
  console.log(`cutting ${r.name} from ${build}`);
  execFileSync(process.execPath, ['tools/pmtiles-extract.mjs', build, out, `--bbox=${r.bbox.join(',')}`, `--maxzoom=${r.maxzoom}`], { stdio: ['ignore', 'ignore', 'inherit'] });
}
