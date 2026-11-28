// TEMPORARY diagnostic (removed before merge): prints the map panel picture on GitHub's machine.
import { expect, test } from './fixtures';
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });
test('zz debug: map panel picture', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T00:00:00Z'));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
  await page.addStyleTag({ content: '#map canvas, .maplibregl-marker, .maplibregl-ctrl { visibility: hidden !important; } .summary-main span:nth-child(n+2) { display: none; }' });
  await page.waitForTimeout(400);
  const geo = () => page.evaluate(() => [...document.querySelectorAll('#sheet, #map-layers, .panel, .pin-readout, .window-summary')].map((e) => `${e.id || e.className} ${JSON.stringify(e.getBoundingClientRect())} ${(e as HTMLElement).innerText?.slice(0, 60).replace(/\n/g, '|')}`).join('\n') + '\n' + JSON.stringify(document.body.dataset));
  console.log('ZZ before\n' + await geo());
  await page.click('#map-layers');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.waitForTimeout(200);
  console.log('ZZ after\n' + await geo());
  const png = (await page.screenshot()).toString('base64');
  for (let i = 0; i < png.length; i += 4000) console.log(`ZZPNG ${png.slice(i, i + 4000)}`);
});
