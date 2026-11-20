import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from './fixtures';

// M9 place search: BC Geographical Names stubbed with a real answer saved on
// Nov 17, 2026 (name=Seymour*), so the test does not depend on the live
// service. Does not wait for the pin's forecast either.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'], serviceWorkers: 'block' });

const seymour = readFileSync(new URL('../adapters/bc-geonames/fixtures/seymour-2026-11-17.json', import.meta.url), 'utf8');
const NORTH_SHORE_PEAK = { lat: 49.393333329, lon: -122.9444444444 };

async function stub(context: BrowserContext, body: string) {
  const asked: string[] = [];
  await context.route('**/apps.gov.bc.ca/pub/bcgnws/**', (r) => {
    asked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  });
  return asked;
}

type MapHandle = { getCenter(): { lat: number; lng: number } };
const centre = (page: import('@playwright/test').Page) =>
  page.evaluate(() => { const c = (window as unknown as { tempestMap: MapHandle }).tempestMap.getCenter(); return { lat: c.lat, lon: c.lng }; });

test('search: type a name, pick the peak, the pin moves there and takes its name', async ({ page, context }) => {
  const asked = await stub(context, seymour);
  await page.goto('/?insets=47,34');
  const button = page.locator('#search-button');
  await expect(button).toBeVisible({ timeout: 45_000 });
  // A round map button above locate (Kaden's interface rule 8, Nov 20), lined up with it.
  const b = (await button.boundingBox())!;
  const loc = (await page.locator('#locate').boundingBox())!;
  expect(b.x).toBe(loc.x);
  expect(b.width).toBe(loc.width);
  expect(b.y).toBeLessThan(loc.y);
  await page.waitForFunction(() => document.body.dataset.idle === 'true', null, { timeout: 45_000 });

  await button.click();
  const panel = page.getByRole('dialog', { name: 'Search' });
  await expect(panel).toBeVisible();
  const field = panel.getByRole('searchbox', { name: 'Place name' });
  await expect(field).toBeFocused();
  await expect(panel.locator('.search-status')).toHaveText('Type a place name');

  await field.pressSequentially('Seymour', { delay: 60 });
  const rows = panel.locator('.search-row');
  await expect(rows.first()).toBeVisible();
  // Debounced: one request for the whole word, the last word open-ended.
  expect(asked).toHaveLength(1);
  expect(new URL(asked[0]!).searchParams.get('name')).toBe('Seymour*');
  // Of the three Mount Seymours, the one on the North Shore (in view) comes first.
  const peak = rows.filter({ hasText: 'Mount Seymour' }).first();
  await expect(peak.locator('.search-row-line')).toHaveText(/^Mountain · Between Seymour River and Indian Arm/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m9-search.png' });

  await peak.click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.pin .readout-text')).toContainText('Mount Seymour');
  await expect(page.locator('#place-text')).toHaveText(/^Mount Seymour/);
  await expect.poll(async () => {
    const c = await centre(page);
    return Math.hypot(c.lat - NORTH_SHORE_PEAK.lat, c.lon - NORTH_SHORE_PEAK.lon);
  }, { timeout: 10_000 }).toBeLessThan(0.002);
});

test('search: no places, and no connection', async ({ page, context }) => {
  await stub(context, JSON.stringify({ type: 'FeatureCollection', features: [] }));
  await page.goto('/?insets=47,34');
  await expect(page.locator('#search-button')).toBeVisible({ timeout: 45_000 });
  await page.locator('#search-button').click();
  const panel = page.getByRole('dialog', { name: 'Search' });
  const status = panel.locator('.search-status');
  await panel.getByRole('searchbox').fill('Qwxz');
  await expect(status).toHaveText('No places found');
  await context.setOffline(true);
  await panel.getByRole('searchbox').fill('Garibaldi');
  await expect(status).toHaveText('Search needs a connection');
  await context.setOffline(false);
});
