// Recorded weather for the browser tests: the same sets the dev server replays
// (app/data/recorded.ts, recorded/<set>/, made by tools/record-weather.mjs).
// Every request to the weather and safety servers is answered from the set.
// One the set does not hold is answered "not recorded" at once, never from
// the live server: a recorded run is deleted from Open-Meteo after a few
// days, and a test that quietly read it live passed for days, then waited
// minutes and failed (wind, the saved area and the phone tests, Nov 27).
// The test's log lists what was missing (tests a new set must cover).
// Anything else (base map, terrain tiles) goes to the network. The clock is
// frozen at the recording.
//
// Tests get it through e2e/fixtures.ts. WEATHER=live npm run screenshots runs
// them on live data instead; WEATHER=<set> picks another set.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';

interface Entry { status: number; headers: Record<string, string>; offset?: number; length?: number }
export interface RecordedMeta { name: string; now: string; spots: { name: string; lat: number; lng: number }[] }

// The servers tools/record-weather.mjs keeps every answer from.
const RECORDED_HOSTS = new Set([
  'api.open-meteo.com', 'openmeteo.s3.amazonaws.com', 'air-quality-api.open-meteo.com',
  'geo.weather.gc.ca', 'api.weather.gc.ca', 'dd.weather.gc.ca',
  'api.avalanche.ca', 'avcan-services-api.prod.avalanche.ca', 'weather.prod.avalanche.ca',
  'openmaps.gov.bc.ca', 'apps.gov.bc.ca',
]);
const keyOf = (method: string, url: string, range: string | undefined) => `${method} ${url}${range ? ` ${range}` : ''}`;

/** The sets, read once per test process (a set is tens of MB). */
const sets = new Map<string, { meta: RecordedMeta; entries: Record<string, Entry>; bodies: Buffer }>();
function load(set: string) {
  let s = sets.get(set);
  if (!s) {
    const dir = join('recorded', set);
    s = {
      meta: JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as RecordedMeta,
      entries: (JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { entries: Record<string, Entry> }).entries,
      bodies: readFileSync(join(dir, 'bodies.bin')),
    };
    sets.set(set, s);
  }
  return s;
}

/** Requests the set did not hold, for the test's log. */
export type Missing = string[];

export async function useRecordedWeather(context: BrowserContext, set = 'default', missing: Missing = []): Promise<RecordedMeta> {
  const { meta, entries, bodies } = load(set);
  await context.clock.setFixedTime(new Date(meta.now));
  // With no signal (context.setOffline) nothing answers, recorded or not.
  let offline = false;
  const setOffline = context.setOffline.bind(context);
  context.setOffline = async (o: boolean) => { offline = o; await setOffline(o); };
  await context.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', async (route) => {
    if (offline) return route.abort('internetdisconnected');
    const req = route.request();
    const range = await req.headerValue('range') ?? undefined;
    const hit = entries[keyOf(req.method(), req.url(), range)];
    const host = new URL(req.url()).hostname;
    if (hit) {
      const headers = { ...hit.headers, 'access-control-allow-origin': '*' };
      if (hit.offset === undefined || hit.length === undefined) return route.fulfill({ status: hit.status, headers });
      return route.fulfill({ status: hit.status, headers, body: bodies.subarray(hit.offset, hit.offset + hit.length) });
    }
    if (RECORDED_HOSTS.has(host)) {
      missing.push(keyOf(req.method(), req.url(), range));
      // The point and air APIs answer as when busy (the app then reads the
      // map files); a file server as for a file it does not have.
      const status = host.endsWith('api.open-meteo.com') ? 503 : 404;
      return route.fulfill({ status, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'Not in the recorded weather' });
    }
    return route.fallback();
  });
  return meta;
}
