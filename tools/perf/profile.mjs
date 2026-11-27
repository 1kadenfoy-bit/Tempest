// Which code keeps the page busy during each step of the tour (the Nov 21
// method: a CPU profile of the page's main thread). Runs the ?perf tour on
// the dev server (readable function names), records a profile, and sums the
// busy time per step by function and by file.
//
//   npx vite --port 5174 --strictPort &      (the dev server)
//   node tools/perf/profile.mjs [--url=http://localhost:5174/] [--prefs=<json>] [--off=a,b]
//        [--label=<name>] [--out=<file.json>] [--top=15]
//
// The main thread only: the map's and the weather's workers are not in it.
/* global window */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const url = arg('url', 'http://localhost:5174/');
const prefs = JSON.parse(arg('prefs', '{}'));
const off = arg('off', '');
const label = arg('label', 'profile');
const out = arg('out', '');
const top = Number(arg('top', '15'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'],
});
await (await import('./recorded.mjs')).useRecordedWeather(context, 'default');
if (Object.keys(prefs).length) {
  await context.addInitScript((p) => {
    const key = 'tempest.prefs.v1';
    const cur = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...cur, ...p }));
  }, prefs);
}
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
const q = `perf${off ? `&off=${off}` : ''}`;
await page.goto(`${url}${url.includes('?') ? '&' : '?'}${q}`, { waitUntil: 'commit' });
// Start once the app has loaded (the tour starts then).
await page.waitForFunction(() => window.tempestPerf?.marks?.everything !== undefined, null, { timeout: 10 * 60_000, polling: 200 });
await cdp.send('Profiler.start');
const p0 = await page.evaluate(() => performance.now());
await page.waitForFunction(() => window.tempestPerf?.tour?.done === true, null, { timeout: 40 * 60_000, polling: 1000 });
const { profile } = await cdp.send('Profiler.stop');
const tour = await page.evaluate(() => window.tempestPerf.tour);
await browser.close();

// Sample times on the page's clock, and each sample's function.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const short = (u) => u.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '').replace(/^node_modules\/\.vite\/deps\//, 'lib:').replace(/^@fs\/.*node_modules\//, 'lib:');
let t = p0;
const steps = tour.steps.map((s) => ({ name: s.name, t0: s.t0, t1: s.t1, busyMs: 0, fns: new Map(), files: new Map() }));
const all = { name: 'whole tour', busyMs: 0, fns: new Map(), files: new Map() };
for (let i = 0; i < profile.samples.length; i++) {
  t += (profile.timeDeltas[i] ?? 0) / 1000;
  const n = byId.get(profile.samples[i]);
  const cf = n?.callFrame;
  const fn = cf?.functionName || '(anonymous)';
  if (fn === '(idle)') continue;
  const dt = (profile.timeDeltas[i + 1] ?? 250) / 1000;
  const file = cf?.url ? short(cf.url) : fn;
  const key = cf?.url ? `${fn} · ${file}:${cf.lineNumber + 1}` : fn;
  const add = (b) => { b.busyMs += dt; b.fns.set(key, (b.fns.get(key) ?? 0) + dt); b.files.set(file, (b.files.get(file) ?? 0) + dt); };
  add(all);
  const s = steps.find((x) => t >= x.t0 && t < x.t1);
  if (s) add(s);
}
// Stretches of uninterrupted script (no idle, no native wait): the freezes the
// app's own code causes, with the app function they ran under.
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const ownerOf = (id) => {
  for (let x = id; x !== undefined; x = parent.get(x)) {
    const cf = byId.get(x)?.callFrame;
    if (cf?.url && /\/(app|core|render|layers|adapters)\//.test(cf.url) && !/\/app\/perf\//.test(cf.url)) return `${cf.functionName || '(anonymous)'} · ${short(cf.url)}:${cf.lineNumber + 1}`;
  }
  const cf = byId.get(id)?.callFrame;
  return cf?.url ? `${cf.functionName || '(anonymous)'} · ${short(cf.url)}` : (cf?.functionName ?? '?');
};
const stretches = [];
{
  let tt = p0, cur = null;
  for (let i = 0; i < profile.samples.length; i++) {
    tt += (profile.timeDeltas[i] ?? 0) / 1000;
    const fn = byId.get(profile.samples[i])?.callFrame.functionName;
    const js = fn !== '(idle)' && fn !== '(program)';
    if (js) {
      if (!cur) cur = { start: tt, end: tt, owners: new Map() };
      cur.end = tt;
      const o = ownerOf(profile.samples[i]);
      cur.owners.set(o, (cur.owners.get(o) ?? 0) + 1);
    } else if (cur) { stretches.push(cur); cur = null; }
  }
  if (cur) stretches.push(cur);
}
const longest = stretches.map((x) => ({
  ms: Math.round(x.end - x.start),
  step: tour.steps.find((st) => x.start >= st.t0 && x.start < st.t1)?.name ?? '',
  mostly: [...x.owners].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${Math.round((v / [...x.owners.values()].reduce((a, b) => a + b, 0)) * 100)}%)`),
})).sort((a, b) => b.ms - a.ms).slice(0, 25);
const topOf = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => ({ what: k, ms: Math.round(v) }));
const result = {
  label, url, prefs, off, at: new Date().toISOString(),
  longestScript: longest,
  steps: [all, ...steps].map((s) => ({ name: s.name, seconds: s.t1 ? Math.round((s.t1 - s.t0) / 100) / 10 : null, busyMs: Math.round(s.busyMs), functions: topOf(s.fns), files: topOf(s.files) })),
  tour,
};
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1)); }
console.log('\n=== Longest stretches of script (ms, step, mostly)');
for (const x of longest.slice(0, 15)) console.log(`  ${String(x.ms).padStart(5)}  ${x.step.padEnd(14)} ${x.mostly.join('; ')}`);
for (const s of result.steps) {
  console.log(`\n=== ${s.name}${s.seconds ? ` (${s.seconds} s)` : ''}: busy ${s.busyMs} ms`);
  for (const f of s.files.slice(0, 8)) console.log(`  file ${String(f.ms).padStart(6)} ms  ${f.what}`);
  for (const f of s.functions.slice(0, 10)) console.log(`  fn   ${String(f.ms).padStart(6)} ms  ${f.what}`);
}
