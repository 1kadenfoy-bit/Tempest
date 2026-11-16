import { expect, test } from '@playwright/test';

// M3 done-test: save on Wi-Fi, switch to airplane mode, and the saved area
// shows the same picture and numbers, through the same read path.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

test('a saved area works in airplane mode with the same numbers', async ({ page, context }) => {
  test.setTimeout(300_000);
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2000);

  // Choose the area with the save box (08-SaveArea), then save.
  await page.click('#map-layers');
  await page.getByRole('button', { name: /Save this area/ }).click();
  await expect(page.getByRole('dialog', { name: 'Save for offline' })).toBeVisible();
  await expect(page.locator('.save-go')).toHaveText(/Save area · about \d+/, { timeout: 60_000 });
  await page.screenshot({ path: 'test-results/screens/m3-save-box.png' });
  await page.click('.save-go');
  await expect(page.locator('body')).toHaveAttribute('data-saved', 'true', { timeout: 240_000 });
  await expect(page.locator('.save-mode')).toHaveCount(0);
  await page.click('#map-layers');
  console.log('saved area:', await page.locator('[data-area] .icon-row-title').textContent(), '|', await page.locator('[data-area] .icon-row-note').textContent());
  await page.screenshot({ path: 'test-results/screens/m3-saved.png' });
  await page.getByRole('button', { name: 'Close' }).click();

  const read = async () => ({
    run: (await page.textContent('#run-age'))?.replace(' · saved', ''),
    // The snow line needs the profile, which a precipitation-only save leaves out (M5).
    readout: (await page.textContent('.pin-readout'))?.replace(/ · snow line [\d,]+ m/, ''),
    before: await page.textContent('#summary-before'),
    after: await page.textContent('#summary-after'),
  });
  const online = await read();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  const offline = await read();
  console.log('online :', JSON.stringify(online));
  console.log('offline:', JSON.stringify(offline));
  expect(offline).toEqual(online);
  await page.screenshot({ path: 'test-results/screens/m3-offline.png' });

  // Moving through time works offline from the saved run.
  await page.click('#play-button');
  await page.waitForTimeout(1600);
  await page.click('#play-button');
  await expect(page.locator('#cursor-note')).toHaveText(/in \d+ h/);
  await context.setOffline(false);
});
