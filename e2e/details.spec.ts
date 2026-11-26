import { expect, test, type Page } from './fixtures';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

async function openDetails(page: Page, layer: string) {
  await page.goto('/?insets=47,34');
  await page.evaluate((l) => {
    const p = JSON.parse(localStorage.getItem('tempest.prefs.v1') ?? '{}') as Record<string, unknown>;
    p.layer = l;
    localStorage.setItem('tempest.prefs.v1', JSON.stringify(p));
  }, layer);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 360_000 });
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 60_000 });
  await page.click('#sheet-handle');
  await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
}

test('temperature details: the standard cards in order, and settings remembered', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDetails(page, 'temperature');
  const d = page.locator('.details');
  await expect(d.locator('.card-headline .headline-value')).toHaveText(/^(−)?\d+ °C$/);
  await expect(d.locator('.card-headline .headline-sentence')).toContainText('Feels like');
  const titles = await d.locator('.card-title').allTextContents();
  expect(titles).toEqual(['TODAY', 'BY ELEVATION', 'ABOVE OR BELOW 0 °C AT EACH ELEVATION'].filter((t) => titles.includes(t)));
  expect(titles[0]).toMatch(/TODAY|[A-Z]{3} \d+/);
  await expect(d.locator('.card-status')).toContainText('Freeze-thaw');
  await expect(d.locator('.card-expand summary')).toContainText('Hourly detail');
  await expect(d.locator('.card-later').first()).toContainText('comes with ensembles');
  await expect(d.locator('.details-footer')).toContainText(/HRDPS · \d\dZ run, \d+ h old/);
  await expect(d.locator('.details-footer')).toContainText('Corrected to terrain from pressure levels');
  await page.screenshot({ path: 'test-results/screens/m5-temperature-up.png' });

  // Settings: the Feels-like map, remembered (the lines have their own buttons in the map panel).
  await page.click('#layer-settings');
  const panel = page.getByRole('dialog', { name: 'Temperature settings' });
  await panel.getByRole('button', { name: 'Feels-like' }).click();
  await page.screenshot({ path: 'test-results/screens/m5-temperature-settings.png' });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 360_000 });
  const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('tempest.prefs.v1')!) as { layerSettings: Record<string, Record<string, unknown>> }).layerSettings.temperature);
  expect(saved).toEqual({ map: 'feels' });
  expect(errors).toEqual([]);
});

test('precipitation details: totals by elevation, snow ratio and type shown', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDetails(page, 'precipitation');
  const d = page.locator('.details');
  await expect(d.locator('.card-headline .headline-value')).toHaveText(/^(Dry|Rain|Snow|Mixed)$/);
  await expect(d.locator('.card-title').first()).toHaveText('NOW');
  const table = d.locator('.band-table');
  await expect(table.locator('.band-name')).toHaveText(['Alpine', /^Mid/, 'Valley']);
  await expect(table.locator('tr.you .you-chip')).toHaveText('You');
  await expect(d.locator('.details-footer')).toContainText('Snow ratio Kuchera');
  await page.screenshot({ path: 'test-results/screens/m5-precipitation-up.png' });

  await page.click('#layer-settings');
  const panel = page.getByRole('dialog', { name: 'Precipitation settings' });
  await panel.getByRole('button', { name: '10:1' }).click();
  await expect(d.locator('.details-footer')).toContainText('Snow ratio 10:1 (fixed)');
  await panel.getByRole('button', { name: 'Rain only' }).click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 360_000 });
  const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('tempest.prefs.v1')!) as { layerSettings: Record<string, Record<string, unknown>> }).layerSettings.precipitation);
  expect(saved).toEqual({ ratio: '10:1', type: 'rain' });
  expect(errors).toEqual([]);
});
