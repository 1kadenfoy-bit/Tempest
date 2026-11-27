// Recorded weather for the Performance runs: the same answers as the browser
// tests (e2e/recorded.ts, recorded/<set>/), with one difference. The tests
// freeze the clock with Playwright's clock, which also freezes the page's
// stopwatch (performance.now) and empties its timing lists, so load times
// read wrong. Here only the date is frozen (as the dev server's recorded mode
// does, app/data/recorded.ts); the stopwatch runs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NEVER_LIVE = new Set(['api.open-meteo.com', 'air-quality-api.open-meteo.com']);
const keyOf = (method, url, range) => `${method} ${url}${range ? ` ${range}` : ''}`;

export async function useRecordedWeather(context, set = 'default') {
  const dir = join('recorded', set);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const { entries } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const bodies = readFileSync(join(dir, 'bodies.bin'));
  await context.addInitScript((fixed) => {
    const Real = Date;
    class Frozen extends Real {
      constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
      static now() { return fixed; }
    }
    globalThis.Date = Frozen;
  }, new Date(meta.now).getTime());
  await context.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', async (route) => {
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
