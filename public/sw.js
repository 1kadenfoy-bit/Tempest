// Tempest service worker: keeps the app's own files on the device so it opens
// fast and without signal. Map files and weather are not handled here; they
// go through the app's store (saved areas, M3 and M8). No background work: the
// worker only answers requests the open app makes.
//
// One whole copy of one version at a time (Nov 28, e2e/update.spec.ts). The
// build stamps VERSION with a fingerprint of its file list
// (tools/stamp-sw.ts), so each new version is a new worker, which the browser
// installs beside the old one: it keeps every file of the new version first,
// and only then takes over and drops the old copy. If the signal drops while
// it keeps them, the install fails and the old copy stays whole. Before, this
// file never changed: the phone kept the first version it installed and
// opened it without signal for good.
const VERSION = 'dev';
const CACHE = `tempest-app-${VERSION}`;
// Saved areas' terrain tiles, map fonts and icons (app/offline/saved-areas.ts).
const SAVED = 'tempest-saved-v1';
// Hosts whose files saved areas keep (app/map/terrain-source.ts, app/map/style.ts).
const SAVED_HOSTS = new Set(['tiles.mapterhorn.com', 'protomaps.github.io']);
// Files that are not built (no content hash) but the app reads at start: kept
// with each version, refreshed when online.
const INDEXES = ['tiles/basemap.json', 'ates/index.json', 'places/places.json', 'satellite/satellite.json'];

self.addEventListener('install', (event) => {
  // Keep the page and every built file (listed by the build), fresh from the
  // server, not the browser's own cache. Any failure fails the install: the
  // old copy stays, and the browser tries again at the next launch.
  event.waitUntil((async () => {
    const list = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
    const files = new Set(['./', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', ...INDEXES]);
    for (const [src, e] of Object.entries(list)) {
      // The pages themselves (index.html, the phone test page…), then their files.
      if (src.endsWith('.html') && src !== 'index.html') files.add(src);
      files.add(e.file);
      for (const f of [...(e.css ?? []), ...(e.assets ?? [])]) files.add(f);
    }
    const cache = await caches.open(CACHE);
    // An index the server lacks (a test copy) is not a reason to keep no copy at all.
    await Promise.all([...files].map(async (f) => {
      const res = await fetch(new Request(f, { cache: 'reload' }));
      if (res.ok) await cache.put(f, res);
      else if (!INDEXES.includes(f)) throw new Error(`${f}: ${res.status}`);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Only older copies of the app go: saved areas' pieces and the answers the
    // app keeps on the phone (bulletins, forecasts) stay.
    for (const key of await caches.keys()) if (key.startsWith('tempest-app-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Files the page loaded before this worker was in charge (a first visit), sent
// by the page (app/main.ts): kept, so the app opens without signal next time.
self.addEventListener('message', (event) => {
  const urls = event.data?.keep;
  if (!Array.isArray(urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of urls) {
      if (typeof url !== 'string' || new URL(url).origin !== self.location.origin) continue;
      if (!(await cache.match(url, { ignoreVary: true }))) await cache.add(url).catch(() => undefined);
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Section previews (preview/<section>/) are separate test copies: never answered from here.
  if (url.origin === self.location.origin && url.pathname.includes('/preview/')) return;

  // Other sites: only the ones a saved area keeps copies from (terrain tiles,
  // map fonts and icons) go through here, a saved copy first so the map works
  // without signal. Every other site (weather, alerts, avalanche, stations,
  // radar) is left to the browser: passing those requests through the worker
  // adds a step that Safari has failed on.
  if (url.origin !== self.location.origin) {
    if (!SAVED_HOSTS.has(url.host)) return;
    event.respondWith((async () => {
      const saved = await (await caches.open(SAVED)).match(req.url, { ignoreVary: true });
      return saved ?? fetch(req);
    })());
    return;
  }
  // Map files are read by byte range and saved per area by the app.
  if (req.headers.has('range') || url.pathname.endsWith('.pmtiles')) return;

  // Pages: the network first (an update shows at once), this version's own
  // page without signal. A page fetched here is not kept: it can belong to a
  // newer version whose files this copy does not have (the new worker keeps
  // it, with them).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(req.url, { ignoreSearch: true })) ?? (await cache.match(new URL('./', self.registration.scope).href)) ?? Response.error();
      }
    })());
    return;
  }

  // The manifest, the base map index and the other indexes (not hashed,
  // refreshed by hand): newest first, the kept copy without signal.
  if (url.pathname.endsWith('.webmanifest') || INDEXES.some((f) => url.pathname.endsWith(`/${f}`))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req.url, res.clone());
        return res;
      } catch {
        return (await cache.match(req.url, { ignoreSearch: true, ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }

  // Built files carry a content hash in their name, so a kept copy is never stale.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // By address alone: servers mark these 'Vary: Origin', which would
    // otherwise stop a module script request matching the kept copy.
    const hit = await cache.match(req.url, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});
