import { expect, test, type Browser, type BrowserContext, type Page, type Route } from './fixtures';
import { HOME, YOU, settled, steady } from './readings';
import { RECORDED_HOSTS, useRecordedWeather } from './recorded';

// The signal drops while the app is loading, then comes back (docs/testing.md,
// "Sequences that could cause trouble"). In the mountains this is the normal
// case: the app opens in the car park, the signal goes at the first bend. The
// app must end showing exactly what an uninterrupted load shows, with its age,
// and while the signal is gone say what it could not get, never show a blank
// map or a forecast that never comes without saying so.
//
// The drop is made exact: the weather servers' answers and the terrain pieces
// are held at the door until the test cuts the connection, then refused as
// with no signal, so the drop always lands mid-load on any machine.
test.use({ geolocation: YOU, permissions: ['geolocation'] });

/** What an uninterrupted load shows, from a fresh phone (its own storage) on the same recorded weather. */
async function uninterrupted(browser: Browser) {
  const ctx = await browser.newContext({
    timezoneId: 'America/Vancouver', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: YOU, permissions: ['geolocation'],
  });
  try {
    await useRecordedWeather(ctx);
    const page = await ctx.newPage();
    await page.goto(HOME);
    await settled(page);
    return await steady(page);
  } finally {
    await ctx.close();
  }
}

/**
 * Hold the answers whose address passes `hold`, until `drop()`: the
 * connection goes, and every held request fails as with no signal.
 * `restore()` brings the signal back; requests then go through.
 */
async function door(context: BrowserContext, hold: (url: URL) => boolean) {
  const held: Route[] = [];
  // Holding until the drop; after it, requests fail as with no signal (e2e/recorded.ts), then go through.
  let holding = true;
  // The weather servers and the terrain pieces (the pin's height, the map's relief), as a real drop cuts them all.
  await context.route((url) => RECORDED_HOSTS.has(url.hostname) || url.hostname === 'tiles.mapterhorn.com', async (route) => {
    if (!holding || !hold(new URL(route.request().url()))) return route.fallback();
    held.push(route);
  });
  return {
    held: () => held.length,
    drop: async () => {
      holding = false;
      await context.setOffline(true);
      for (const r of held.splice(0)) await r.abort('internetdisconnected').catch(() => undefined);
    },
    restore: async () => {
      await context.setOffline(false);
    },
  };
}

/** The app is back to what an uninterrupted load shows: run, map, pin's forecast, with its age. */
async function recovered(page: Page, expected: Awaited<ReturnType<typeof uninterrupted>>, shot: string) {
  // Within a minute of the signal coming back, without a tap: the first retries come within seconds.
  try {
    await expect(page.locator('body')).toHaveAttribute('data-run', 'ready', { timeout: 60_000 });
    await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 60_000 });
    await settled(page);
  } finally {
    await page.screenshot({ path: `test-results/screens/${shot}.png` });
  }
  const now = await steady(page);
  expect(now).toEqual(expected);
  // The age, and a next update again (no "offline" once the signal is back).
  await expect(page.locator('#run-age')).toHaveText(/^\d+ h old · next /);
  await expect(page.locator('#chart-status')).toHaveText('');
}

test('the signal drops before the runs are known, then comes back', async ({ page, context, browser }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const expected = await uninterrupted(browser);

  // Every weather answer held: the app is still finding out which runs exist.
  const d = await door(context, () => true);
  await page.goto(HOME);
  await expect.poll(d.held, { timeout: 60_000 }).toBeGreaterThan(0);
  await d.drop();
  // It says what it could not get, and why.
  await expect(page.locator('#run-age')).toHaveText('Weather unavailable · tap to retry', { timeout: 60_000 });
  await expect(page.locator('#chart-status')).toHaveText(/^No signal · /);
  await page.screenshot({ path: 'test-results/screens/signal-runs-offline.png' });

  await d.restore();
  await recovered(page, expected, 'signal-runs-back');
  expect(errors).toEqual([]);
});

test('the signal drops while the map and the pin’s forecast load, then comes back', async ({ page, context, browser }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const expected = await uninterrupted(browser);

  // The run lists answer; the weather itself (map files, the pin's forecast) is held.
  const lists = (u: URL) => u.pathname.endsWith('/latest.json') || u.pathname.endsWith('/meta.json');
  const d = await door(context, (u) => !lists(u));
  await page.goto(HOME);
  await expect(page.locator('body')).toHaveAttribute('data-run', 'ready', { timeout: 60_000 });
  await expect.poll(d.held, { timeout: 60_000 }).toBeGreaterThan(0);
  await d.drop();
  // The age stays, marked offline; the sheet says what did not come, and why (not "Loading…" for ever).
  await expect(page.locator('#run-age')).toHaveText(/^\d+ h old · offline/, { timeout: 30_000 });
  await expect(page.locator('#chart-status')).toHaveText(/^No signal · /, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/screens/signal-load-offline.png' });

  await d.restore();
  await recovered(page, expected, 'signal-load-back');
  expect(errors).toEqual([]);
});
