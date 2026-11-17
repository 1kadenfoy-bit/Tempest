// The point API's answers kept on the phone until their run is replaced, so
// reopening the app, switching back to a layer or panning back over the same
// place costs nothing against the API's free limits and shows at once.
// (Open-Meteo's terms ask clients to cache; docs/05-data-sources.md.)
//
// Kept in Cache Storage under the request's own address plus the run it
// belongs to; answers for older runs of the same model are dropped when a
// newer one is stored. Only successful answers are kept.

import { ApiLimitError } from '../../adapters/openmeteo-api/point-series';

const CACHE = 'tempest-api-v1';

// ---- The free limits, kept on this side --------------------------------------
// Open-Meteo counts a request as one call per place, times a tenth of the
// variables (above 10), times the days over 14: 600 calls a minute, 5,000 an
// hour, 10,000 a day. Fast panning and switching used to run into the minute
// limit and lose whole stretches of the forecast. The app now keeps count and
// waits for room instead (a margin below each limit), and remembers the count
// across reloads.

const LIMITS = [{ ms: 60_000, max: 500 }, { ms: 3_600_000, max: 4_500 }];
const LOG_KEY = 'tempest.api-log.v1';

/** What one request counts as (Open-Meteo's own rule). */
export function apiWeight(url: string): number {
  const p = new URL(url).searchParams;
  const places = (p.get('latitude') ?? '').split(',').length;
  const vars = (p.get('hourly') ?? '').split(',').filter(Boolean).length;
  let days = Number(p.get('past_days') ?? 0) + Number(p.get('forecast_days') ?? 0);
  const a = p.get('start_hour'), b = p.get('end_hour');
  if (a && b) days = (Date.parse(`${b}Z`) - Date.parse(`${a}Z`)) / 86_400_000;
  return places * Math.max(1, vars / 10) * Math.max(1, days / 14);
}

/** Recent requests: [time, weight]. */
let log: [number, number][] = (() => {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as [number, number][]; } catch { return []; }
})();

/**
 * How long to wait before a request of this weight fits under every limit (0:
 * now). Exported for tests, with the log passed in.
 */
export function waitFor(weight: number, entries: [number, number][], now: number): number {
  let wait = 0;
  for (const { ms, max } of LIMITS) {
    const recent = entries.filter(([t]) => t > now - ms).sort((x, y) => x[0] - y[0]);
    let used = recent.reduce((s, [, w]) => s + w, 0);
    // Oldest first: when enough has aged out of the window, there is room.
    for (const [t, w] of recent) {
      if (used + weight <= max) break;
      used -= w;
      wait = Math.max(wait, t + ms - now);
    }
  }
  return wait;
}

/** Wait for room under the limits, then count the request. Too long a wait (over 90 s) counts as refused. */
async function spend(weight: number) {
  const now = Date.now();
  log = log.filter(([t]) => t > now - 3_600_000);
  const wait = waitFor(weight, log, now);
  if (wait > 90_000) throw new ApiLimitError('Hourly API request limit nearly reached (counted on this phone)', new Date(now + wait));
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  log.push([Date.now(), weight]);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* storage unavailable */ }
}

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
    await spend(apiWeight(url));
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
