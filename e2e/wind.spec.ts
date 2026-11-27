import { expect, test, type Page, upTo } from './fixtures';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

// The wind animation is the 3D streaks only (Kaden, Nov 27; docs/wishes/effects.md rules 5 and 6):
// on while the Wind layer is shown, back to the saved choice (off) after.
type Streaks = { tempestWind: { frames: number; stats(): { fps: number } } };
const fps = (page: Page) => page.evaluate(() => (window as unknown as Streaks).tempestWind.stats().fps);
const frames = (page: Page) => page.evaluate(() => (window as unknown as Streaks).tempestWind.frames);
/** True when the streaks moved at least one frame in the next `ms`. */
const moving = async (page: Page, ms = 1500) => { const a = await frames(page); await page.waitForTimeout(ms); return (await frames(page)) > a; };

test('wind: terrain fill, streaks that pause, readout, chart, cards, settings', async ({ page }) => {
  test.setTimeout(upTo(720_000, 300_000));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });

  await page.click('#layer-button');
  const menu = page.getByRole('dialog', { name: 'Condition layer' });
  await menu.getByRole('button', { name: 'Wind' }).click();
  await expect(page.locator('#layer-name')).toHaveText('Wind');
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: upTo(180_000) });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: upTo(400_000) });

  // Readout: speed, gusts, compass direction with degrees, elevation.
  await expect(page.locator('.readout-text strong')).toHaveText(/^\d+ km\/h$/);
  // The pin shows only name · value · elevation (Kaden's interface rule, Nov 21).
  await expect(page.locator('.readout-text .muted')).toHaveText(/^[\d,]+ m$/);
  await expect(page.locator('#summary-before')).toHaveText(/^Gusts to \d+ km\/h$/);
  await expect(page.locator('#legend-row')).toContainText('60+ km/h');

  // The streaks animate on the Wind layer by themselves, and stop when the app is hidden.
  // (The rate itself depends on the machine: software graphics on a shared runner is slow;
  // the phone is measured with ?fps.)
  await expect.poll(() => moving(page), { timeout: 30_000 }).toBe(true);
  console.log(`wind streaks: ${Math.round(await fps(page))} frames a second on this machine`);
  await page.screenshot({ path: 'test-results/screens/m7-wind.png' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => moving(page), { timeout: 10_000 }).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => moving(page), { timeout: 30_000 }).toBe(true);

  // The streaks get bigger as the map zooms in (Effects rule 9): faster, so longer, and a little wider.
  type Look = { pxPerKmh: number; widthPx: number };
  const look = () => page.evaluate(() => ((window as unknown as { tempestWind: { look: Look } }).tempestWind.look));
  const map = (zoom: number) => page.evaluate((z) => (window as unknown as { tempestMap: { jumpTo(o: unknown): void } }).tempestMap.jumpTo({ zoom: z }), zoom);
  const before = await look();
  await map(15);
  const closer = await look();
  expect(closer.pxPerKmh).toBeGreaterThan(before.pxPerKmh * 2);
  expect(closer.widthPx).toBeGreaterThan(before.widthPx);
  await page.screenshot({ path: 'test-results/screens/m7-wind-zoomed-in.png' });
  await map(8);
  const farther = await look();
  expect(farther.pxPerKmh).toBeLessThan(before.pxPerKmh);
  expect(farther.pxPerKmh).toBeGreaterThan(0);
  await map(11);

  // Details: headline, now, strongest gusts, direction and calm lines, hourly.
  await page.click('#sheet-handle');
  const details = page.locator('.details');
  await expect(details.locator('.card-headline')).toContainText(/\d+ km\/h/);
  await expect(details.locator('.card-headline')).toContainText(/From the (N|NE|E|SE|S|SW|W|NW), gusting \d+\./);
  await expect(details).toContainText('NOW');
  await expect(details).toContainText('STRONGEST GUSTS');
  await expect(details).toContainText('BY ELEVATION');
  await expect(details.locator('.status-main').filter({ hasText: /^Direction/ })).toHaveCount(1);
  await expect(details.locator('.status-main').filter({ hasText: /below 15 km\/h/ })).toHaveCount(1);
  await expect(details).toContainText('At the terrain, from 10 m wind and pressure levels');
  await page.screenshot({ path: 'test-results/screens/m7-wind-up.png' });

  // Settings: the calm threshold changes the calm line. The flat flow's switches are gone.
  await page.click('#layer-settings');
  const panel = page.getByRole('dialog', { name: 'Wind settings' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '25 km/h' }).click();
  await expect(panel.getByRole('switch', { name: 'Flow animation' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(details.locator('.status-main').filter({ hasText: /below 25 km\/h/ })).toHaveCount(1);

  // Leaving the Wind layer puts the animation back to the saved choice (off): the streaks stop.
  await page.click('#layer-button');
  await menu.getByRole('button', { name: 'Temperature' }).click();
  await expect(page.locator('#layer-name')).toHaveText('Temperature');
  await expect.poll(() => moving(page), { timeout: 10_000 }).toBe(false);
  await page.click('#layer-button');
  await menu.getByRole('button', { name: 'Wind' }).click();
  await expect(page.locator('#layer-name')).toHaveText('Wind');

  // The choice is remembered.
  await page.reload();
  await expect(page.locator('#layer-name')).toHaveText('Wind');
  expect(errors).toEqual([]);
});
