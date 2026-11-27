import { expect, reportDir, test, type BrowserContext, type Page, type Request } from './fixtures';
import { readFileSync } from 'node:fs';

// How much the app asks the weather and safety servers (Data rule 1,
// docs/wishes/data.md). Their free limits are shared by the app, the tests and
// every chat, so a change that asks too much fails here, before it merges.
// Runs early on every branch (tools/test-plan.mjs).
//
// A normal session on recorded weather: open, every layer, the pin moved a
// few times, the time dragged, the forecast summary, then an hour left open
// and untouched (the page's clock fast-forwarded). The recorded day holds the
// point forecast at your location only, so elsewhere the point service
// refuses, as it does when its free limit is spent: the refused case is part
// of the session on purpose (seen Nov 27, a dropped pin asked every minute).
// The budgets and what they were before are in docs/testing.md.

const YOU = { latitude: 49.3895, longitude: -122.948 };
test.use({ geolocation: YOU, permissions: ['geolocation'] });

/**
 * A pin's forecast (one place) is answered at your location only, and
 * refused (busy) anywhere else, whatever the recorded set holds: a newer set
 * that also holds the dropped pins' forecasts (other tests drop pins at the
 * same places) must not quietly take the refused case out of this session.
 * The view's grids (many places at once) are answered from the set as usual.
 */
async function pointServiceAtYourLocationOnly(context: BrowserContext) {
  await context.route('https://api.open-meteo.com/v1/**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    const lat = q.get('latitude') ?? '';
    const lng = q.get('longitude') ?? '';
    const here = Math.abs(Number(lat) - YOU.latitude) < 0.001 && Math.abs(Number(lng) - YOU.longitude) < 0.001;
    if (lat.includes(',') || here) return route.fallback();
    return route.fulfill({ status: 503, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'Busy (this test: the point service answers at your location only)' });
  });
}
const HOME = '/?insets=47,34';

/** The servers, in plain names. */
function serverOf(url: string): string {
  const u = new URL(url);
  const h = u.hostname;
  if (h === 'api.open-meteo.com') return u.pathname.endsWith('/meta.json') ? 'Open-Meteo point API (run check)' : 'Open-Meteo point API';
  if (h === 'air-quality-api.open-meteo.com') return 'Open-Meteo air API';
  if (h === 'openmeteo.s3.amazonaws.com') return u.pathname.endsWith('/latest.json') ? 'Open-Meteo map files (run check)' : 'Open-Meteo map files';
  if (h.endsWith('weather.gc.ca')) return 'ECCC';
  if (h.endsWith('avalanche.ca')) return 'Avalanche Canada';
  if (h.endsWith('gov.bc.ca')) return 'BC';
  return '';
}

/**
 * The most each server may be asked in the session (measured Nov 27 before
 * and after Data rule 1's round: docs/testing.md). About a quarter of room
 * above what it asks now; far below what it asked before.
 */
const BUDGET: Record<string, number> = {
  'Open-Meteo point API': 45,
  'Open-Meteo point API (run check)': 2,
  'Open-Meteo air API': 5,
  'Open-Meteo map files': 2800,
  'Open-Meteo map files (run check)': 6,
  ECCC: 260,
  'Avalanche Canada': 5,
  BC: 4,
};

interface Asked { phase: string; server: string; key: string; status: number }

class Counter {
  all: Asked[] = [];
  phase = 'open';
  async add(r: Request) {
    const server = serverOf(r.url());
    if (!server) return;
    const range = (await r.headerValue('range').catch(() => null)) ?? '';
    const entry: Asked = { phase: this.phase, server, key: `${r.method()} ${r.url()}${range ? ` ${range}` : ''}`, status: 0 };
    this.all.push(entry);
    entry.status = (await r.response().catch(() => null))?.status() ?? 0;
  }
  count(server: string, phase?: string) { return this.all.filter((x) => x.server === server && (!phase || x.phase === phase)).length; }
  table() {
    const phases = [...new Set(this.all.map((x) => x.phase))];
    const servers = [...new Set([...Object.keys(BUDGET), ...this.all.map((x) => x.server)])];
    const rows = servers.map((s) => [s, ...phases.map((p) => this.count(s, p)), this.count(s), BUDGET[s] ?? '–']);
    return [['server', ...phases, 'total', 'budget'], ...rows].map((r) => r.join('\t')).join('\n');
  }
  /** Requests answered (or refused), then asked again in the same words: [request, times]. */
  repeats(answered: boolean) {
    const n = new Map<string, number>();
    for (const x of this.all) if (answered === (x.status >= 200 && x.status < 400)) n.set(x.key, (n.get(x.key) ?? 0) + 1);
    return [...n].filter(([, k]) => k > 1).sort((a, b) => b[1] - a[1]);
  }
}

/** No request to any server for 3 s (at most a minute). */
async function calm(page: Page, c: Counter) {
  const until = Date.now() + 60_000;
  let seen = c.all.length;
  let since = Date.now();
  while (Date.now() < until) {
    await page.waitForTimeout(500);
    if (c.all.length !== seen) { seen = c.all.length; since = Date.now(); }
    else if (Date.now() - since > 3000) return;
  }
}

async function pick(page: Page, name: string) {
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).last().click();
  await expect(page.locator('#layer-name')).toHaveText(name);
}

/** Let the page's clock run, half a minute at a time, with a moment for each answer to land. */
async function runClock(page: Page, minutes: number, c: Counter, phase: (minute: number) => string) {
  for (let k = 0; k < minutes * 2; k++) {
    c.phase = phase(k / 2);
    await page.clock.runFor(30_000);
    await page.waitForTimeout(150);
  }
}

test('a normal session, then an hour untouched, stays within each server’s budget', async ({ page, context, weather }, info) => {
  test.skip(weather === 'live', 'counts requests on recorded weather');
  test.setTimeout(300_000);
  const c = new Counter();
  context.on('request', (r) => void c.add(r));
  await pointServiceAtYourLocationOnly(context);
  // A clock that can be fast-forwarded, from the recording's moment.
  const meta = JSON.parse(readFileSync(`recorded/${weather}/meta.json`, 'utf8')) as { now: string };
  await context.clock.install({ time: new Date(meta.now) });
  await page.goto(HOME);
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  await calm(page, c);

  c.phase = 'layers';
  for (const name of ['Temperature', 'Wind', 'Radar', 'Avalanche', 'Air quality', 'Precipitation']) { await pick(page, name); await calm(page, c); }

  c.phase = 'pin';
  for (const [x, y] of [[250, 330], [120, 300], [300, 420]] as const) { await page.mouse.click(x, y); await calm(page, c); }
  await page.click('#locate');
  await calm(page, c);

  c.phase = 'time';
  const ch = (await page.locator('#chart').boundingBox())!;
  await page.mouse.move(ch.x + ch.width * 0.8, ch.y + 30);
  await page.mouse.down();
  await page.mouse.move(ch.x + ch.width * 0.2, ch.y + 30, { steps: 10 });
  await page.mouse.up();
  await calm(page, c);
  await page.click('#now-button');
  await calm(page, c);

  // Press-and-hold: the summary, with the pin moved where the recording has
  // no point forecast (the service refuses there).
  c.phase = 'summary';
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Forecast summary' })).toBeVisible();
  await calm(page, c);
  await page.keyboard.press('Escape');
  await calm(page, c);
  // Temperature at that pin: nothing can come while the service refuses (Nov 27).
  await pick(page, 'Temperature');
  await calm(page, c);

  // An hour untouched. No model's next run can be there yet (the recording's
  // runs: HRDPS, RDPS and ECMWF 18Z, GDPS 12Z, at 00:11 UTC).
  await runClock(page, 60, c, (m) => (m < 10 ? 'hour: first 10 min' : 'hour: the other 50'));
  await calm(page, c);
  // The refused forecast was asked again a few times, then no more, and the app says so.
  await expect(page.locator('#chart-status')).toHaveText(/not answering/);
  // No spinning wheel at the pin once nothing more is asked.
  await expect(page.locator('.pin-readout')).toHaveAttribute('data-loading', 'false');
  await page.screenshot({ path: `${reportDir('requests')}/stopped-asking.png` });

  // Two hours later HRDPS's next run could be there (from 03:00 UTC): the app
  // looks for it within 10 minutes, as before, and not yet for RDPS's (03:30).
  // Labelled first: the jump itself starts the look (the 10-minute check fires on it).
  c.phase = 'a run due';
  await page.clock.fastForward('02:00:00');
  await runClock(page, 10, c, () => 'a run due');
  await calm(page, c);

  const answered = c.repeats(true);
  const refused = c.repeats(false);
  const extra = (r: [string, number][]) => r.reduce((s, [, n]) => s + n - 1, 0);
  const show = (r: [string, number][]) => r.slice(0, 12).map(([k, n]) => `  ${n}×  ${k.slice(0, 180)}`).join('\n');
  const report = `${c.table()}\n\nAnswered, then asked again: ${answered.length} requests, ${extra(answered)} extra\n${show(answered)}\n\nRefused (or not recorded), then asked again: ${refused.length} requests, ${extra(refused)} extra\n${show(refused)}`;
  console.log(report);
  await info.attach('requests', { body: report, contentType: 'text/plain' });

  // The budgets for the session.
  for (const [server, max] of Object.entries(BUDGET)) {
    const n = c.all.filter((x) => x.server === server && x.phase !== 'a run due').length;
    expect(n, `${server}: asked ${n} times in the session (budget ${max})`).toBeLessThanOrEqual(max);
  }
  // Untouched after the first minutes: nothing is asked at all.
  const late = c.all.filter((x) => x.phase === 'hour: the other 50');
  expect(late.map((x) => x.key.slice(0, 160)), 'asked while untouched, 10 to 60 minutes in').toEqual([]);
  // What was answered is kept, not asked again (a few file sizes read twice while two reads overlap).
  expect(extra(answered), 'answered requests asked again').toBeLessThanOrEqual(20);
  // A new run is still looked for as soon as one could be there.
  const due = c.all.filter((x) => x.phase === 'a run due').map((x) => x.key);
  expect(due.some((k) => k.includes('/cmc_gem_hrdps/latest.json')), 'HRDPS’s next run looked for once it could be there').toBe(true);
  expect(due.some((k) => k.includes('/cmc_gem_rdps_10km/latest.json')), 'RDPS asked before its next run could be there').toBe(false);
});
