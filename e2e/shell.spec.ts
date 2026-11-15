import { expect, test, type Page } from '@playwright/test';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
const YOU = { latitude: 49.3895, longitude: -122.948 };
// Artboard safe areas (47 px status bar, 34 px home indicator).
const HOME = '/?insets=47,34';

test.use({ geolocation: YOU, permissions: ['geolocation'] });

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
  // Sheet: collapsed to 320 px including the 34 px bottom inset.
  expect((await box(page, '#sheet')).y).toBeCloseTo(844 - 320, 0);
  // Thumb buttons: 56 px, 16 from the right, stacked 16 above the sheet.
  const layers = await box(page, '#map-layers');
  expect(layers).toMatchObject({ x: 390 - 16 - 56, width: 56, height: 56 });
  expect(layers.y + layers.height).toBeCloseTo(844 - 336, 0);
  // Pin and readout describe your location with its elevation.
  await expect(page.locator('.pin-readout')).toContainText(/You · [\d,]+ m/);
  await expect(page.locator('#place-text')).toContainText(/Your location · [\d,]+ m/);
  await page.screenshot({ path: 'test-results/screens/m1-home.png' });
  expect(errors).toEqual([]);
});

test('map panel grows from its button, switches terrain, and remembers', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.click('#map-layers');
  const panel = page.getByRole('dialog', { name: 'Map' });
  await expect(panel).toBeVisible();
  await expect(page.locator('.scrim')).toHaveAttribute('data-open', 'true');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m1-map-panel.png' });

  const vis = () => onMap(page, (m) => m.getLayoutProperty('hillshade', 'visibility'));
  await panel.getByRole('button', { name: 'Hillshade' }).click();
  expect(await vis()).toBe('none');

  // Closes with a tap on the scrim.
  await page.mouse.click(195, 100);
  await expect(panel).toBeHidden();

  // Remembered after a reload.
  await page.reload();
  await ready(page);
  expect(await vis()).toBe('none');
  await page.click('#map-layers');
  await expect(page.getByRole('button', { name: 'Hillshade' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Hillshade' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
});

test('sheet pulls up under the top bar and back down', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.click('#sheet-handle');
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'up');
  await page.waitForTimeout(400);
  // 16 below the top bar: 55 + 56 + 16 = 127 on the artboard.
  expect((await box(page, '#sheet')).y).toBeCloseTo(127, 0);
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
  await page.waitForTimeout(400);
  // Only the handle shows: 28 px plus the 34 px bottom inset.
  expect((await box(page, '#sheet')).y).toBeCloseTo(844 - 62, 0);
  // Thumb buttons follow the sheet down.
  const layers = await box(page, '#map-layers');
  expect(layers.y + layers.height).toBeCloseTo(844 - 62 - 16, 0);
  await page.screenshot({ path: 'test-results/screens/m1-sheet-tucked.png' });
  await page.click('#sheet-handle');
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'collapsed');
});

test('the window row stays when the sheet is pulled up', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.click('#sheet-handle');
  await expect(page.locator('#sheet')).toHaveAttribute('data-state', 'up');
  await expect(page.locator('.slot-window')).toBeVisible();
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
  const live = (page: Page) => ({ mask: ['#place-text', '#subject-place', '#cursor-time', '#cursor-note', '#subject-time'].map((s) => page.locator(s)), maxDiffPixelRatio: 0.01 });
  const hideMap = (page: Page) =>
    page.addStyleTag({ content: '#map canvas, .maplibregl-marker, .maplibregl-ctrl { visibility: hidden !important; }' });

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
    await expect(page).toHaveScreenshot('shell-up.png', { ...live(page), maxDiffPixelRatio: 0.03 });
  });
});
