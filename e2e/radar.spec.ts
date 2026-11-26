import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from './fixtures';

// Radar (no v8 design): ECCC's GeoMet is stubbed with answers saved on
// Nov 17, 2026, moved to the present, so the test never depends on live
// radar. Open-Meteo's point service is refused (its daily limit is precious);
// the forecast's run list (map files) still loads, so the save panel opens.
test.use({ geolocation: { latitude: 49.38, longitude: -123.28 }, permissions: ['geolocation'], serviceWorkers: 'block' });

const fixture = (name: string) => readFileSync(new URL(`../adapters/eccc-radar/fixtures/${name}`, import.meta.url));
const STEP = 6 * 60_000;
/** The newest frame ECCC would hold now (a few minutes behind), and the type product one frame later. */
// The frames are made from the real clock, and the test brings its own
// radar answers: no recorded weather (e2e/fixtures.ts).
test.use({ weather: 'live' });
const newest = Math.floor((Date.now() - 4 * 60_000) / STEP) * STEP;
const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z');

function capabilities(layer: string): string {
  const file = layer === 'Radar_1km_SfcPrecipType' ? 'caps-Radar_1km_SfcPrecipType-2026-11-17.xml'
    : layer === 'RADAR_1KM_RSNO' ? 'caps-RADAR_1KM_RSNO-2026-11-17.xml'
    : layer.startsWith('RADAR_COVERAGE') ? 'caps-RADAR_COVERAGE_RRAI.INV-2026-11-17.xml' : 'caps-RADAR_1KM_RRAI-2026-11-17.xml';
  const end = layer === 'Radar_1km_SfcPrecipType' ? newest - STEP : newest;
  return fixture(file).toString('utf8').replace(/(<Dimension name="time"[^>]*default=")[^"]*("[^>]*>)[^<]*/, `$1${iso(end)}$2${iso(end - 3 * 3_600_000)}/${iso(end)}/PT6M`);
}

async function stubGeoMet(context: BrowserContext) {
  const asked: URL[] = [];
  await context.route('**/api.open-meteo.com/**', (r) => r.abort());
  await context.route('**/geo.weather.gc.ca/geomet**', (r) => {
    const u = new URL(r.request().url());
    asked.push(u);
    const q = (k: string) => u.searchParams.get(k) ?? u.searchParams.get(k.toUpperCase()) ?? '';
    const headers = { 'access-control-allow-origin': '*' };
    const request = q('request');
    if (request === 'GetCapabilities') return r.fulfill({ status: 200, contentType: 'text/xml', headers, body: capabilities(q('layer')) });
    if (request === 'GetMap') {
      const layer = q('layers');
      if (layer.startsWith('RADAR_COVERAGE')) return r.fulfill({ status: 200, contentType: 'image/png', headers, body: fixture('tile-coverage-empty.png') });
      return r.fulfill({ status: 200, contentType: 'image/png', headers, body: fixture(layer === 'Radar_1km_SfcPrecipType' ? 'tile-Radar_1km_SfcPrecipType-2026-11-17.png' : 'tile-RADAR_1KM_RRAI-2026-11-17.png') });
    }
    if (request === 'GetFeatureInfo') {
      const layer = q('layers');
      const body = layer === 'Radar_1km_SfcPrecipType' ? fixture('fi-type-near-2026-11-17.json')
        : layer === 'RADAR_1KM_RRAI' ? fixture('fi-rrai-rain-2026-11-17.json') : '{}';
      return r.fulfill({ status: 200, contentType: 'application/json', headers, body });
    }
    return r.fulfill({ status: 404, headers, body: '' });
  });
  return asked;
}

const pickLayer = async (page: Page, name: string) => {
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).last().click();
  await expect(page.locator('#layer-name')).toHaveText(name);
};

test('radar: ECCC frames on the one cursor, loop, legend, value at the pin, online only', async ({ page, context }) => {
  test.setTimeout(120_000);
  const asked = await stubGeoMet(context);
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-run', 'ready', { timeout: 60_000 });
  await pickLayer(page, 'Radar');
  await expect(page.locator('body')).toHaveAttribute('data-radar', 'ready', { timeout: 30_000 });

  // Legend: ECCC's type classes, in ECCC's colours.
  const legend = page.locator('#legend-row .legend-image');
  await expect(legend.locator('.legend-name')).toHaveText(['Snow', 'Mixed', 'Rain', 'Freezing', 'Hail']);
  // The source button stays (Kaden's interface rule 3, Nov 20); no window to choose for observed frames.
  await expect(page.locator('#model-pill')).toBeVisible();
  await expect(page.locator('#window-button')).toBeHidden();

  // The cursor sits on the newest type frame; the scrubber spans the last 3 hours.
  const typeNewest = new Date(newest - STEP).toISOString();
  await expect(page.locator('body')).toHaveAttribute('data-radar-frame', typeNewest);
  await expect(page.locator('#cursor-note')).toHaveText(/min ago|^now$/);
  await expect(page.locator('#summary-before')).toHaveText('31 frames · every 6 min');
  // The newest frame's age and the next look (Kaden's interface rules 2 and 7, Nov 20); the source button names ECCC radar.
  await expect(page.locator('#run-age')).toHaveText(/^(\d+ min old|now) · next (in \d+ (min|h)|any minute now)$/);

  // The value at the pin, as ECCC classes it (the stub answers light rain next to the pin).
  await expect(page.locator('.pin-readout strong')).toHaveText('Light rain', { timeout: 15_000 });
  await expect(page.locator('.pin-readout .muted')).toContainText('radar ·');

  // Tiles: ECCC's own WMS pictures, at the cursor's frame, in 3857.
  const map = asked.filter((u) => u.searchParams.get('request') === 'GetMap' && u.searchParams.get('layers') === 'Radar_1km_SfcPrecipType');
  expect(map.length).toBeGreaterThan(0);
  expect(map.some((u) => u.searchParams.get('time') === iso(newest - STEP))).toBe(true);
  expect(map[0]!.searchParams.get('crs')).toBe('EPSG:3857');
  expect(asked.some((u) => u.searchParams.get('layers') === 'RADAR_COVERAGE_RRAI.INV')).toBe(true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screens/radar.png' });

  // Play from the newest frame starts the loop an hour back, then steps forward.
  // Every frame shown is recorded in the page (a frame lasts 0.5 s, too short to catch by polling on a busy machine).
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seenFrames: string[] }).seenFrames = seen;
    new MutationObserver(() => { const f = document.body.dataset.radarFrame; if (f && seen[seen.length - 1] !== f) seen.push(f); })
      .observe(document.body, { attributes: true, attributeFilter: ['data-radar-frame'] });
  });
  await page.click('#play-button');
  const loopStart = new Date(newest - STEP - 3_600_000).toISOString();
  const next = new Date(newest - STEP - 3_600_000 + STEP).toISOString();
  const seen = () => page.evaluate(() => (window as unknown as { seenFrames: string[] }).seenFrames);
  await expect.poll(async () => { const f = await seen(); const i = f.indexOf(loopStart); return i >= 0 && f[i + 1] === next; }, { timeout: 10_000 }).toBe(true);
  await page.click('#play-button');
  // Polite: frames load only around the cursor (a few, not all 31).
  const times = new Set(asked.filter((u) => u.searchParams.get('request') === 'GetMap' && !u.searchParams.get('layers')!.startsWith('RADAR_COVERAGE')).map((u) => u.searchParams.get('time')));
  expect(times.size).toBeLessThan(10);

  // Now goes back to the newest frame.
  await page.click('#now-button');
  await expect(page.locator('body')).toHaveAttribute('data-radar-frame', typeNewest);

  // Save for offline: radar can be ticked like any layer and saves what its
  // source allows, with a note (the card, Kaden Nov 22).
  await page.click('#settings-button');
  await page.locator('#save-data').click();
  await expect(page.locator('.ofl-card')).toBeVisible();
  await page.locator('.ofl-handle').click();
  await expect(page.locator('.ofl-row', { hasText: 'Radar' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/radar-save.png' });
  await page.locator('.ofl-close').click();
  await expect(page.locator('.ofl-card')).toBeHidden();
});
