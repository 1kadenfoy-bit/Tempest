// Records a set of weather for "recorded weather" (app/data/recorded.ts):
// runs the app in a phone-sized browser on live data with the clock frozen,
// visits each layer at each spot, plays through the hours and opens the
// forecast summary, and keeps every answer from the weather and safety
// servers in recorded/<set>/. The dev server (?weather=<set>) and the browser
// tests (e2e/recorded.ts) replay them.
//
//   node tools/record-weather.mjs --set=default --description="Mixed rain and snow, Nov 19"
//
// Options: --set=<name> (default "default"), --description=<text>,
// --spots=seymour,manning,bowen (default all), --layers=<ids> (default all),
// --play=<seconds per layer> (default 25), --port=<dev server port> (5199),
// --add (keep what the set holds and add to it; the frozen time stays).
// Without --add each run replaces the set. A set is a few MB to a few tens of MB.
/* global document -- read inside the browser page */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;

// The places the browser tests use, plus the Manning smoke spot.
const SPOTS = {
  seymour: { name: 'Mt Seymour', lat: 49.3895, lng: -122.948 },
  bowen: { name: 'Bowen Island', lat: 49.38, lng: -123.28 },
  manning: { name: 'Manning Park', lat: 49.07, lng: -120.8 },
};
const LAYERS = ['precipitation', 'temperature', 'wind', 'radar', 'avalanche', 'air-quality'];

// Servers whose answers are kept. Base map and terrain tiles are not: they do
// not change with the weather and are read live (or from the local pieces).
const RECORD = new Set([
  'api.open-meteo.com', 'openmeteo.s3.amazonaws.com', 'air-quality-api.open-meteo.com',
  'geo.weather.gc.ca', 'api.weather.gc.ca', 'dd.weather.gc.ca',
  'api.avalanche.ca', 'avcan-services-api.prod.avalanche.ca', 'weather.prod.avalanche.ca',
  'openmaps.gov.bc.ca', 'apps.gov.bc.ca',
]);
// content-length only matters for HEAD answers (the map-file reader asks a
// file's size that way); a replayed body gets its own length.
const KEEP_HEADERS = ['content-type', 'content-range', 'content-length', 'accept-ranges', 'last-modified', 'etag'];

const set = arg('set', 'default');
const description = arg('description', '');
const spots = arg('spots', Object.keys(SPOTS).join(',')).split(',').map((s) => ({ id: s, ...SPOTS[s] }));
const layers = arg('layers', LAYERS.join(',')).split(',');
const playSeconds = Number(arg('play', '25'));
const port = Number(arg('port', '5199'));

const add = process.argv.includes('--add');
const dir = join('recorded', set);
const old = add && existsSync(join(dir, 'meta.json')) ? JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) : null;
if (!old) rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
// Every answer's bytes go into one file (bodies.bin), found by offset; the same bytes are kept once.
const BODIES = join(dir, 'bodies.bin');
if (!old) writeFileSync(BODIES, '');
let end = statSync(BODIES).size;
const kept = new Map();

const keyOf = (method, url, range) => `${method} ${url}${range ? ` ${range}` : ''}`;
const entries = old ? JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).entries : {};
let bytes = 0;

async function keep(response) {
  const req = response.request();
  const url = new URL(req.url());
  if (!RECORD.has(url.hostname)) return;
  const method = req.method();
  if (method !== 'GET' && method !== 'HEAD') return;
  const status = response.status();
  if (status >= 500 || status === 429) return; // a refusal is not weather
  const headers = {};
  const all = await response.allHeaders().catch(() => ({}));
  for (const h of KEEP_HEADERS) if (all[h] && (h !== 'content-length' || method === 'HEAD')) headers[h] = all[h];
  const range = (await req.allHeaders())['range'];
  const entry = { status, headers };
  if (method === 'GET' && status !== 204 && status !== 304) {
    const body = await response.body().catch(() => null);
    if (!body) return;
    const hash = createHash('sha1').update(body).digest('hex');
    if (!kept.has(hash)) { appendFileSync(BODIES, body); kept.set(hash, end); end += body.length; bytes += body.length; }
    entry.offset = kept.get(hash);
    entry.length = body.length;
  }
  entries[keyOf(method, req.url(), range)] = entry;
}

async function startServer() {
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://localhost:${port}/`)).ok) return server; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  server.kill();
  throw new Error('The dev server did not start');
}

// Frozen at the recording's start (or the set's own time when adding to it).
const now = old ? new Date(old.now) : new Date();
now.setSeconds(0, 0);
const server = await startServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pending = new Set();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

try {
  for (const [s, spot] of spots.entries()) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      geolocation: { latitude: spot.lat, longitude: spot.lng }, permissions: ['geolocation'],
    });
    context.on('response', (r) => { const p = keep(r).catch(() => undefined); pending.add(p); void p.finally(() => pending.delete(p)); });
    for (const layer of layers) {
      log(`${spot.name}: ${layer}`);
      const page = await context.newPage();
      await page.clock.setFixedTime(now);
      await page.addInitScript((l) => {
        const key = 'tempest.prefs.v1';
        const old = JSON.parse(localStorage.getItem(key) ?? '{}');
        localStorage.setItem(key, JSON.stringify({ ...old, layer: l }));
      }, layer);
      await page.goto(`http://localhost:${port}/?insets=47,34`);
      await page.waitForFunction(() => document.body.dataset.run === 'ready', null, { timeout: 90_000 }).catch(() => log('  run not ready'));
      await page.waitForFunction(() => document.body.dataset.series === 'ready', null, { timeout: 90_000 }).catch(() => log('  series not ready'));
      await page.waitForTimeout(3000);
      // Play through the hours so each hour's map is asked for.
      await page.click('#play-button').catch(() => undefined);
      await page.waitForTimeout(playSeconds * 1000);
      await page.click('#play-button').catch(() => undefined);
      // The forecast summary window asks for the longer-range models too.
      if (layer === layers[0]) {
        await page.click('#now-button').catch(() => undefined);
        await page.mouse.move(195, 300);
        await page.mouse.down();
        await page.waitForTimeout(800);
        await page.mouse.up();
        await page.waitForFunction(() => document.body.dataset.summary === 'ready', null, { timeout: 90_000 }).catch(() => log('  summary not ready'));
      }
      await page.waitForTimeout(2000);
      await page.close();
    }
    await Promise.all(pending);
    await context.close();
    if (s < spots.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }
} finally {
  await Promise.all(pending);
  await browser.close();
  server.kill();
}

writeFileSync(join(dir, 'index.json'), JSON.stringify({ entries }));
writeFileSync(join(dir, 'meta.json'), JSON.stringify({
  name: set,
  description: description || old?.description || '',
  now: now.toISOString(),
  recordedAt: old?.recordedAt ?? new Date().toISOString(),
  spots: [...(old?.spots ?? []), ...spots.map(({ name, lat, lng }) => ({ name, lat, lng })).filter((p) => !old?.spots.some((o) => o.name === p.name))],
  layers: [...new Set([...(old?.layers ?? []), ...layers])],
}, null, 2) + '\n');
log(`Kept ${Object.keys(entries).length} answers, ${(bytes / 1e6).toFixed(1)} MB, in ${dir}`);
