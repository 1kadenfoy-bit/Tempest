import { expect, test, type Page } from '@playwright/test';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

const fps = (page: Page) => page.evaluate(() => (window as unknown as { tempestFlow: { fps(): number } }).tempestFlow.fps());
const frames = (page: Page) => page.evaluate(() => (window as unknown as { tempestFlow: { frameTimes: number[] } }).tempestFlow.frameTimes.at(-1) ?? 0);

test('wind: terrain fill, flow that pauses, readout, chart, cards, settings', async ({ page }) => {
  test.setTimeout(720_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });

  await page.click('#layer-button');
  const menu = page.getByRole('dialog', { name: 'Condition layer' });
  await menu.getByRole('button', { name: 'Wind' }).click();
  await expect(page.locator('#layer-name')).toHaveText('Wind');
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 180_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 400_000 });

  // Readout: speed, gusts, compass direction with degrees, elevation.
  await expect(page.locator('.readout-text strong')).toHaveText(/^\d+ km\/h$/);
  await expect(page.locator('.readout-text .muted')).toContainText(/^gusts \d+ · (N|NE|E|SE|S|SW|W|NW) \d+° · You · [\d,]+ m/);
  await expect(page.locator('#summary-before')).toHaveText(/^Gusts to \d+ km\/h$/);
  await expect(page.locator('#legend-row')).toContainText('60+ km/h');

  // The flow animates, and stops when the app is hidden.
  // Frames keep coming (the rate itself depends on the machine: software
  // graphics on a busy shared runner managed 6 a second; the phone is measured with ?fps).
  const first = await frames(page);
  await expect.poll(() => frames(page), { timeout: 20_000 }).toBeGreaterThan(first);
  await expect.poll(() => fps(page), { timeout: 20_000 }).toBeGreaterThan(0);
  console.log(`wind flow: ${Math.round(await fps(page))} frames a second on this machine`);
  await page.screenshot({ path: 'test-results/screens/m7-wind.png' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const stoppedAt = await frames(page);
  await page.waitForTimeout(600);
  expect(await frames(page)).toBe(stoppedAt);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => frames(page), { timeout: 30_000 }).toBeGreaterThan(stoppedAt);

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

  // Settings: the calm threshold changes the calm line; turning the flow off stops it.
  await page.click('#layer-settings');
  const panel = page.getByRole('dialog', { name: 'Wind settings' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '25 km/h' }).click();
  await panel.getByRole('switch', { name: 'Flow animation' }).click();
  await page.keyboard.press('Escape');
  await expect(details.locator('.status-main').filter({ hasText: /below 25 km\/h/ })).toHaveCount(1);
  const offAt = await frames(page);
  await page.waitForTimeout(600);
  expect(await frames(page)).toBe(offAt);

  // The choice is remembered.
  await page.reload();
  await expect(page.locator('#layer-name')).toHaveText('Wind');
  expect(errors).toEqual([]);
});
