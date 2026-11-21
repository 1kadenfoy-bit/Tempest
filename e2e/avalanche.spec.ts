import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from './fixtures';

/** The time the page sees: the recorded set's moment, or now with WEATHER=live. */
function pageNow(): number {
  const set = process.env.WEATHER ?? 'default';
  if (set === 'live') return Date.now();
  return Date.parse((JSON.parse(readFileSync(`recorded/${set}/meta.json`, 'utf8')) as { now: string }).now);
}

// The avalanche layer with Avalanche Canada's answers stubbed from saved real
// ones (Nov 17, 2026: early season everywhere), so it runs without live data.
// Report photos are a local test image (Cloudinary is not reachable from the
// cloud session). Does not wait for the pin's weather forecast.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'], serviceWorkers: 'block' });

const fixture = (name: string) => readFileSync(new URL(`../adapters/avalanche-canada/fixtures/${name}`, import.meta.url), 'utf8');
const SHOTS = 'docs/reports/avalanche';

/** A drawn test picture (sky and snow) in place of the report's photos, which come from Cloudinary. */
const PHOTO = readFileSync(new URL('./avalanche-test-photo.png', import.meta.url));

/** Products from the saved answer; `rated` gives the BC product three rated days from today (made-up test ratings). */
function products(rated: boolean): string {
  if (!rated) return fixture('products-2026-11-17.json');
  const list = JSON.parse(fixture('products-2026-11-17.json')) as { area: { id: string }; report: Record<string, unknown> }[];
  const bc = list.find((p) => p.area.id.startsWith('53bb614c'))!;
  // Days counted from the page's clock: frozen at the recorded weather's moment (e2e/recorded.ts), or now on live data.
  const day = (k: number) => new Date(pageNow() + k * 86_400_000);
  const r = (v: string, d: string) => ({ rating: { value: v, display: d } });
  const levels: [string, string][][] = [
    [['considerable', 'Considerable'], ['moderate', 'Moderate'], ['low', 'Low']],
    [['high', 'High'], ['considerable', 'Considerable'], ['moderate', 'Moderate']],
    [['extreme', 'Extreme'], ['high', 'High'], ['norating', 'No Rating']],
  ];
  bc.report.dateIssued = day(0).toISOString();
  bc.report.validUntil = day(1).toISOString();
  bc.report.dangerRatings = levels.map((l, k) => ({
    date: { value: day(k).toISOString(), display: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver', weekday: 'long' }).format(day(k)) },
    ratings: { alp: { display: 'Alpine', ...r(...l[0]!) }, tln: { display: 'Treeline', ...r(...l[1]!) }, btl: { display: 'Below Treeline', ...r(...l[2]!) } },
  }));
  return JSON.stringify(list);
}

async function stub(context: BrowserContext, rated = false) {
  const asked: string[] = [];
  const json = (body: string) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  await context.route('**/api.avalanche.ca/**', (r) => {
    const u = new URL(r.request().url());
    asked.push(u.pathname + u.search);
    if (u.pathname === '/forecasts/en/areas') return r.fulfill(json(fixture('areas-2026-11-17.json')));
    if (u.pathname === '/forecasts/en/products') return r.fulfill(json(products(rated)));
    if (u.pathname === '/min/submissions') return r.fulfill(json(fixture('min-submissions-2026-11-03_2026-11-17.json')));
    if (u.pathname.startsWith('/min/submissions/')) return r.fulfill(json(fixture('min-submission-5dc16163.json')));
    return r.fulfill({ status: 404, body: '' });
  });
  await context.route('**/res.cloudinary.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: PHOTO }));
  await context.route('**/collections/weather-alerts/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 }) }));
  return asked;
}

async function pickAvalanche(page: Page) {
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-pin', /pending|ready/, { timeout: 45_000 });
  await page.click('#layer-button');
  const menu = page.getByRole('dialog', { name: 'Condition layer' });
  await menu.getByRole('button', { name: 'Avalanche' }).click();
  await expect(page.locator('#layer-name')).toHaveText('Avalanche');
  await expect(page.locator('body')).toHaveAttribute('data-avalanche-map', 'ready', { timeout: 30_000 });
}

/** The value the map's colour lookup holds for the region at a point. */
const regionValue = (page: Page, lng: number, lat: number) => page.evaluate(([x, y]) => {
  const map = (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap;
  const p = map.project([x!, y!]);
  const f = map.queryRenderedFeatures(p, { layers: ['avy-fill'] })[0];
  return f ? (map.getFeatureState({ source: 'avy-regions', id: f.id! }).value as string) : null;
}, [lng, lat]);

test('avalanche: regions coloured as issued, region forecast, report with photos', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const asked = await stub(context);
  await pickAvalanche(page);
  // Areas, products and the last 7 days of reports (BC dates).
  await expect.poll(() => asked.filter((a) => a.startsWith('/min/submissions?')).length).toBeGreaterThan(0);
  const q = new URLSearchParams(asked.find((a) => a.startsWith('/min/submissions?'))!.split('?')[1]);
  expect((new Date(q.get('todate')!).getTime() - new Date(q.get('fromdate')!).getTime()) / 86_400_000).toBe(6);

  // The BC product is early season (valid to Nov 26): the North Shore's region holds that value.
  await page.evaluate(() => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.jumpTo({ center: [-122.6, 50.1], zoom: 6.2 }));
  await page.waitForTimeout(800);
  const now = pageNow();
  const expected = now < Date.parse('2026-11-26T00:00:00Z') ? 'earlyseason' : 'none';
  expect(await regionValue(page, -123.08, 49.6)).toBe(expected);
  await expect(page.locator('#legend-row')).toContainText('Early season');
  await expect(page.locator('#run-age')).toContainText(/^Issued /);
  // The model button names the source; its menu lists Avalanche Canada only.
  await expect(page.locator('#model-pill')).toHaveText('AvCan');
  await page.locator('#model-pill').click();
  const sources = page.getByRole('dialog', { name: 'Source' });
  await expect(sources.locator('.model-row')).toHaveCount(1);
  await expect(sources.locator('.model-row')).toHaveAttribute('aria-pressed', 'true');
  await expect(sources.locator('.model-name')).toHaveText('Avalanche Canada');
  await expect(sources.locator('.model-age')).toContainText('ago');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/source-menu.png` });
  await sources.locator('.model-row').click();
  await expect(sources).toBeHidden();
  // Report pins: one per report with a place (21 in the saved answer).
  await expect(page.locator('.avy-report-pin')).toHaveCount(21);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/map.png` });

  // Tap the region: the pin moves there and the region's forecast opens.
  const box = (await page.locator('#map').boundingBox())!;
  const at = await page.evaluate(() => { const m = (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap; return m.project([-123.3, 49.75]); });
  await page.mouse.click(box.x + at.x, box.y + at.y);
  const panel = page.getByRole('dialog', { name: /^Akamina, Badshot and \d+ more regions$/ });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.panel-caption')).toHaveText('Avalanche forecast · as issued');
  const rows = panel.locator('.avy-table tr[data-band]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('th')).toHaveText('Alpine');
  await expect(rows.nth(1).locator('th')).toHaveText('Treeline');
  await expect(rows.nth(2).locator('th')).toHaveText('Below treeline');
  await expect(rows.nth(0).locator('td')).toHaveCount(3);
  await expect(rows.nth(0).locator('td').first()).toHaveText('Early Season');
  // Avalanche Canada's early-season blue.
  expect(await rows.nth(0).locator('.avy-cell').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 114, 198)');
  await expect(panel.locator('.avy-times')).toContainText('Issued');
  await expect(panel.getByRole('link', { name: 'Read the full forecast on avalanche.ca' })).toHaveAttribute('href', /^https:\/\/avalanche\.ca\/forecasts\//);
  await expect(panel).toContainText('Daily avalanche forecasts will begin November 25 at 4 PM.');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/region.png` });
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();

  // A report pin: the report as written, with its photos.
  await page.evaluate(() => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.jumpTo({ center: [-117.6, 51.33], zoom: 9 }));
  await page.waitForTimeout(600);
  const pinBefore = await page.locator('#place-text').textContent();
  await page.locator('.avy-report-pin[data-report="5dc16163-4d1e-4e1a-afbf-1b3590ff3c14"]').click();
  const report = page.getByRole('dialog', { name: /Hope you like rocks/ });
  await expect(report).toBeVisible();
  // Tapping a report does not move the pin.
  expect(await page.locator('#place-text').textContent()).toBe(pinBefore);
  await expect(report.locator('.avy-times')).toContainText('2026-11-15 · by Nathan Britt');
  await expect(report.locator('.avy-observations')).toContainText('Went for a trundle up hermit today');
  await expect(report.locator('.avy-thumb')).toHaveCount(8);
  // Thumbnails ask for a small copy, not the 2000 px original.
  await expect(report.locator('.avy-thumb img').first()).toHaveAttribute('src', /\/image\/upload\/c_limit,w_320,q_auto\//);
  await expect(report.getByRole('link', { name: 'Open this report on avalanche.ca' })).toHaveAttribute('href', 'https://avalanche.ca/mountain-information-network/submissions/5dc16163-4d1e-4e1a-afbf-1b3590ff3c14');
  await report.locator('.avy-photos').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/report.png` });
  await report.locator('.avy-thumb').first().click();
  const photo = page.getByRole('dialog', { name: 'Photo 1 of 8' });
  await expect(photo).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/photo.png` });
  await expect(photo.locator('img')).toHaveAttribute('src', /c_limit,w_\d+,q_auto/);
  expect(await photo.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Close photo' }).click();
  await expect(photo).toBeHidden();
  expect(errors).toEqual([]);
});

test('avalanche: three rated days in the official colours, and the save panel keeps it online only (test ratings)', async ({ page, context }) => {
  await stub(context, true);
  await pickAvalanche(page);
  await page.evaluate(() => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.jumpTo({ center: [-122.6, 50.1], zoom: 6.2 }));
  await page.waitForTimeout(800);
  // Highest band today: Considerable.
  expect(await regionValue(page, -123.08, 49.6)).toBe('considerable');
  await expect(page.locator('.readout-text')).toContainText('Considerable (3)');
  const box = (await page.locator('#map').boundingBox())!;
  const at = await page.evaluate(() => { const m = (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap; return m.project([-123.3, 49.75]); });
  await page.mouse.click(box.x + at.x, box.y + at.y);
  const panel = page.getByRole('dialog', { name: /^Akamina, Badshot and \d+ more regions$/ });
  await expect(panel).toBeVisible();
  const cells = panel.locator('.avy-table tr[data-band] .avy-cell');
  await expect(cells).toHaveCount(9);
  const bg = await cells.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  // Rows: alpine, treeline, below; columns: today, tomorrow, the day after.
  expect(bg).toEqual([
    'rgb(247, 148, 30)', 'rgb(237, 28, 36)', 'rgb(35, 31, 32)',
    'rgb(255, 242, 0)', 'rgb(247, 148, 30)', 'rgb(237, 28, 36)',
    'rgb(80, 184, 72)', 'rgb(255, 242, 0)', 'rgb(255, 255, 255)',
  ]);
  await expect(cells.nth(0)).toHaveText('3Considerable');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/region-test-ratings.png` });
  await panel.getByRole('button', { name: 'Close' }).click();

  // The layer settings: band choice recolours the map.
  await page.locator('#sheet-handle').click();
  await page.locator('#layer-settings').click();
  const settings = page.getByRole('dialog', { name: 'Avalanche settings' });
  await settings.getByRole('button', { name: 'Below' }).click();
  await expect.poll(() => regionValue(page, -123.08, 49.6)).toBe('low');
  await settings.getByRole('switch', { name: /Field reports/ }).click();
  await expect(page.locator('.avy-report-pin')).toHaveCount(0);
});

test('avalanche: light theme and 3D terrain', async ({ page, context }) => {
  await stub(context, true);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('avy-seeded')) return;
    sessionStorage.setItem('avy-seeded', '1');
    localStorage.setItem('tempest.prefs.v1', JSON.stringify({ layer: 'avalanche', theme: 'light', terrain3d: true }));
  });
  await page.goto('/?insets=47,34');
  await expect(page.locator('#layer-name')).toHaveText('Avalanche');
  await expect(page.locator('body')).toHaveAttribute('data-avalanche-map', 'ready', { timeout: 45_000 });
  await page.evaluate(() => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.jumpTo({ center: [-123.1, 49.5], zoom: 9.5, pitch: 55, bearing: 20 }));
  await page.waitForTimeout(2500);
  // The outlines and fills lie on the terrain; the report pins stand on it.
  const draped = await page.evaluate(() => {
    const m = (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap;
    return { terrain: !!m.getTerrain(), fill: m.getLayoutProperty('avy-fill', 'visibility'), casing: m.getPaintProperty('avy-casing', 'line-color') };
  });
  expect(draped.terrain).toBe(true);
  expect(draped.fill).toBe('visible');
  // Light theme: the neutral casing follows the surface token (white).
  expect(String(draped.casing)).toMatch(/255, 255, 255/);
  await page.screenshot({ path: `${SHOTS}/light-3d.png` });
});

// Kaden's phone (Nov 17): "Saved data only" was on with nothing saved, and the
// avalanche layer never asked Avalanche Canada. With nothing saved the switch
// has no effect anywhere (one rule, app/data/connection.ts).
test('avalanche: loads with "saved data only" on and nothing saved', async ({ page, context }) => {
  const asked = await stub(context);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('avy-seeded')) return;
    sessionStorage.setItem('avy-seeded', '1');
    localStorage.setItem('tempest.prefs.v1', JSON.stringify({ savedOnly: true }));
  });
  await pickAvalanche(page);
  expect(asked.some((a) => a.startsWith('/forecasts/en/products'))).toBe(true);
  await expect(page.locator('#run-age')).toContainText(/^Issued /);
});
