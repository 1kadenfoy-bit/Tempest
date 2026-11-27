// Then against now (docs/plans/performance.md, part 4): the same runs on older
// versions of the app, each built with today's ?perf folder and a one-line
// hook, and served on its own port. Each version: the quick cost run twice and
// the whole tour once, with the app's defaults (3D off) and with Kaden's setup.
//
//   node tools/perf/versions.mjs --v=nov18@http://localhost:4175/ --v=nov22@http://localhost:4176/ --v=today@http://localhost:4173/
//
// How the old versions were prepared is in docs/reports/performance/report.md
// (a git worktree per version, app/perf copied in, built with npx vite build).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const versions = process.argv.filter((a) => a.startsWith('--v=')).map((a) => { const [name, url] = a.slice(4).split('@'); return { name, url }; });
const dir = 'docs/reports/performance/data/versions';
const KADEN = {
  terrain3d: true, buildings3d: true, hillshade: true, contours: true, stations: false, layer: 'precipitation',
  mapSettings: { ground: 'shaded', trails: true, trailNames: true, huts: true, camps: true, peaks: false, peakHeights: true, contours: true, smallRoads: true, skiLifts: false, parkBoundaries: false, regionBoundaries: true, municipalBoundaries: true, sun: true },
  features: {},
};
const setups = [{ name: 'default', prefs: { layer: 'precipitation' } }, { name: 'kaden', prefs: KADEN }];
const runs = [];
for (const v of versions) for (const s of setups) {
  runs.push({ out: `${v.name}-${s.name}-cost-1`, url: `${v.url}?perf=cost`, prefs: s.prefs });
  runs.push({ out: `${v.name}-${s.name}-cost-2`, url: `${v.url}?perf=cost`, prefs: s.prefs });
}
for (const v of versions) for (const s of setups) runs.push({ out: `${v.name}-${s.name}-tour`, url: `${v.url}?perf`, prefs: s.prefs });
for (const r of runs) {
  const out = `${dir}/${r.out}.json`;
  if (existsSync(out)) { console.log(`skip ${r.out}`); continue; }
  console.log(`\n>>> ${r.out}`);
  spawnSync('node', ['tools/perf/tour.mjs', `--url=${r.url}`, `--label=${r.out}`, `--prefs=${JSON.stringify(r.prefs)}`, `--out=${out}`], { stdio: 'inherit' });
}
