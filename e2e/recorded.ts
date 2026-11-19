// Recorded weather for the browser tests: the same sets the dev server replays
// (app/data/recorded.ts, recorded/<set>/, made by tools/record-weather.mjs).
// Every request to the weather and safety servers is answered from the set
// when it holds the answer; the Open-Meteo point and air APIs answer "not
// recorded" otherwise (the app then reads the recorded run's map files), and
// anything else goes to the network. The clock is frozen at the recording.
//
// Tests get it through e2e/fixtures.ts. WEATHER=live npm run screenshots runs
// them on live data instead; WEATHER=<set> picks another set.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';

interface Entry { status: number; headers: Record<string, string>; offset?: number; length?: number }
export interface RecordedMeta { name: string; now: string; spots: { name: string; lat: number; lng: number }[] }

const NEVER_LIVE = new Set(['api.open-meteo.com', 'air-quality-api.open-meteo.com']);
const keyOf = (method: string, url: string, range: string | undefined) => `${method} ${url}${range ? ` ${range}` : ''}`;

export async function useRecordedWeather(context: BrowserContext, set = 'default'): Promise<RecordedMeta> {
  const dir = join('recorded', set);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as RecordedMeta;
  const { entries } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { entries: Record<string, Entry> };
  const bodies = readFileSync(join(dir, 'bodies.bin'));
  await context.clock.setFixedTime(new Date(meta.now));
  // With no signal (context.setOffline) nothing answers, recorded or not.
  let offline = false;
  const setOffline = context.setOffline.bind(context);
  context.setOffline = async (o: boolean) => { offline = o; await setOffline(o); };
  await context.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', async (route) => {
    if (offline) return route.abort('internetdisconnected');
    const req = route.request();
    const hit = entries[keyOf(req.method(), req.url(), await req.headerValue('range') ?? undefined)];
    const host = new URL(req.url()).hostname;
    if (hit) {
      const headers = { ...hit.headers, 'access-control-allow-origin': '*' };
      if (hit.offset === undefined || hit.length === undefined) return route.fulfill({ status: hit.status, headers });
      return route.fulfill({ status: hit.status, headers, body: bodies.subarray(hit.offset, hit.offset + hit.length) });
    }
    if (NEVER_LIVE.has(host)) {
      return route.fulfill({ status: 503, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'Not in the recorded weather' });
    }
    return route.fallback();
  });
  return meta;
}
