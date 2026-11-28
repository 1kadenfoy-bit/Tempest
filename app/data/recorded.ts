// Recorded weather: a saved set of forecast answers the app replays instead of
// asking the forecast servers. For working on the app (section chats) and for
// tests: it loads at once, shows the same weather every time, and spends none
// of the servers' free daily limits.
//
// Open the dev server (npm run dev) with ?weather=recorded for the default
// set, or ?weather=<set> for another one in recorded/<set>/. ?weather=live (or
// no parameter) goes back to live data. Sets are made by
// tools/record-weather.mjs; the browser tests replay the same files through
// e2e/recorded.ts.
//
// How: the clock is frozen at the moment the set was recorded, so the app asks
// for exactly what it asked for then, and a small service worker
// (public/recorded-sw.js) answers those requests from the set's files, with
// the same lookup as the browser tests (app/data/recorded-replay.ts: a piece
// of a file is answered from any recorded pieces that hold it). What
// the set does not hold goes to the network as usual, except the Open-Meteo
// point API, which answers "not recorded" so the app reads the recorded run's
// map files instead (and the free limit is never touched).

export interface RecordedSpot { name: string; lng: number; lat: number }

export interface RecordedMeta {
  name: string;
  description: string;
  /** The frozen "now": when the set was recorded. */
  now: string;
  recordedAt: string;
  /** Places recorded with their pin forecast; elsewhere the map files answer. */
  spots: RecordedSpot[];
  layers: string[];
}

const WORKER = 'recorded-sw.js';

/** Starts recorded weather when the address asks for it; null for live data. */
export async function startRecordedWeather(search: string, base: string): Promise<RecordedMeta | null> {
  const params = new URLSearchParams(search);
  const asked = params.get('weather');
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return null;
  if (!asked || asked === 'live') {
    await dropWorker();
    return null;
  }
  const set = asked === 'recorded' ? 'default' : asked;
  const res = await fetch(new URL(`recorded/${set}/meta.json`, base), { cache: 'no-store' });
  if (!res.ok) {
    console.warn(`Recorded weather "${set}" not found (recorded/${set}/meta.json); using live data.`);
    return null;
  }
  const meta = (await res.json()) as RecordedMeta;
  freezeClock(new Date(params.get('now') ?? meta.now));
  await useWorker(set, base);
  document.body.dataset.weather = 'recorded';
  document.title = `Tempest · recorded ${meta.name}`;
  return meta;
}

/** Date.now() and new Date() return the recorded moment from here on. */
function freezeClock(at: Date): void {
  const fixed = at.getTime();
  const Real = Date;
  class Frozen extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed);
      else super(...(args as [string | number]));
    }
    static override now() { return fixed; }
  }
  globalThis.Date = Frozen as DateConstructor;
}

async function useWorker(set: string, base: string): Promise<void> {
  const url = new URL(`${WORKER}?set=${encodeURIComponent(set)}`, base);
  const sw = navigator.serviceWorker;
  if (sw.controller?.scriptURL === url.href) return;
  const changed = new Promise<void>((resolve) => sw.addEventListener('controllerchange', () => resolve(), { once: true }));
  // A module worker: it imports the lookup (app/data/recorded-replay.ts), which the dev server serves.
  await sw.register(url.href, { scope: new URL('./', base).pathname, type: 'module', updateViaCache: 'none' });
  // The worker claims this page as soon as it is active.
  await Promise.race([changed, new Promise((r) => setTimeout(r, 5000))]);
  if (sw.controller?.scriptURL !== url.href) {
    location.reload();
    await new Promise(() => undefined);
  }
}

async function dropWorker(): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations();
  let dropped = false;
  for (const r of regs) {
    if ((r.active ?? r.waiting ?? r.installing)?.scriptURL.includes(WORKER)) {
      await r.unregister();
      dropped = true;
    }
  }
  // Still answered by the old worker until the page loads again.
  if (dropped && navigator.serviceWorker.controller?.scriptURL.includes(WORKER)) {
    location.reload();
    await new Promise(() => undefined);
  }
}
