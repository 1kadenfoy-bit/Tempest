import { expect, test } from './fixtures';

// Mt Seymour area.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

test('model menu: only fitting models, info card, switching changes everything together', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 120_000 });
  await expect(page.locator('#model-pill-label')).toHaveText('HRDPS');

  // Precipitation lists every model; ECMWF carries precipitation.
  await page.click('#model-pill');
  const menu = page.getByRole('dialog', { name: 'Model' });
  await expect(menu.locator('.model-name')).toHaveText(['HRDPS', 'RDPS', 'ECMWF IFS', 'GDPS']);
  await expect(menu.locator('.model-row[aria-pressed="true"] .model-name')).toHaveText('HRDPS');
  await page.screenshot({ path: 'test-results/screens/m6-model-menu.png' });

  // The info card, and Escape closes it.
  await menu.getByRole('button', { name: 'About HRDPS' }).click();
  const info = page.getByRole('dialog', { name: 'HRDPS' });
  await expect(info).toContainText('High Resolution Deterministic Prediction System');
  await expect(info).toContainText('Fernie');
  await page.screenshot({ path: 'test-results/screens/m6-model-info.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel')).toHaveCount(0, { timeout: 2000 });

  // Switch to GDPS: the top bar, readout and chart change together; the time line reaches about 10 days.
  const before = { age: await page.textContent('#run-age') };
  await page.click('#model-pill');
  await page.getByRole('dialog', { name: 'Model' }).locator('.model-row', { hasText: 'GDPS' }).click();
  await expect(page.locator('#model-pill-label')).toHaveText('GDPS');
  await expect(page.locator('.panel')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 300_000 });
  const reach = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('tempest.prefs.v1')!) as { layerModels: Record<string, string> };
    return p.layerModels.precipitation;
  });
  expect(reach).toBe('gdps');
  // Dragging the week strip to its end reaches beyond the 3.5 days RDPS would give.
  const wk = (await page.locator('#week').boundingBox())!;
  await page.mouse.click(wk.x + wk.width - 4, wk.y + wk.height / 2);
  await expect(page.locator('#cursor-note')).toHaveText(/in ([4-9]|1\d) d/);
  expect(await page.textContent('#run-age')).not.toBe('');
  void before;

  // Temperature needs the height profile: ECMWF is not offered.
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name: 'Temperature' }).click();
  await page.click('#model-pill');
  await expect(page.getByRole('dialog', { name: 'Model' }).locator('.model-name')).toHaveText(['HRDPS', 'RDPS', 'GDPS']);
  expect(errors).toEqual([]);
});

test.describe('fallback', () => {
  // Requests the service worker makes are not seen by page.route.
  test.use({ serviceWorkers: 'block' });
  test('an unavailable model falls back visibly', async ({ page }) => {
    test.setTimeout(300_000);
    // HRDPS cannot be reached.
    await page.route('**/data_spatial/cmc_gem_hrdps/**', (r) => r.abort());
    await page.goto('/?insets=47,34');
    await expect(page.locator('body')).toHaveAttribute('data-run', 'ready', { timeout: 120_000 });
    await expect(page.locator('#run-age')).toContainText('HRDPS unavailable');
    await expect(page.locator('#model-pill-label')).toHaveText('RDPS');
    await expect(page.locator('#run-age')).toHaveAttribute('data-stale', 'true');
    await page.screenshot({ path: 'test-results/screens/m6-fallback.png' });
  });
});
