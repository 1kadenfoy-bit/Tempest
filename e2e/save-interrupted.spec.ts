import { expect, test, type Page, upTo } from './fixtures';
import { startSaving, stored } from './save-area';

// The app is closed while an area is being saved (docs/testing.md, "Sequences
// that could cause trouble"): the phone locks, the app is swiped away, iOS
// reloads it. No half-saved area may be used as if whole, nothing of it may be
// left taking space on the phone, the app says the save did not finish, and
// the save can simply be started again.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

async function open(page: Page) {
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
}

test('closing the app while an area is saved leaves nothing half-saved, and the save starts again', async ({ page, context }) => {
  test.setTimeout(upTo(900_000, 600_000));
  // Observed precipitation is online only (ECCC asks that it not be bulk-copied).
  await context.route('**/geo.weather.gc.ca/**', (r) => r.abort());
  await page.goto('/?insets=47,34');
  await page.evaluate(() => localStorage.setItem('tempest.prefs.v1', JSON.stringify({ windowHours: 12 })));
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2000);

  // Save, and close the app late in the save: its weather and base map are
  // written, and its terrain pieces are being kept.
  await startSaving(page);
  await expect.poll(async () => (await stored(page)).pieces, { timeout: upTo(600_000, 300_000) }).toBeGreaterThan(0);
  const during = await stored(page);
  console.log(`while saving: ${during.files.length} files, ${(during.bytes / 1e6).toFixed(1)} MB, ${during.pieces} map pieces`);
  expect(during.areas, 'not listed as saved before it is whole').toEqual([]);
  await page.close();

  // Opened again.
  page = await context.newPage();
  await open(page);
  // Nothing of the unfinished save is used, or left on the phone.
  await expect.poll(() => stored(page), { timeout: 30_000 }).toEqual({ files: [], pieces: 0, areas: [], bytes: 0 });
  // The Notification Centre says it did not finish, and how to start it again.
  await page.click('#alert-badge');
  const centre = page.getByRole('dialog', { name: 'Notification Centre' });
  await expect(centre.locator('.notice-words', { hasText: /did not finish/ })).toBeVisible();
  await page.waitForTimeout(600); // the window's opening (0.4 s), for the picture
  await page.screenshot({ path: 'test-results/screens/save-interrupted-notice.png' });
  await page.keyboard.press('Escape');
  await expect(centre).toBeHidden();
  // Without signal, the app has no saved area to fall back on.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'error', { timeout: 60_000 });
  await context.setOffline(false);
  await open(page);

  // The save started again finishes, and works without signal.
  await startSaving(page);
  await page.click('#alert-badge');
  await expect(centre.locator('.notice-words', { hasText: 'Saved for offline' })).toBeVisible({ timeout: upTo(720_000, 480_000) });
  await page.keyboard.press('Escape');
  const saved = await stored(page);
  expect(saved.areas).toHaveLength(1);
  expect(saved.pieces).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'saved', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 60_000 });
  await context.setOffline(false);
});
