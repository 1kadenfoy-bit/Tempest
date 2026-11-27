/* global window, document */
// Loading runs for the Performance section (docs/plans/performance.md, part 1):
// opens the app in a phone-sized browser and logs everything it downloads,
// with sizes, where it comes from and when, plus the moments the map, the
// weather and the pin's forecast are ready.
//
//   node tools/perf/load.mjs [--url=<address>] [--weather=recorded|live]
//        [--net=none|slow4g|fast4g] [--cpu=<slow-down>] [--repeat]
//        [--wait=<seconds>] [--out=<file.json>] [--label=<name>]
//
// --url      default http://localhost:4173/ (npm run build, then npx vite preview)
// --weather  recorded (default) answers the weather servers from recorded/default;
//            live asks the real servers (spends the shared free limit: say so in the report)
// --net      slow mobile connection (Chrome's own figures; see NETS below)
// --repeat   opens the app a second time in the same browser (the repeat open:
//            the browser's cache and the installed app's kept files)
//
// Milestones come from the ?perf=load marks (app/perf/marks.ts) when the address
// has the hook, else from the app's own body markers (data-fill, data-series,
// data-idle).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => process.argv.includes(`--${k}`);

const url = arg('url', 'http://localhost:4173/');
const weather = arg('weather', 'recorded');
const net = arg('net', 'none');
const cpu = Number(arg('cpu', '1'));
const wait = Number(arg('wait', '60')) * 1000;
const label = arg('label', `${net}-${weather}`);
const out = arg('out', '');

// Chrome DevTools' own presets (kbit/s turned into bytes a second, latency in ms).
const NETS = {
  none: null,
  // "Slow 4G" in DevTools and Lighthouse's mobile throttling: 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip.
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  // "Fast 4G": 9 Mbit/s down, 1.5 Mbit/s up, 60 ms round trip.
  fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
};

const MT_SEYMOUR = { latitude: 49.3895, longitude: -122.948 };

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    geolocation: MT_SEYMOUR, permissions: ['geolocation'],
    serviceWorkers: 'allow',
  });
  if (weather === 'recorded') {
    const { useRecordedWeather } = await import('./recorded.mjs');
    await useRecordedWeather(context, 'default');
  }
  const runs = [];
  runs.push(await openOnce(context, 'first open'));
  if (flag('repeat')) runs.push(await openOnce(context, 'repeat open'));
  await browser.close();
  const result = { label, url, weather, net, cpu, at: new Date().toISOString(), runs };
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1)); }
  for (const r of runs) printRun(r);
}

async function openOnce(context, name) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (NETS[net]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[net] });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  const reqs = [];
  const t0 = Date.now();
  const byReq = new Map();
  const onRequest = (req) => {
    const r = { url: req.url(), type: req.resourceType(), method: req.method(), range: req.headers().range ?? null, start: Date.now() - t0, end: null, status: null, bytes: null, body: null, fromSW: false, error: null, from: req.serviceWorker() ? 'service worker' : 'page' };
    byReq.set(req, r);
    reqs.push(r);
  };
  context.on('request', onRequest);
  const onFinish = async (req) => {
    const r = byReq.get(req);
    if (!r) return;
    r.end = Date.now() - t0;
    try {
      const res = await req.response();
      if (res) {
        r.status = res.status();
        r.fromSW = res.fromServiceWorker();
        const h = await res.allHeaders();
        r.encoding = h['content-encoding'] ?? null;
        r.cache = h['cache-control'] ?? null;
      }
      const s = await req.sizes();
      r.bytes = s.responseBodySize + s.responseHeadersSize;
      r.body = s.responseBodySize;
    } catch { /* gone */ }
  };
  context.on('requestfinished', (req) => void onFinish(req));
  context.on('requestfailed', (req) => { const r = byReq.get(req); if (r) { r.end = Date.now() - t0; r.error = req.failure()?.errorText ?? 'failed'; } });

  const consoleLines = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`${Date.now() - t0} ms ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => consoleLines.push(`${Date.now() - t0} ms pageerror: ${e.message.slice(0, 300)}`));

  const sep = url.includes('?') ? '&' : '?';
  const target = url.includes('perf') ? url : `${url}${sep}perf=load`;
  await page.goto(target, { waitUntil: 'commit' });

  // Poll the milestones until everything is in, or the wait runs out.
  const marks = {};
  const deadline = Date.now() + wait;
  while (Date.now() < deadline) {
    const m = await page.evaluate(() => ({
      perf: window.tempestPerf?.marks ?? null,
      fill: document.body?.dataset.fill ?? '', series: document.body?.dataset.series ?? '', idle: document.body?.dataset.idle ?? '',
      t: Math.round(performance.now()),
    })).catch(() => null);
    if (m) {
      if (!marks.fill && m.fill === 'ready') marks.fill = m.t;
      if (!marks.series && m.series === 'ready') marks.series = m.t;
      if (!marks.seriesFailed && m.series === 'failed') marks.seriesFailed = m.t;
      if (!marks.idle && m.idle === 'true') marks.idle = m.t;
      if (m.perf) marks.perf = m.perf;
      if (m.perf?.everything !== undefined) break;
      if (!m.perf && marks.fill && (marks.series || marks.seriesFailed) && marks.idle) break;
    }
    await page.waitForTimeout(100);
  }
  // Let late requests settle a little, so the list shows what follows "everything".
  await page.waitForTimeout(3000);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? { responseEnd: Math.round(n.responseEnd), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
  });
  const fetches = await page.evaluate(() => window.tempestPerf?.fetches ?? []);
  const memory = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));
  context.off('request', onRequest);
  await page.close();
  return { name, marks, nav, memoryMB: memory, requests: reqs, fetches, console: consoleLines };
}

const hostOf = (u) => { try { return new URL(u).host; } catch { return u.slice(0, 30); } };
const kind = (r) => {
  const u = r.url;
  if (/\.pmtiles/.test(u)) return 'base map pieces';
  if (/mapterhorn|terrain/.test(u)) return 'terrain';
  if (/satellite/.test(u)) return 'satellite';
  if (/fonts|glyphs|\.pbf$/.test(u) && /protomaps|fonts/.test(u)) return 'map fonts';
  if (/sprites?/.test(u)) return 'map icons';
  if (/open-meteo|\.om(\?|$)/.test(u)) return 'weather';
  if (/zones|ates/.test(u)) return 'terrain zones';
  if (/places/.test(u)) return 'places';
  if (/\.woff2?/.test(u)) return 'app fonts';
  if (/\.(js|css|wasm|html)(\?|$)/.test(u) || r.type === 'document') return 'app code';
  return r.type;
};

/** One line per download: a request the service worker passed on is counted once, as the worker's. */
export function downloads(r) {
  const viaWorker = new Set(r.requests.filter((q) => q.from === 'service worker').map((q) => q.url));
  return r.requests.filter((q) => !(q.from === 'page' && q.fromSW && viaWorker.has(q.url)));
}

function printRun(run) {
  const r = { ...run, requests: downloads(run) };
  const mb = (b) => (b / 1e6).toFixed(2);
  console.log(`\n=== ${label}: ${r.name}`);
  console.log('milestones (ms from the page being asked for):', JSON.stringify({ ...r.marks, nav: r.nav }));
  if (r.memoryMB) console.log(`memory: ${r.memoryMB} MB of script memory`);
  const groups = new Map();
  for (const q of r.requests) {
    const k = kind(q);
    const g = groups.get(k) ?? { n: 0, bytes: 0, first: Infinity, last: 0, failed: 0, sw: 0 };
    g.n++; g.bytes += q.bytes ?? 0; g.first = Math.min(g.first, q.start); g.last = Math.max(g.last, q.end ?? q.start);
    if (q.error || (q.status ?? 0) >= 400) g.failed++;
    if (q.fromSW) g.sw++;
    groups.set(k, g);
  }
  console.log('what                 files   MB      first..last ms   failed  from kept copy');
  for (const [k, g] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`${k.padEnd(20)} ${String(g.n).padStart(5)} ${mb(g.bytes).padStart(7)}  ${String(g.first).padStart(6)}..${String(g.last).padEnd(7)}  ${String(g.failed).padStart(6)}  ${g.sw}`);
  }
  const total = r.requests.reduce((s, q) => s + (q.bytes ?? 0), 0);
  console.log(`total: ${r.requests.length} requests, ${mb(total)} MB`);
  const hosts = new Map();
  for (const q of r.requests) { const h = hostOf(q.url); const x = hosts.get(h) ?? [0, 0]; x[0]++; x[1] += q.bytes ?? 0; hosts.set(h, x); }
  console.log('by host:', [...hosts].map(([h, [n, b]]) => `${h} ${n} / ${mb(b)} MB`).join('; '));
  const bad = r.requests.filter((q) => q.error || (q.status ?? 0) >= 400);
  for (const q of bad.slice(0, 15)) console.log(`  failed: ${q.status ?? ''} ${q.error ?? ''} ${q.url.slice(0, 140)}`);
  for (const c of r.console.slice(0, 15)) console.log(`  ${c}`);
}

await main();
