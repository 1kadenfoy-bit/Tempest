// The ?perf tour on the build machine (docs/plans/performance.md, part 3):
// the same tour Kaden runs on his phone, in a phone-sized browser, with the
// processor slowed down to stand in for the phone.
//
//   node tools/perf/tour.mjs [--url=<address>] [--weather=recorded|live]
//        [--cpu=<slow-down>] [--net=none|slow4g|fast4g]
//        [--prefs=<json merged into the app's saved choices>]
//        [--label=<name>] [--out=<file.json>] [--shot=<card.png>]
//
// --prefs switches features on or off the way the map panel does, before the
// app starts, e.g. --prefs='{"mapSettings":{"satellite":false}}'.
/* global window */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const url = arg('url', 'http://localhost:4173/');
const weather = arg('weather', 'recorded');
const cpu = Number(arg('cpu', '1'));
const net = arg('net', 'none');
const prefs = JSON.parse(arg('prefs', '{}'));
const label = arg('label', 'tour');
const out = arg('out', '');
const shot = arg('shot', '');

const NETS = {
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
};

export async function runTour() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
  });
  if (weather === 'recorded') (await import('./recorded.mjs')).useRecordedWeather(context, 'default');
  if (Object.keys(prefs).length) {
    await context.addInitScript((p) => {
      const key = 'tempest.prefs.v1';
      if (sessionStorage.getItem('perf-prefs-set')) return;
      const cur = JSON.parse(localStorage.getItem(key) ?? '{}');
      const merged = { ...cur, ...p, mapSettings: { ...(cur.mapSettings ?? {}), ...(p.mapSettings ?? {}) }, features: { ...(cur.features ?? {}), ...(p.features ?? {}) } };
      localStorage.setItem(key, JSON.stringify(merged));
      sessionStorage.setItem('perf-prefs-set', '1');
    }, prefs);
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (NETS[net]) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[net] }); }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  const sep = url.includes('?') ? '&' : '?';
  const t0 = Date.now();
  await page.goto(`${url}${sep}perf`, { waitUntil: 'commit' });
  // The tour takes about two minutes on a phone; far longer with a slow-down here.
  await page.waitForFunction(() => window.tempestPerf?.tour?.done === true, null, { timeout: 30 * 60_000, polling: 1000 });
  const tour = await page.evaluate(() => window.tempestPerf.tour);
  const marks = await page.evaluate(() => window.tempestPerf.marks);
  if (shot) { mkdirSync(dirname(shot), { recursive: true }); await page.screenshot({ path: shot }); }
  await browser.close();
  const result = { label, url, weather, cpu, net, prefs, wallSeconds: Math.round((Date.now() - t0) / 1000), marks, tour, errors };
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1)); }
  return result;
}

const r = await runTour();
console.log(`\n=== ${r.label} (cpu x${r.cpu}, ${r.weather}, ${r.wallSeconds} s)`);
console.log('load:', JSON.stringify(r.marks));
for (const s of r.tour.steps) {
  const f = s.frames ? `${s.frames.fps} fps, 1% ${s.frames.low1}, worst ${s.frames.worstMs} ms, map draws ${s.frames.mapDraws}, long tasks ${s.frames.longTasks} (${s.frames.longTaskMs} ms)` : '';
  console.log(`${s.name.padEnd(14)} ${f} ${s.notes.join('; ')}${s.error ? ` ERROR ${s.error}` : ''}`);
}
for (const e of r.errors.slice(0, 10)) console.log('  page error:', e);
