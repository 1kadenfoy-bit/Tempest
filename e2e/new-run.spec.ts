import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from './fixtures';
import { nextRunPossibleAt } from '../core/time/run-schedule';
import { HOME, YOU, settled, steady } from './readings';
import { recordedAnswer, useRecordedWeather } from './recorded';

// A new model run arrives while the app is open (docs/testing.md, "Sequences
// that could cause trouble"). The app looks every 10 minutes once a newer run
// could be out (core/time/run-schedule.ts). HRDPS's map files come out first
// and the point service follows minutes later, so the app sees the new run in
// two steps. At no moment may the pin's readout and chart come from one run
// while the age says another, and once the new run is in, everything (map,
// readout, chart, summaries, the age, the details' footer) must be exactly
// what an app opened on the new run shows.
//
// The recorded day holds one run per model, so the new run is made from it:
// HRDPS's next run (6 hours later) reads the recorded run's map files for the
// same hours (the recording holds only the hours from its own moment on), and
// the point service serves the recorded answers delayed by 6 hours, so the
// new run's numbers at the pin differ from the old one's. The new run's map
// pieces fail at first (a connection dropping just then): the old run's
// picture must not stay on the map under the new run's age. (The new run's
// air profiles over the view are not in the recording, so the snow line there
// reads the map files instead: the log lists them as not recorded.)
test.use({ geolocation: YOU, permissions: ['geolocation'] });

const H = 3_600_000;
const FILES = 'https://openmeteo.s3.amazonaws.com/data_spatial/cmc_gem_hrdps';
const runDir = (t: Date) => t.toISOString().replace(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d).*$/, '$1/$2/$3/$4$5Z');

/** Which runs the world serves: the map files' newest, and the point service's; whether the new run's map pieces fail. Changed by the test as it goes. */
interface World { files: boolean; api: boolean; filesFail?: boolean }

/** Serve HRDPS's next run, made from the recorded one, once `world` says it is out. */
async function newRunWorld(context: BrowserContext, set: string, r1: Date, world: World) {
  const r2 = new Date(r1.getTime() + 6 * H);
  await context.route((u) => (u.hostname === 'openmeteo.s3.amazonaws.com' && u.pathname.startsWith('/data_spatial/cmc_gem_hrdps/')) || u.hostname === 'api.open-meteo.com', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (url.hostname === 'openmeteo.s3.amazonaws.com') {
      if (!world.files) return route.fallback();
      if (url.pathname.endsWith('/latest.json')) {
        const old = JSON.parse(recordedAnswer(set, 'GET', `${FILES}/latest.json`)!.body.toString('utf8')) as { reference_time: string; valid_times: string[]; last_modified_time: string };
        return json({ ...old, reference_time: r2.toISOString().replace('.000', ''), last_modified_time: new Date(r2.getTime() + 3.2 * H).toISOString().replace('.000', ''), valid_times: old.valid_times.map((t) => new Date(Date.parse(t) + 6 * H).toISOString().replace(':00.000', '')) });
      }
      const m = /\/(\d{4}-\d\d-\d\dT\d{4})\.om$/.exec(url.pathname);
      if (m && url.pathname.includes(`/${runDir(r2)}/`)) {
        if (world.filesFail) return route.abort('failed');
        const from = `${FILES}/${runDir(r1)}/${m[1]}.om`;
        const a = recordedAnswer(set, req.method(), from, await req.headerValue('range'));
        if (!a) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'Not in the recorded weather' });
        return route.fulfill(a);
      }
      return route.fallback();
    }
    if (!world.api) return route.fallback();
    if (url.pathname === '/data/cmc_gem_hrdps/static/meta.json') {
      const old = JSON.parse(recordedAnswer(set, 'GET', req.url())!.body.toString('utf8')) as Record<string, unknown>;
      return json({ ...old, last_run_initialisation_time: r2.getTime() / 1000 });
    }
    if (url.pathname === '/v1/forecast' && url.searchParams.get('models') === 'gem_hrdps_continental') {
      const a = recordedAnswer(set, 'GET', req.url());
      if (!a) return route.fallback();
      // The same hours, each value the one from 6 hours before (the first 6 stay).
      const shift = (loc: { hourly?: Record<string, unknown[]> }) => {
        for (const [k, v] of Object.entries(loc.hourly ?? {})) if (k !== 'time') loc.hourly![k] = v.map((x, i) => (i >= 6 ? v[i - 6] : x));
        return loc;
      };
      const body = JSON.parse(a.body.toString('utf8')) as unknown;
      return json(Array.isArray(body) ? body.map(shift) : shift(body as { hourly?: Record<string, unknown[]> }));
    }
    return route.fallback();
  });
}

/** Let the page's clock run, half a minute at a time, with a moment for each answer to land. */
async function runClock(page: Page, minutes: number) {
  for (let k = 0; k < minutes * 2; k++) {
    await page.clock.runFor(30_000);
    await page.waitForTimeout(150);
  }
}

/** The map, the readout and chart, and the age all name this run (HRDPS under the cursor). */
async function oneRun(page: Page, run: Date) {
  const want = `hrdps@${run.toISOString()}`;
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-age-run', want);
  await expect(body).toHaveAttribute('data-series-run', want);
  await expect(body).toHaveAttribute('data-fill-run', want);
}

/**
 * From now on, every state the page shows is noted: a readout on screen from
 * one run while the age line names another is a mix. Read in the page itself
 * (each change, before anything is painted).
 */
async function watchMixes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { mixes: string[] };
    w.mixes = [];
    const check = () => {
      const b = document.body.dataset;
      const showing = document.querySelector('.pin-readout')?.getAttribute('data-loading') === 'false';
      if (showing && b.seriesRun && b.ageRun && b.seriesRun !== b.ageRun) w.mixes.push(`readout ${b.seriesRun}, age ${b.ageRun}: ${document.querySelector('.pin-readout')?.textContent}`);
    };
    new MutationObserver(check).observe(document.body, { attributes: true, subtree: true, characterData: true, childList: true });
  });
}

/** What an app opened on this world at this moment shows, with the details open. */
async function freshApp(browser: Browser, set: string, r1: Date, world: World, at: number) {
  const ctx = await browser.newContext({
    timezoneId: 'America/Vancouver', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: YOU, permissions: ['geolocation'],
  });
  try {
    await useRecordedWeather(ctx, set);
    await newRunWorld(ctx, set, r1, { ...world });
    await ctx.clock.install({ time: new Date(at) });
    const page = await ctx.newPage();
    await page.goto(HOME);
    await settled(page);
    await page.click('#sheet-handle');
    await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
    return { readings: await steady(page), footer: await page.locator('.details-footer').textContent() };
  } finally {
    await ctx.close();
  }
}

test('a new run arriving while the app is open never mixes two runs, and the age follows', async ({ page, context, browser, weather }) => {
  test.skip(weather === 'live', 'builds the new run from the recorded one');
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const meta = JSON.parse(readFileSync(`recorded/${weather}/meta.json`, 'utf8')) as { now: string };
  const r1 = new Date((JSON.parse(recordedAnswer(weather, 'GET', `${FILES}/latest.json`)!.body.toString('utf8')) as { reference_time: string }).reference_time);
  const r2 = new Date(r1.getTime() + 6 * H);
  const world: World = { files: false, api: false };
  await newRunWorld(context, weather, r1, world);
  await context.clock.install({ time: new Date(meta.now) });
  await page.goto(HOME);
  await settled(page);
  await oneRun(page, r1);

  // The clock moves on to just after HRDPS's next run could be out: the app looks, and there is none yet.
  const due = nextRunPossibleAt('cmc_gem_hrdps', r1)!.getTime() + 60_000;
  await page.clock.fastForward(due - (await page.evaluate(() => Date.now())));
  await runClock(page, 1);
  await page.click('#now-button');
  await settled(page);
  const before = await steady(page);
  const ageNow = async (run: Date) => `${Math.floor(((await page.evaluate(() => Date.now())) - run.getTime()) / H)} h old`;
  expect(before.age).toBe(await ageNow(r1));
  await oneRun(page, r1);

  // HRDPS's new map files come out; the point service still serves the old run.
  // The map and the pin must stay together on the old run: nothing changes.
  await page.click('#sheet-handle');
  await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
  await expect(page.locator('.details-footer')).toContainText(`${r1.toISOString().slice(11, 13)}Z run`);
  const withDetails = await steady(page);
  await watchMixes(page);
  world.files = true;
  await runClock(page, 10);
  await settled(page);
  expect(await steady(page), 'new map files alone change nothing').toEqual(withDetails);
  await oneRun(page, r1);

  // Then the point service serves the new run too: within the next look,
  // everything moves to it together, the age and the details' footer too.
  // The new run's map pieces fail at first: the old run's picture goes, and the chart says so.
  world.api = true;
  world.filesFail = true;
  const body = page.locator('body');
  for (let k = 0; k < 24 && (await body.getAttribute('data-age-run')) !== `hrdps@${r2.toISOString()}`; k++) await runClock(page, 0.5);
  await expect(body).toHaveAttribute('data-age-run', `hrdps@${r2.toISOString()}`);
  await expect(page.locator('#chart-status')).toHaveText(/^Precipitation on the map did not load/);
  await expect(body, 'the old run’s picture under the new run’s age').not.toHaveAttribute('data-fill-run', /./);
  await page.screenshot({ path: 'test-results/screens/new-run-map-failed.png' });
  // The pieces answer again: the next try fills the map with the new run.
  world.filesFail = false;
  await runClock(page, 2);
  try {
    await settled(page);
    await oneRun(page, r2);
  } finally {
    await page.screenshot({ path: 'test-results/screens/new-run-after.png' });
  }
  const after = await steady(page);
  expect(after.age).toBe(await ageNow(r2));
  expect(after, 'the new run’s numbers differ from the old one’s').not.toEqual(withDetails);
  const fresh = await freshApp(browser, weather, r1, world, await page.evaluate(() => Date.now()));
  expect(after, 'exactly what an app opened on the new run shows').toEqual(fresh.readings);
  await expect(page.locator('.details-footer')).toHaveText(fresh.footer ?? '');
  await expect(page.locator('.details-footer')).toContainText(`${r2.toISOString().slice(11, 13)}Z run, ${after.age}`);
  expect(await page.evaluate(() => (window as unknown as { mixes: string[] }).mixes), 'a readout from one run with the age of another').toEqual([]);
  expect(errors).toEqual([]);
});
