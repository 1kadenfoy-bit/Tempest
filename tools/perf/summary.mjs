// The feature runs side by side (docs/plans/performance.md, part 3): for each
// run, the frame rates of the moving steps and the load times, and the change
// against the base run. Prints a table; --md prints it as Markdown.
//
//   node tools/perf/summary.mjs [--dir=docs/reports/performance/data/features] [--md]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dir = arg('dir', 'docs/reports/performance/data/features');
const md = process.argv.includes('--md');

const runs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const step = (r, n) => r.tour?.steps?.find((s) => s.name === n);
const fps = (r, n) => step(r, n)?.frames?.fps ?? null;
const low = (r, n) => step(r, n)?.frames?.low1 ?? null;
const ms = (r, n) => {
  // Average time a frame took while moving, in ms (the cost the run adds or saves).
  const f = step(r, n)?.frames;
  return f?.fps ? 1000 / f.fps : null;
};
const row = (r) => ({
  name: r.label,
  everything: r.marks?.everything ?? null,
  firstMap: r.marks?.firstMap ?? null,
  pan: fps(r, 'Pan'), panLow: low(r, 'Pan'), panMs: ms(r, 'Pan'),
  pinch: fps(r, 'Pinch'),
  tilt: fps(r, 'Tilt 3D'), tiltMs: ms(r, 'Tilt 3D'),
  drag: fps(r, 'Drag time'),
  dragDrawn: step(r, 'Drag time')?.data?.drawn ?? null,
  play: fps(r, 'Play'),
  idleDraws: step(r, 'Idle')?.data?.mapDraws ?? null,
  idleFrames: step(r, 'Idle')?.data?.frameRequests ?? null,
});
const rows = runs.map(row).sort((a, b) => (a.name === 'base' ? -1 : b.name === 'base' ? 1 : a.name.localeCompare(b.name)));
const base = rows.find((r) => r.name === 'base');
const pct = (x, b) => (x === null || b === null || !b ? '' : `${x >= b ? '+' : ''}${Math.round(((x - b) / b) * 100)}%`);
const f1 = (x) => (x === null ? '—' : typeof x === 'number' ? (Math.round(x * 10) / 10).toString() : String(x));

const head = ['run', 'all loaded s', 'pan fps', 'vs base', 'pan ms/frame', 'pinch fps', 'tilt fps', 'vs base', 'drag fps', 'drag drawn', 'play fps', 'idle draws'];
const body = rows.map((r) => [r.name, f1(r.everything && r.everything / 1000), f1(r.pan), pct(r.pan, base?.pan ?? null), f1(r.panMs), f1(r.pinch), f1(r.tilt), pct(r.tilt, base?.tilt ?? null), f1(r.drag), f1(r.dragDrawn), f1(r.play), f1(r.idleDraws)]);
if (md) {
  console.log(`| ${head.join(' | ')} |\n|${head.map(() => ' --- ').join('|')}|`);
  for (const b of body) console.log(`| ${b.join(' | ')} |`);
} else {
  console.log(head.map((h) => h.padEnd(12)).join(''));
  for (const b of body) console.log(b.map((x, i) => String(x).padEnd(i ? 12 : 24)).join(''));
}
