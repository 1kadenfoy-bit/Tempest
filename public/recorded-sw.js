// Recorded weather (app/data/recorded.ts): answers the app's requests to the
// weather and safety servers from a recorded set in recorded/<set>/, so the
// dev server shows the same weather every time without asking the servers.
// Only registered by the dev server with ?weather=recorded; the installed app
// never uses it. A module worker: it finds answers with the same code as the
// browser tests (app/data/recorded-replay.ts, served by the dev server).
import { makeReplay } from './app/data/recorded-replay.ts';

const set = new URL(self.location.href).searchParams.get('set') || 'default';
const root = new URL('./', self.location.href).href;
const dir = `${root}recorded/${set}/`;

// What the set does not hold goes to the network, except the Open-Meteo point
// and air APIs: their free limits are shared by every chat, and an answer for
// today would not match the recorded run. The app then reads the recorded
// run's map files instead.
const NEVER_LIVE = new Set(['api.open-meteo.com', 'air-quality-api.open-meteo.com']);

let replay = null;
function loadReplay() {
  replay ??= fetch(`${dir}index.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { entries: {} }))
    .then((index) => makeReplay(index.entries));
  return replay;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  e.respondWith(answer(req, url));
});

/** Bytes [offset, offset + length) of the set's bodies.bin, where every answer's bytes sit. */
async function slice({ offset, length }) {
  const res = await fetch(`${dir}bodies.bin`, { headers: { range: `bytes=${offset}-${offset + length - 1}` } });
  const body = await res.arrayBuffer();
  return res.status === 200 ? body.slice(offset, offset + length) : body; // a server without range reads
}

async function answer(req, url) {
  const hit = (await loadReplay()).find(req.method, req.url, req.headers.get('range'));
  if (hit) {
    const headers = { ...hit.headers, 'access-control-allow-origin': '*', 'x-tempest-recorded': set };
    if (req.method === 'HEAD' || !hit.parts.length) return new Response(null, { status: hit.status, headers });
    const parts = await Promise.all(hit.parts.map(slice));
    const body = new Blob(parts);
    return new Response(body, { status: hit.status, headers: { ...headers, 'content-length': String(body.size) } });
  }
  if (NEVER_LIVE.has(url.hostname)) {
    return new Response('Not in the recorded weather', { status: 503, headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' } });
  }
  return fetch(req);
}
