import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page, reportDir } from './fixtures';

// The weather stations overlay: the switch, markers over the layer, and a
// station's panel. Station answers are stubbed from saved real ones (ECCC,
// Nov 17, 2026; Avalanche Canada's published station list and its documented
// example readings), moved to the present. STATIONS_LIVE=1 leaves ECCC live.
const YOU = { latitude: 49.3895, longitude: -122.948 };
test.use({ geolocation: YOU, permissions: ['geolocation'], serviceWorkers: 'block' });

const LIVE = process.env.STATIONS_LIVE === '1';
const SHOTS = reportDir('stations');
const read = (path: string) => JSON.parse(readFileSync(new URL(`../adapters/${path}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const H = 3_600_000;
const thisHour = () => Math.floor(Date.now() / H) * H;

/** ECCC features with their report times moved so the newest is this hour. */
function eccc(files: string[], newest: string) {
  const shift = thisHour() - new Date(newest).getTime();
  const features = files.flatMap((f) => (read(`eccc-swob/fixtures/${f}`).features as { properties: Record<string, unknown> }[]))
    .map((f) => ({ ...f, properties: { ...f.properties, 'date_tm-value': new Date(new Date(String(f.properties['date_tm-value'])).getTime() + shift).toISOString() } }));
  return { type: 'FeatureCollection', features, numberMatched: features.length, numberReturned: features.length };
}

async function stub(context: BrowserContext) {
  const asked: string[] = [];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (!LIVE) {
    await context.route('**/api.weather.gc.ca/collections/swob-realtime/**', (r) => {
      const url = r.request().url();
      asked.push(url);
      return r.fulfill(json(new URL(url).searchParams.has('msc_id-value')
        ? eccc(['series-callaghan-valley-2026-11-17.json'], '2026-11-17T14:00:00Z')
        : eccc(['latest-cell-124-49-2026-11-17.json', 'latest-cell-124-50-2026-11-17.json'], '2026-11-17T14:00:00Z')));
    });
  }
  await context.route('**/weather.prod.avalanche.ca/**', (r) => {
    const url = r.request().url();
    asked.push(url);
    if (url.endsWith('/stations')) return r.fulfill(json(read('avcan-weather/fixtures/stations-from-page-2026-11-17.json')));
    // The documented example, hourly back from this hour.
    const example = read('avcan-weather/fixtures/measurements-docs-example.json') as unknown as Record<string, unknown>[];
    const rows = Array.from({ length: 48 }, (_, i) => ({ ...example[i % 2], measurementDateTime: new Date(thisHour() - (47 - i) * H).toISOString() }));
    return r.fulfill(json(rows));
  });
  return asked;
}

async function started(page: Page) {
  await page.goto('/?insets=47,34');
  await page.waitForFunction(() => document.body.dataset.idle === 'true', undefined, { timeout: 45_000 });
  // Howe Sound to Whistler: the North Shore, Sea to Sky and their stations.
  await page.evaluate(() => (window as unknown as { tempestMap: { jumpTo(o: unknown): void } }).tempestMap.jumpTo({ center: [-123.1, 49.9], zoom: 8.8 }));
}

async function switchOn(page: Page) {
  await page.click('#map-layers');
  const panel = page.getByRole('dialog', { name: 'Map' });
  const sw = panel.getByRole('button', { name: 'Weather stations' });
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel')).toHaveCount(0);
}

test('weather stations: switch on, markers with measured values, tap one for its panel', async ({ page, context }) => {
  const asked = await stub(context);
  await started(page);
  await expect(page.locator('.station-marker')).toHaveCount(0);
  await switchOn(page);

  await expect.poll(() => page.locator('.station-marker').count(), { timeout: 30_000 }).toBeGreaterThan(5);
  if (!LIVE) {
    // Asked politely: hourly reports, by whole-degree cell, only the fields used.
    const q = new URL(asked.find((u) => u.includes('swob-realtime') && u.includes('bbox'))!).searchParams;
    expect(q.get('bbox')).toMatch(/^-?\d+,-?\d+,-?\d+,-?\d+$/);
    expect(q.get('_is-minutely_obs-value')).toBe('false');
    expect(q.get('properties')).toContain('air_temp');
    // Avalanche Canada's mountain station above the North Shore.
    await expect(page.locator('[data-station="avcan-weather:11"]')).toHaveAttribute('aria-label', /Mt\. Strachan, 1,420 m/);
  }
  // Precipitation (the first layer): the past hour's amount beside each marker that measures it.
  await expect(page.locator('.station-value:visible').first()).toHaveText(/ mm$/);
  await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/map.png` });

  // Remembered.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tempest.prefs.v1')!).stations)).toBe(true);

  // Tap a station: its panel, and the pin stays where it was.
  const pinBefore = await page.locator('#place-text').textContent();
  const id = 'eccc-swob:1101300'; // Callaghan Valley
  await page.locator(`[data-station="${id}"]`).click();
  const panel = page.getByRole('dialog').filter({ has: page.locator('.station-panel') });
  await expect(panel).toBeVisible();
  if (!LIVE) {
    await expect(panel.locator('.panel-title')).toHaveText('Callaghan Valley');
    await expect(panel.locator('.panel-caption')).toHaveText('MSC · 887 m');
    await expect(panel.locator('.fact', { hasText: 'Elevation' })).toContainText('887 m');
    await expect(panel.locator('.fact', { hasText: 'From the pin' })).toContainText(/ km$/);
    await expect(panel.locator('.station-when')).toHaveText(/ago|just now/);
    await expect(panel.locator('.station-values .fact-label')).toHaveText(['Air', 'Wind', 'Gust', 'Past hour', 'Snow depth']);
    await expect(panel.locator('.station-values .fact', { hasText: 'Air' })).toContainText('°C');
    await expect(panel.locator('.station-source')).toContainText('Environment and Climate Change Canada');
  }
  await expect(panel.locator('.station-panel')).toHaveAttribute('data-series', 'ready', { timeout: 30_000 });
  await expect(panel.locator('canvas.station-chart')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/station.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('#place-text')).toHaveText(pinBefore ?? '');
});

test('weather stations: wind layer labels with arrows, units follow the setting; light theme and 3D terrain', async ({ page, context }) => {
  test.skip(LIVE, 'stubbed only');
  await stub(context);
  await page.addInitScript(() => localStorage.setItem('tempest.prefs.v1', JSON.stringify({ stations: true, layer: 'wind', units: 'imperial', theme: 'light', terrain3d: true })));
  await started(page);
  const marker = page.locator('[data-station="eccc-swob:10459NN"]'); // Howe Sound - Pam Rocks
  await expect(marker).toBeVisible({ timeout: 30_000 });
  await expect(marker).toHaveAttribute('data-arrow', 'true');
  await expect(marker.locator('.station-value')).toHaveText(/^\d+$/);
  await expect(marker).toHaveAttribute('aria-label', /wind \d+ mph from/);
  // Light theme: the markers take the light tokens (dark ink on white).
  expect(await marker.locator('.station-dot').evaluate((e) => getComputedStyle(e).borderTopColor)).toBe('rgb(20, 24, 29)');
  // 3D terrain: tilted, the markers stand on the ground (MapLibre raises them with the terrain).
  await page.evaluate(() => (window as unknown as { tempestMap: { jumpTo(o: unknown): void } }).tempestMap.jumpTo({ center: [-123.1, 49.75], zoom: 9.5, pitch: 55 }));
  await page.waitForFunction(() => document.body.dataset.stations !== 'loading', undefined, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/light-3d-wind.png` });
});

test('weather stations offline: the switch says it needs a connection', async ({ page, context }) => {
  await stub(context);
  await started(page);
  await context.setOffline(true);
  await page.click('#map-layers');
  const panel = page.getByRole('dialog', { name: 'Map' });
  await expect(panel.getByRole('button', { name: 'Weather stations' })).toBeDisabled();
  await expect(panel.locator('.toggle-note')).toHaveText('Needs a connection');
  await context.setOffline(false);
});
