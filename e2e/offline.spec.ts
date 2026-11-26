import { expect, test, type Page } from './fixtures';

// M8 done-test: save a touring area at home with all three layers, then with
// no signal all three work there, with the same numbers, through the same
// read path. The 3-day window reaches past HRDPS's end into RDPS.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

const pickLayer = async (page: Page, name: string) => {
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).last().click();
  await expect(page.locator('#layer-name')).toHaveText(name);
};

test('a saved area works with no signal, for every layer, past HRDPS', async ({ page, context }) => {
  test.setTimeout(900_000);
  // Observed precipitation is online only (ECCC asks that it not be bulk-copied),
  // so this compares forecast with forecast.
  await context.route('**/geo.weather.gc.ca/**', (r) => r.abort());
  // A 12-hour window, so the compared hours stay inside the saved run (the
  // two days before it come from earlier runs online and are not saved).
  await page.goto('/?insets=47,34');
  await page.evaluate(() => localStorage.setItem('tempest.prefs.v1', JSON.stringify({ windowHours: 12 })));
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2000);

  // Save for offline (the card, Kaden Nov 22): trace the area, tick all three
  // layers, and stretch the time frame to its end so it reaches past HRDPS.
  await page.click('#settings-button');
  await page.locator('#save-data').click();
  const card = page.locator('.ofl-card');
  await expect(card).toBeVisible();
  const pts: [number, number][] = [[120, 300], [200, 260], [280, 300], [300, 380], [240, 440], [160, 430], [110, 370], [118, 305]];
  await page.mouse.move(...pts[0]!);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ofl-summary')).toContainText(/Area .* km²/);
  await page.locator('.ofl-handle').click();
  await expect(card).toHaveAttribute('data-state', 'up');
  for (const name of ['Temperature', 'Wind']) await page.locator('.ofl-row', { hasText: name }).locator('.ofl-tick').click();
  const end = (await page.locator('.ofl-frame [data-part="to"]').boundingBox())!;
  const axis = (await page.locator('.ofl-axis').boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(axis.x + axis.width - 1, end.y + end.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ofl-go')).toContainText(/Save data · [\d.]+ [kM]B/, { timeout: 60_000 });
  await page.screenshot({ path: 'test-results/screens/m8-save-card.png' });
  const started = Date.now();
  await page.locator('.ofl-go').click();
  await expect(card).toBeHidden();
  // The Notification Centre says when it is done.
  await page.click('#alert-badge');
  const centre = page.getByRole('dialog', { name: 'Notification Centre' });
  await expect(centre.locator('.notice-words', { hasText: 'Saved for offline' })).toBeVisible({ timeout: 720_000 });
  console.log(`saved in ${Math.round((Date.now() - started) / 1000)} s`);
  await page.keyboard.press('Escape');
  await expect(centre).toBeHidden();

  // Move the cursor 6 hours ahead (drag the chart left by half its width), so
  // the half before the needle starts at now, inside the run.
  const drag = async (fraction: number) => {
    const c = (await page.locator('#chart').boundingBox())!;
    await page.mouse.move(c.x + c.width * (0.5 + fraction / 2), c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * (0.5 - fraction / 2), c.y + c.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
  };
  const read = async () => ({
    // The data's age only: the rest says "next …" online and "offline" without signal (Kaden's interface rule 7a, Nov 20).
    run: (await page.textContent('#run-age'))?.split(' · ')[0],
    // The weather only: the pin's place name comes from the nearest map label, which differs between the
    // live base map and the saved pieces, and can be missing (Kaden's interface rule 9 put the name first, Nov 20).
    readout: await page.locator('.pin-readout .readout-text').evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement;
      c.querySelector('.pin-name')?.remove();
      return c.textContent?.replace(/^\s*·\s*/, '');
    }),
    before: await page.textContent('#summary-before'),
    after: await page.textContent('#summary-after'),
  });
  await drag(0.5);
  await expect(page.locator('#cursor-note')).toHaveText(/in [5-7] h/);
  // The save used the service's per-minute allowance: the pin's profile (snow line) may come a minute later.
  await expect(page.locator('.pin-readout')).toContainText('snow line', { timeout: 120_000 });
  const online = await read();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'saved', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  await drag(0.5);
  await expect(page.locator('#cursor-note')).toHaveText(/in [5-7] h/);
  const offline = await read();
  console.log('online :', JSON.stringify(online));
  console.log('offline:', JSON.stringify(offline));
  expect(offline).toEqual(online);
  await page.screenshot({ path: 'test-results/screens/m8-offline-precip.png' });

  // Temperature and wind, offline: a fill, a readout and a chart.
  for (const [name, value] of [['Temperature', /^(−)?\d+ °C$/], ['Wind', /^\d+ km\/h$/]] as const) {
    await page.evaluate(() => { delete document.body.dataset.fill; });
    await pickLayer(page, name);
    await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 60_000 });
    await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 60_000 });
    await expect(page.locator('.readout-text strong')).toHaveText(value, { timeout: 30_000 });
    await page.screenshot({ path: `test-results/screens/m8-offline-${name.toLowerCase()}.png` });
  }

  // Past HRDPS's end, offline: RDPS's saved hours (the cursor goes there and reads).
  // With Auto the button does not name the model; the page marks the one under the cursor.
  const inView = () => page.locator('body').getAttribute('data-model-in-view');
  for (let k = 0; k < 8 && (await inView()) !== 'rdps'; k++) await drag(0.9);
  await expect(page.locator('body')).toHaveAttribute('data-model-in-view', 'rdps');
  await expect(page.locator('.readout-text strong')).toHaveText(/^\d+ km\/h$/);
  await page.screenshot({ path: 'test-results/screens/m8-offline-rdps.png' });
  await context.setOffline(false);
});
