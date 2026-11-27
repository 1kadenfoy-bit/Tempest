// Feature-by-feature runs (docs/plans/performance.md, part 3): the tour once
// with Kaden's own setup, then once with each feature switched off (or, for a
// feature he has off, switched on), one after another. Each run's numbers go
// to docs/reports/performance/data/features/<name>.json; the summary table is
// printed at the end (tools/perf/summary.mjs prints it again later).
//
//   node tools/perf/features.mjs [--only=base,bloom] [--repeat=2] [--url=...]
//
// Needs the built app served: npm run build, then npx vite preview.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const url = arg('url', 'http://localhost:4173/');
const only = arg('only', '');
const repeat = Number(arg('repeat', '1'));
// cost: load and the still-frame drawing only (about a minute a run); tour: the whole tour.
const mode = arg('mode', 'cost');
const dir = arg('dir', `docs/reports/performance/data/features-${process.argv.find((x) => x.startsWith('--mode=tour')) ? 'tour' : 'cost'}`);

// Kaden's setup from his first speed test (Nov 27): 3D terrain and buildings on,
// sun on, Terrain ground, peaks off, clouds, wind streaks and water switches off.
const KADEN = {
  terrain3d: true, buildings3d: true, hillshade: true, contours: true, stations: false, layer: 'precipitation',
  mapSettings: { ground: 'shaded', trails: true, trailNames: true, huts: true, camps: true, peaks: false, peakHeights: true, contours: true, smallRoads: true, skiLifts: false, parkBoundaries: false, regionBoundaries: true, municipalBoundaries: true, sun: true },
  features: {},
};
const withPrefs = (p) => ({ ...KADEN, ...p, mapSettings: { ...KADEN.mapSettings, ...(p.mapSettings ?? {}) }, features: { ...KADEN.features, ...(p.features ?? {}) } });

export const RUNS = [
  { name: 'base', prefs: KADEN },
  { name: 'no-bloom', prefs: KADEN, off: 'bloom' },
  { name: 'no-sun', prefs: withPrefs({ mapSettings: { sun: false } }) },
  { name: 'no-shadows', prefs: KADEN, off: 'shadows' },
  { name: 'no-haze', prefs: KADEN, off: 'haze' },
  { name: 'no-water', prefs: KADEN, off: 'water' },
  { name: 'no-zones', prefs: KADEN, off: 'zones' },
  { name: 'no-labels', prefs: KADEN, off: 'labels' },
  { name: 'no-hillshade-contours', prefs: KADEN, off: 'hillshade,contours' },
  { name: 'no-fills', prefs: KADEN, off: 'fills' },
  { name: 'no-3d', prefs: withPrefs({ terrain3d: false, buildings3d: false }) },
  { name: 'no-buildings', prefs: withPrefs({ buildings3d: false }) },
  { name: 'plus-satellite', prefs: withPrefs({ mapSettings: { ground: 'satellite' } }) },
  { name: 'plus-clouds', prefs: withPrefs({ features: { clouds: true } }) },
  { name: 'plus-wind-streaks', prefs: withPrefs({ features: { wind: true } }) },
  { name: 'layer-temperature', prefs: withPrefs({ layer: 'temperature' }) },
  { name: 'layer-wind', prefs: withPrefs({ layer: 'wind' }) },
  { name: 'everything-off', prefs: withPrefs({ terrain3d: false, buildings3d: false, mapSettings: { sun: false } }), off: 'bloom,haze,water,zones,labels,hillshade,contours' },
];

const list = only ? RUNS.filter((r) => only.split(',').includes(r.name)) : RUNS;
for (let k = 1; k <= repeat; k++) {
  for (const r of list) {
    const name = repeat > 1 ? `${r.name}-${k}` : r.name;
    const out = `${dir}/${name}.json`;
    if (existsSync(out)) { console.log(`skip ${name} (done)`); continue; }
    const u = `${url}${url.includes('?') ? '&' : '?'}perf=${mode}&idle=30${r.off ? `&off=${r.off}` : ''}`;
    console.log(`\n>>> ${name}`);
    spawnSync('node', ['tools/perf/tour.mjs', `--url=${u}`, `--label=${name}`, `--prefs=${JSON.stringify(r.prefs)}`, `--out=${out}`], { stdio: 'inherit' });
  }
}
