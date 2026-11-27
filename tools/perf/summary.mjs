// The feature runs side by side (docs/plans/performance.md, part 3): for each
// run, the frame rates of the moving steps and the load times, and the change
// against the base run. Prints a table; --md prints it as Markdown.
//
//   node tools/perf/summary.mjs [--dir=docs/reports/performance/data/features] [--md]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dir = arg('dir', 'docs/reports/performance/data/features-cost');
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
  flat: step(r, 'Draw')?.data?.flat?.msPerFrame ?? null,
  tilted: step(r, 'Draw')?.data?.tilted?.msPerFrame ?? null,
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
// Repeated runs (name-1, name-2, ...) are averaged into one row, with how many there were.
const groups = new Map();
for (const r of runs.map(row)) {
  const k = r.name.replace(/-\d+$/, '');
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
const avg = (list) => {
  const out = { name: list.length > 1 ? `${list[0].name.replace(/-\d+$/, '')} (×${list.length})` : list[0].name.replace(/-\d+$/, ''), key: list[0].name.replace(/-\d+$/, '') };
  for (const k of Object.keys(list[0])) {
    if (k === 'name') continue;
    const xs = list.map((r) => r[k]).filter((x) => typeof x === 'number');
    out[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }
  return out;
};
const rows = [...groups.values()].map(avg).sort((a, b) => (a.key === 'base' ? -1 : b.key === 'base' ? 1 : a.key.localeCompare(b.key)));
const base = rows.find((r) => r.key === 'base');
const pct = (x, b) => (x === null || b === null || !b ? '' : `${x >= b ? '+' : ''}${Math.round(((x - b) / b) * 100)}%`);
const f1 = (x) => (x === null ? '—' : typeof x === 'number' ? (Math.round(x * 10) / 10).toString() : String(x));

const head = ['run', 'flat ms', 'vs base', 'tilted ms', 'vs base', 'all loaded s', 'pan fps', 'vs base', 'pan ms/frame', 'pinch fps', 'tilt fps', 'vs base', 'drag fps', 'drag drawn', 'play fps', 'idle draws'];
const body = rows.map((r) => [r.name, f1(r.flat), pct(r.flat, base?.flat ?? null), f1(r.tilted), pct(r.tilted, base?.tilted ?? null), f1(r.everything && r.everything / 1000), f1(r.pan), pct(r.pan, base?.pan ?? null), f1(r.panMs), f1(r.pinch), f1(r.tilt), pct(r.tilt, base?.tilt ?? null), f1(r.drag), f1(r.dragDrawn), f1(r.play), f1(r.idleDraws)]);
if (md) {
  console.log(`| ${head.join(' | ')} |\n|${head.map(() => ' --- ').join('|')}|`);
  for (const b of body) console.log(`| ${b.join(' | ')} |`);
} else {
  console.log(head.map((h) => h.padEnd(12)).join(''));
  for (const b of body) console.log(b.map((x, i) => String(x).padEnd(i ? 12 : 24)).join(''));
}
