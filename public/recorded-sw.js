// Recorded weather (app/data/recorded.ts): answers the app's requests to the
// weather and safety servers from a recorded set in recorded/<set>/, so the
// dev server shows the same weather every time without asking the servers.
// Only registered by the dev server with ?weather=recorded; the installed app
// never uses it.
const set = new URL(self.location.href).searchParams.get('set') || 'default';
const root = new URL('./', self.location.href).href;
const dir = `${root}recorded/${set}/`;

// What the set does not hold goes to the network, except the Open-Meteo point
// and air APIs: their free limits are shared by every chat, and an answer for
// today would not match the recorded run. The app then reads the recorded
// run's map files instead.
const NEVER_LIVE = new Set(['api.open-meteo.com', 'air-quality-api.open-meteo.com']);

let index = null;
function loadIndex() {
  index ??= fetch(`${dir}index.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { entries: {} }));
  return index;
}

/** The same key tools/record-weather.mjs and e2e/recorded.ts use. */
function keyOf(method, url, range) {
  return `${method} ${url}${range ? ` ${range}` : ''}`;
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

async function answer(req, url) {
  const { entries } = await loadIndex();
  const hit = entries[keyOf(req.method, req.url, req.headers.get('range'))];
  if (hit) {
    const headers = { ...hit.headers, 'access-control-allow-origin': '*', 'x-tempest-recorded': set };
    if (req.method === 'HEAD' || hit.length === undefined) return new Response(null, { status: hit.status, headers });
    // Every answer's bytes sit in one file, at their offset.
    const res = await fetch(`${dir}bodies.bin`, { headers: { range: `bytes=${hit.offset}-${hit.offset + hit.length - 1}` } });
    let body = await res.arrayBuffer();
    if (res.status === 200) body = body.slice(hit.offset, hit.offset + hit.length); // a server without range reads
    return new Response(body, { status: hit.status, headers: { ...headers, 'content-length': String(body.byteLength) } });
  }
  if (NEVER_LIVE.has(url.hostname)) {
    return new Response('Not in the recorded weather', { status: 503, headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' } });
  }
  return fetch(req);
}
