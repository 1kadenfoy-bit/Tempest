// Tempest service worker: keeps the app's own files on the device so it opens
// fast and without signal. Map files and weather are not handled here; they
// go through the app's store (saved areas, M3 and M8). No background work: the
// worker only answers requests the open app makes.
// The version changes with each build's file list, so a new build replaces the
// kept copy cleanly.
const CACHE = 'tempest-app-v2';
// Saved areas' terrain tiles, map fonts and icons (app/offline/saved-areas.ts).
const SAVED = 'tempest-saved-v1';

self.addEventListener('install', (event) => {
  // Keep the page and every built file (listed by the build), so the app opens
  // without signal from the very next launch.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const files = new Set(['./', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png']);
      const list = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
      for (const e of Object.values(list)) {
        files.add(e.file);
        for (const f of [...(e.css ?? []), ...(e.assets ?? [])]) files.add(f);
      }
      await cache.addAll([...files]);
    } catch { /* keep whatever is already there */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key !== SAVED) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Other sites (terrain, fonts, icons): a saved area's copy first, so the map
  // works without signal; otherwise the network as usual.
  if (url.origin !== self.location.origin) {
    event.respondWith((async () => {
      const saved = await (await caches.open(SAVED)).match(req.url, { ignoreVary: true });
      return saved ?? fetch(req);
    })());
    return;
  }
  // Map files are read by byte range and saved per area by the app.
  if (req.headers.has('range') || url.pathname.endsWith('.pmtiles')) return;

  // Pages, the manifest and the base map index: newest first, the saved copy
  // without signal.
  if (req.mode === 'navigate' || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('/tiles/basemap.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req.url, { ignoreSearch: true, ignoreVary: true })) ?? (await cache.match('./')) ?? Response.error();
      }
    })());
    return;
  }

  // Built files carry a content hash in their name, so a saved copy is never stale.
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
