// TEMPORARY (removed before merge): the map panel reference picture as GitHub's machine draws it, printed into the log.
import { expect, test, type Page } from './fixtures';
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });
test('dbg: map panel reference picture', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T00:00:00Z'));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
  await page.addStyleTag({ content: '#map canvas, .maplibregl-marker, .maplibregl-ctrl { visibility: hidden !important; } .summary-main span:nth-child(n+2) { display: none; }' });
  await page.waitForTimeout(400);
  await page.click('#map-layers');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.waitForTimeout(200);
  const mask = (p: Page) => ['#place-text', '#subject-place', '#cursor-time', '#cursor-note', '#subject-time', '#run-age', '.window-summary', '.chart-block', '.week'].map((s) => p.locator(s));
  const png = (await page.screenshot({ mask: mask(page), animations: 'disabled', caret: 'hide', scale: 'css' })).toString('base64');
  for (let i = 0; i < png.length; i += 4000) console.log(`ZZPNG ${png.slice(i, i + 4000)}`);
});
