// The point API's answers kept on the phone until their run is replaced, so
// reopening the app, switching back to a layer or panning back over the same
// place costs nothing against the API's free limits and shows at once.
// (Open-Meteo's terms ask clients to cache; docs/05-data-sources.md.)
//
// Kept in Cache Storage under the request's own address plus the run it
// belongs to; answers for older runs of the same model are dropped when a
// newer one is stored. Only successful answers are kept.

const CACHE = 'tempest-api-v1';

/** A fetch for one model run that answers from the phone when it can. */
export function cachedFetch(run: Date): typeof fetch {
  const runKey = run.toISOString();
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const key = `${url}&_run=${encodeURIComponent(runKey)}`;
    let cache: Cache | null = null;
    try { cache = await caches.open(CACHE); } catch { /* no Cache Storage (private window): just fetch */ }
    const hit = await cache?.match(key).catch(() => undefined);
    if (hit) return hit;
    const res = await fetch(input, init);
    if (res.ok && cache) {
      void cache.put(key, res.clone()).then(() => prune(cache!, url, runKey)).catch(() => undefined);
    }
    return res;
  };
}

/** Drop answers for the same model from other runs. */
async function prune(cache: Cache, url: string, runKey: string) {
  const model = new URL(url).searchParams.get('models');
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (u.searchParams.get('models') === model && u.searchParams.get('_run') !== runKey) await cache.delete(req);
  }
}
