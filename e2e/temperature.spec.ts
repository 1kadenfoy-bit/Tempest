import { expect, test } from '@playwright/test';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

test('temperature: layer menu, terrain fill, readout, summary, week values', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });

  // The menu grows from the layer name and lists only built layers.
  await page.click('#layer-button');
  const menu = page.getByRole('dialog', { name: 'Condition layer' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('.layer-tile')).toHaveText(['Precipitation', 'Temperature']);
  await expect(menu.getByRole('button', { name: 'Precipitation' })).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: 'Temperature' }).click();

  await expect(page.locator('#layer-name')).toHaveText('Temperature');
  // Without the point API (its daily limit is shared on test machines) the
  // map files answer, hour by hour: slower, same numbers.
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 180_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 360_000 });
  await expect(page.locator('.readout-text strong')).toHaveText(/^(−)?\d+ °C$/);
  await expect(page.locator('.readout-text .muted')).toContainText(/feels (−)?\d+ · You · [\d,]+ m/);
  await expect(page.locator('#summary-before')).toHaveText(/^High [+−]?\d+° · Low [+−]?\d+°$/);
  await expect(page.locator('#legend-row')).toContainText('20 °C');
  // Daily high and low under at least one day the model covers.
  await expect(page.locator('.week-day-extra').filter({ hasText: /\d+°\s(−)?\d+°/ }).first()).toBeVisible();
  // The dashed 0 °C line source exists (empty when no slope in view crosses 0 °C).
  expect(await page.evaluate(() => Boolean((window as unknown as { tempestMap: { getLayer(id: string): unknown } }).tempestMap.getLayer('freezing-line')))).toBe(true);
  await page.screenshot({ path: 'test-results/screens/m4-temperature.png' });

  // The choice is remembered.
  await page.reload();
  await expect(page.locator('#layer-name')).toHaveText('Temperature');
  expect(errors).toEqual([]);
});
