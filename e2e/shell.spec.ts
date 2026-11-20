import { expect, test, type Page } from './fixtures';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
const YOU = { latitude: 49.3895, longitude: -122.948 };
// Artboard safe areas (47 px status bar, 34 px home indicator).
const HOME = '/?insets=47,34';

test.use({ geolocation: YOU, permissions: ['geolocation'] });
// No live weather alerts: a real one would add the badge and change the pictures.
test.beforeEach(async ({ context }) => {
  await context.route('**/collections/weather-alerts/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 }) }));
});

type MapHandle = {
  getLayoutProperty(layer: string, prop: string): string;
  jumpTo(o: object): void;
  queryRenderedFeatures(): unknown[];
};
const onMap = <T>(page: Page, fn: (m: MapHandle, arg: string) => T, arg = '') =>
  page.evaluate(({ src, a }) => {
    const m = (window as unknown as { tempestMap: MapHandle }).tempestMap;
    return new Function('m', 'a', `return (${src})(m, a)`)(m, a) as T;
  }, { src: fn.toString(), a: arg });

async function ready(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
}

/** For tests of the shell alone: the map and run are in, the pin's forecast need not be (the point service can be slow or refuse). */
async function mapReady(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-run', 'ready', { timeout: 60_000 });
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test('home: shell sits where the v8 template puts it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HOME);
  await ready(page);

  // Top bar: 16 from the sides, 8 below the 47 px status bar, 56 tall.
  expect(await box(page, '.topbar')).toMatchObject({ x: 16, y: 55, width: 358, height: 56 });
  // Sheet: collapsed to 320 px including the 34 px bottom inset when the
  // totals fit one line each; it grows a line at a time when they stack.
  await page.addStyleTag({ content: '.summary-main span:nth-child(n+2) { display: none; } .summary-sub { white-space: nowrap !important; }' });
  await expect.poll(async () => Math.round((await box(page, '#sheet')).y), { timeout: 5_000 }).toBe(844 - 320);
  // Thumb buttons: 56 px, 16 from the right, stacked 16 above the sheet.
  await expect.poll(async () => { const l = await box(page, '#map-layers'); return Math.round(l.y + l.height); }, { timeout: 5_000 }).toBe(844 - 336);
  const layers = await box(page, '#map-layers');
  expect(layers).toMatchObject({ x: 390 - 16 - 56, width: 56, height: 56 });
  // Pin and readout describe your location with its elevation.
  await expect(page.locator('.pin-readout')).toContainText(/[\d,]+ m/);
  await expect(page.locator('.pin-readout')).not.toContainText('You');
  // The readout stays inside the screen.
  const r = await box(page, '.pin-readout');
  expect(r.x).toBeGreaterThanOrEqual(8);
  expect(r.x + r.width).toBeLessThanOrEqual(390 - 8 + 1);
  await expect(page.locator('#place-text')).toContainText(/Your location · [\d,]+ m/);
  await page.screenshot({ path: 'test-results/screens/m1-home.png' });
  expect(errors).toEqual([]);
});

test('precipitation: top bar, readout, summary and fills', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await expect(page.locator('#layer-name')).toHaveText('Precipitation');
  await expect(page.locator('#model-pill')).toHaveText('Auto');
  // How old the data is, then when the next run is due (Auto picks the best model for each time).
  await expect(page.locator('#run-age')).toHaveText(/^(new|\d+ [hd] old) · next (in \d+ (h|min)|any minute now|late ≈ \d+ h)/);
  await expect(page.locator('.pin-readout strong')).toHaveText(/^(\d+\.\d mm\/h (rain|mixed|snow)|Dry)$/);
  await expect(page.locator('#summary-before-label')).toHaveText(/^(Last \d+ h|\d+ h before|Since \w{3} \d+(:\d\d)? [AP]M)(\nobserved)?$/);
  await expect(page.locator('#summary-after-label')).toHaveText(/^(Next \d+ h|\d+ h after|Until \w{3} \d+(:\d\d)? [AP]M)$/);
  await expect(page.locator('#summary-after')).toHaveText(/(mm|cm|Dry)/);
  await expect(page.locator('.legend')).toContainText('0.1 to 6+ mm/h');
  // The app's own renderer draws the fill (M3).
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 30_000 });
  expect(await page.evaluate(() => Boolean((window as unknown as { tempestMap: { getLayer(id: string): unknown } }).tempestMap.getLayer('precip-grid')))).toBe(true);
  await page.screenshot({ path: 'test-results/screens/m2-home.png' });
});

test('one cursor: drag the chart, Now, play', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  const time = page.locator('#cursor-time');
  const before = await time.textContent();
  const c = await box(page, '#chart');
  // Dragging left moves forward in time; the data slides under the needle.
  await page.mouse.move(c.x + c.width * 0.8, c.y + 30);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.3, c.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect(time).not.toHaveText(before!);
  await expect(page.locator('#cursor-note')).toHaveText(/^in \d+ h$/);
  await page.click('#now-button');
  await expect(page.locator('#cursor-note')).toHaveText(/now|in 1 h|1 h ago/);
  const t0 = await time.textContent();
  await page.click('#play-button');
  await expect(time).not.toHaveText(t0!, { timeout: 3000 });
  await page.click('#play-button');
});

test('window control sets the chart span and the week box together', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  const wide = (await box(page, '#week-box')).width;
  await page.click('#window-button');
  await page.getByRole('dialog', { name: 'Window' }).getByRole('button', { name: '24 h' }).click();
  await expect(page.locator('#window-label')).toHaveText('24 h');
  await expect.poll(async () => Math.abs((await box(page, '#week-box')).width - wide / 2), { timeout: 5_000 }).toBeLessThan(5);
  await page.reload();
  await ready(page);
  await expect(page.locator('#window-label')).toHaveText('24 h');
});

test('the map panel links to the phone tests and back', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.click('#map-layers');
  await page.getByRole('link', { name: /Phone tests/ }).click();
  await expect(page).toHaveURL(/spike\.html$/);
  await expect(page.getByRole('button', { name: 'Run tests' })).toBeVisible();
  await page.getByRole('link', { name: /Back to the map/ }).click();
  await expect(page.locator('#layer-name')).toHaveText('Precipitation');
});

test('map panel grows from its button, switches terrain, and remembers', async ({ page }) => {
  await page.goto(HOME);
  await mapReady(page);
  await page.click('#map-layers');
  const panel = page.getByRole('dialog', { name: 'Map' });
  await expect(panel).toBeVisible();
  await expect(page.locator('.scrim')).toHaveAttribute('data-open', 'true');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m1-map-panel.png' });

  const vis = () => onMap(page, (m) => m.getLayoutProperty('hillshade', 'visibility'));
  // Ground: Plain has no shading, Shaded terrain is the hillshade.
  await panel.getByRole('button', { name: 'Plain' }).click();
  expect(await vis()).toBe('none');

  // Closes with a tap on the scrim.
  await page.mouse.click(195, 100);
  await expect(panel).toBeHidden();

  // Remembered after a reload.
  await page.reload();
  await mapReady(page);
  expect(await vis()).toBe('none');
  await page.click('#map-layers');
  await expect(page.getByRole('button', { name: 'Plain' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Shaded terrain' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
});

test('sheet pulls up under the top bar and back down', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.click('#sheet-handle');
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'up');
  // 16 below the top bar: 55 + 56 + 16 = 127 on the artboard (waits for the slide to finish).
  await expect.poll(async () => Math.round((await box(page, '#sheet')).y), { timeout: 5_000 }).toBe(127);
  await expect(page.locator('#subject-place')).toContainText('Your location');
  await page.screenshot({ path: 'test-results/screens/m1-sheet-up.png' });

  // Drag the handle down to collapse.
  const h = await box(page, '#sheet-handle');
  await page.mouse.move(h.x + h.width / 2, h.y + 10);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + 200, { steps: 8 });
  await page.mouse.move(h.x + h.width / 2, h.y + 450, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'collapsed');
});

test('sheet tucks away to its handle and comes back', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  const h = await box(page, '#sheet-handle');
  await page.mouse.move(h.x + h.width / 2, h.y + 10);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + 150, { steps: 8 });
  await page.mouse.move(h.x + h.width / 2, h.y + 320, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'tucked');
  // Only the handle shows (21 px and 8 px of room) above the 34 px bottom inset (waits for the slide to finish).
  await expect.poll(async () => Math.round((await box(page, '#sheet')).y), { timeout: 5_000 }).toBe(844 - 63);
  // Thumb buttons follow the sheet down.
  await expect.poll(async () => { const l = await box(page, '#map-layers'); return Math.round(l.y + l.height); }, { timeout: 5_000 }).toBe(844 - 63 - 16);
  await page.screenshot({ path: 'test-results/screens/m1-sheet-tucked.png' });
  await page.click('#sheet-handle');
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'collapsed');
});

test('the window row stays when the sheet is pulled up', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.click('#sheet-handle');
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'up');
  await expect(page.locator('.window-row')).toBeVisible();
});

test('North Shore has the finest map detail (zoom 15)', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  // Lonsdale Quay, North Vancouver.
  await onMap(page, (m) => m.jumpTo({ center: [-123.081, 49.31], zoom: 15.5 }));
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
  await page.waitForTimeout(1000);
  expect(await onMap(page, (m) => m.queryRenderedFeatures().length)).toBeGreaterThan(50);
  await page.screenshot({ path: 'test-results/screens/m1-north-shore-z15.png' });
});

test('a tap moves the pin; locate-me brings it back', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.mouse.click(120, 300);
  await expect(page.locator('#place-text')).not.toContainText('Your location');
  await expect(page.locator('#place-text')).toContainText(/ · [\d,]+ m/);
  await page.click('#locate');
  await expect(page.locator('#place-text')).toContainText('Your location');
});

test.describe('without location permission', () => {
  test.use({ permissions: [] });
  test('falls back to the last pin used, labelled as such', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('tempest.prefs.v1', JSON.stringify({ lastPin: { lng: -123.08, lat: 49.37, label: '' } }));
    });
    await page.goto(HOME);
    await ready(page);
    await expect(page.locator('#place-text')).toContainText('Last pin used');
    await expect(page.locator('.pin-readout')).toContainText('Last pin');
  });
});

test('zoom 14 outside the detail regions is filled by enlarging zoom 13', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  // Hope, BC: in the stored zoom-13 piece, outside the Sea to Sky detail file.
  await onMap(page, (m) => m.jumpTo({ center: [-121.442, 49.381], zoom: 14.5 }));
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
  await page.waitForTimeout(1500);
  const n = await onMap(page, (m) => m.queryRenderedFeatures().length);
  expect(n).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/screens/m1-overzoom-hope.png' });
});

test('installable: manifest, icons and service worker', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Tempest', display: 'standalone' });
  for (const icon of manifest.icons) expect((await page.request.get(`/${icon.src}`)).ok()).toBe(true);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
});

test.describe('shell pixels (map hidden)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-14T00:00:00Z')); // Fri 5 PM in BC
  });
  // Layout only: live values (place, elevation, times) are checked by the
  // tests above and can differ by a metre between machines.
  const live = (page: Page) => ({
    mask: ['#place-text', '#subject-place', '#cursor-time', '#cursor-note', '#subject-time', '#run-age', '.window-summary', '.chart-block', '.week'].map((s) => page.locator(s)),
    maxDiffPixelRatio: 0.01,
  });
  // Hide the map, and show one total per half (the weather decides how many
  // lines there are), so only layout is compared.
  const hideMap = async (page: Page) => {
    await page.addStyleTag({ content: '#map canvas, .maplibregl-marker, .maplibregl-ctrl { visibility: hidden !important; } .summary-main span:nth-child(n+2) { display: none; }' });
    await page.waitForTimeout(400);
  };

  test('collapsed', async ({ page }) => {
    await page.goto(HOME);
    await ready(page);
    await hideMap(page);
    await expect(page).toHaveScreenshot('shell-collapsed.png', live(page));
  });
  test('map panel', async ({ page }) => {
    await page.goto(HOME);
    await ready(page);
    await hideMap(page);
    await page.click('#map-layers');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('shell-map-panel.png', live(page));
  });
  test('pulled up', async ({ page }) => {
    await page.goto(HOME);
    await ready(page);
    await hideMap(page);
    await page.click('#sheet-handle');
    await page.waitForTimeout(500);
    // The pulled-up sheet scrolls, and text in a scrolling layer is smoothed a
    // little differently on each machine (about 1.4% of pixels, all along text
    // edges, seen in CI). A layout change moves far more than 3%.
    // The detail cards hold live weather, and their heights follow it (a dry
    // day's cards are shorter), so no fixed picture of them holds from one day
    // to the next. The picture covers the shell down to where the cards begin;
    // the cards' order and content are checked by details.spec.ts.
    const l = live(page);
    const firstCard = await page.locator('.details > :not(.subject)').first().boundingBox();
    const clip = { x: 0, y: 0, width: 390, height: Math.round(firstCard?.y ?? 844) };
    await expect(page).toHaveScreenshot('shell-up.png', { ...l, clip, maxDiffPixelRatio: 0.03 });
  });
});
