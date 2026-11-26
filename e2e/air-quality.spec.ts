import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from './fixtures';

// The Air quality layer with every air source stubbed from saved real answers:
// - ECCC RAQDPS (10 km): a real answer from Nov 18, 2026 (clean air: GeoMet
//   keeps only the last two days, so there is no smoky ECCC answer to save);
// - CAMS global via Open-Meteo (about 40 km): real hourly August 2026 values
//   around Manning Park, for the smoky days;
// - ECCC AQHI and BC Wildfire Service fires and perimeters: real answers from
//   Nov 18, 2026 (the fire list holds the whole season, so August's fires are
//   found by their issued dates).
// The page's clock is set to the day shown. The weather layers' own data is
// not stubbed and not waited for.
const MANNING = { latitude: 49.07, longitude: -120.8 };
test.use({ geolocation: MANNING, permissions: ['geolocation'], serviceWorkers: 'block' });

const SHOTS = 'docs/reports/air-quality';
mkdirSync(SHOTS, { recursive: true });
const file = (dir: string, name: string) => readFileSync(new URL(`../adapters/${dir}/fixtures/${name}`, import.meta.url));
const json = (dir: string, name: string) => JSON.parse(file(dir, name).toString('utf8'));
const CORS = { 'access-control-allow-origin': '*' };

/** The recorded CAMS values (repacked), answered in Open-Meteo's own shape for the asked places and days. */
const cams = json('openmeteo-air', 'cams-manning-2026-08.json') as { requested: [number, number][]; time: string[]; pm2_5: (number | null)[][] };
function camsAnswer(url: URL) {
  const lats = url.searchParams.get('latitude')!.split(',').map(Number);
  const lons = url.searchParams.get('longitude')!.split(',').map(Number);
  const from = `${url.searchParams.get('start_date')}T00:00`, to = `${url.searchParams.get('end_date')}T23:00`;
  const idx = cams.time.flatMap((t, i) => (t >= from && t <= to ? [i] : []));
  const time = idx.map((i) => cams.time[i]!);
  const nearest = (a: number, o: number) => {
    // A pin's cell centre is asked for directly; a place outside the record has no values.
    const k = cams.requested.findIndex(([x, y]) => Math.abs(x - a) < 1e-6 && Math.abs(y - o) < 1e-6);
    return k < 0 ? time.map(() => null) : idx.map((i) => cams.pm2_5[k]![i]!);
  };
  const out = lats.map((a, k) => ({ latitude: a, longitude: lons[k], hourly_units: { time: 'iso8601', pm2_5: 'μg/m³' }, hourly: { time, pm2_5: nearest(a, lons[k]!) } }));
  return out.length === 1 ? out[0] : out;
}

async function stub(context: BrowserContext, opts: { aqhi: boolean }) {
  const asked: string[] = [];
  await context.route('**/geo.weather.gc.ca/geomet**', (r) => {
    const u = new URL(r.request().url());
    const q = (k: string) => u.searchParams.get(k) ?? u.searchParams.get(k.toUpperCase()) ?? '';
    const layer = q('layer') || q('coverageId') || q('layers');
    if (!layer.startsWith('RAQDPS')) return r.fallback();
    asked.push(`${q('request')} ${layer}`);
    if (q('request') === 'GetCapabilities') return r.fulfill({ contentType: 'text/xml', headers: CORS, body: file('eccc-geomet', `caps-${layer}-2026-11-18.xml`).toString('utf8') });
    if (q('request') === 'GetCoverage') return r.fulfill({ contentType: 'image/tiff', headers: CORS, body: file('eccc-geomet', `wcs-${layer}-manning-2026-11-18T12.tif`) });
    // A point: the recorded value, for the hour and run asked.
    const one = json('eccc-geomet', `gfi-${layer}-manning-2026-11-18T12.json`);
    one.features[0].properties.time = q('time');
    one.features[0].properties.dim_reference_time = q('dim_reference_time');
    return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(one) });
  });
  const empty = { type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 };
  await context.route('**/api.weather.gc.ca/collections/aqhi-observations-realtime/**', (r) => r.fulfill({ contentType: 'application/json', headers: CORS, body: opts.aqhi ? file('eccc-aqhi', 'observations-manning-2026-11-18.json') : JSON.stringify(empty) }));
  await context.route('**/api.weather.gc.ca/collections/aqhi-forecasts-realtime/**', (r) => r.fulfill({ contentType: 'application/json', headers: CORS, body: opts.aqhi ? file('eccc-aqhi', 'forecasts-JCVCC-2026-11-18.json') : JSON.stringify(empty) }));
  await context.route('**/api.weather.gc.ca/collections/weather-alerts/**', (r) => r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(empty) }));
  await context.route('**/openmaps.gov.bc.ca/geo/pub/wfs**', (r) => {
    const u = new URL(r.request().url());
    asked.push(`WFS ${u.searchParams.get('typeName')}`);
    const polys = (u.searchParams.get('typeName') ?? '').includes('POLYS');
    return r.fulfill({ contentType: 'application/json', headers: CORS, body: file('bc-wildfire', polys ? 'fire-perimeters-manning-2026-11-18.json' : 'fire-points-manning-2026-11-18.json') });
  });
  await context.route('**/air-quality-api.open-meteo.com/**', (r) => {
    asked.push('CAMS');
    return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(camsAnswer(new URL(r.request().url()))) });
  });
  return asked;
}

/** Open on the Air quality layer at Manning Park, with the chosen source. */
async function open(page: Page, at: string, source: 'eccc' | 'cams', zoom = 8) {
  await page.clock.setFixedTime(new Date(at));
  await page.addInitScript(([src, z]) => {
    localStorage.setItem('tempest.prefs.v1', JSON.stringify({ layer: 'air-quality', layerModels: { 'air-quality': src }, lastPin: { lng: -120.8, lat: 49.07, label: 'Manning Park' } }));
    (window as unknown as { __zoom: number }).__zoom = Number(z);
  }, [source, String(zoom)] as const);
  await page.goto('/?insets=47,34');
  await expect(page.locator('#layer-name')).toHaveText('Air quality', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-pin', /pending|ready/, { timeout: 45_000 });
  await page.evaluate((z) => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.jumpTo({ center: [-120.9, 49.15], zoom: z }), zoom);
}

/** Close the sheet's details, if open, and let the map settle. */
const settle = (page: Page, ms = 1500) => page.waitForTimeout(ms);

test('air quality: a smoky August hour (CAMS, recorded) with the fires burning that day', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const asked = await stub(context, { aqhi: false });
  await open(page, '2026-08-10T00:30:00Z', 'cams');
  await expect(page.locator('#model-pill')).toHaveText('CAMS');
  await expect(page.locator('body')).toHaveAttribute('data-air-series', 'ready', { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-air-fill', 'ready', { timeout: 30_000 });
  // The cursor sits on the hour of Aug 10, 00Z (Sun 5 PM in BC).
  await expect(page.locator('#cursor-time')).toHaveText('Sun 5 PM');
  // The pin reads CAMS's cell over Manning: 83.6 µg/m³ at that hour.
  await expect(page.locator('.readout-text')).toContainText('84 µg/m³');
  // The pin shows only name · value · elevation, no source note (Kaden's interface rule, Nov 21).
  // Fires burning on Aug 9 (BC date) by their issued dates; Pasayten River among them.
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-air-fires'))).toBeGreaterThan(5);
  await expect(page.locator('#legend-row')).toContainText('PM2.5 µg/m³');
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/smoky-aug10-cams.png` });

  // The fire's panel: as issued, with today's status and the day's flag.
  const at = await page.evaluate(() => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.project([-120.5624, 49.0016]));
  const box = (await page.locator('#map').boundingBox())!;
  const pinBefore = await page.locator('#place-text').textContent();
  await page.mouse.click(box.x + at.x, box.y + at.y);
  const panel = page.getByRole('dialog', { name: /Pasayten River/ });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.panel-caption')).toHaveText('Wildfire K61186 · as issued');
  await expect(panel.locator('.avy-facts')).toContainText('Status (latest)Out');
  await expect(panel.locator('.avy-facts')).toContainText('Size500 ha');
  await expect(panel.locator('.avy-facts')).toContainText('DiscoveredJul 24, 2026');
  await expect(panel.locator('.avy-facts')).toContainText('Declared outSep 28, 2026');
  await expect(panel.locator('.avy-facts')).toContainText('Fire centreKamloops');
  await expect(panel.locator('.avy-flag')).toContainText('was burning on');
  await expect(panel.getByRole('link', { name: /BC Wildfire Service’s map/ })).toHaveAttribute('href', 'https://wildfiresituation.nrs.gov.bc.ca/incidents?fireYear=2026&incidentNumber=K61186');
  expect(await page.locator('#place-text').textContent()).toBe(pinBefore);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/fire-panel.png` });
  await panel.getByRole('button', { name: 'Close' }).click();

  // The details: the value, the AQHI (none recorded for August), the fires near the pin.
  await page.locator('#sheet-handle').click();
  await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
  const details = page.locator('.details');
  await expect(details).toContainText('84 µg/m³');
  await expect(details).toContainText('A model forecast, not a measurement.');
  await expect(details).toContainText(/wildfires? burning within 50 km (now|on Sun)/);
  await expect(details).toContainText('No AQHI station within 100 km');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/details-aug10.png` });
  await page.locator('#sheet-handle').click();

  // Wider: the smoke across southern BC.
  await page.evaluate(() => (window as unknown as { tempestMap: import('maplibre-gl').Map }).tempestMap.jumpTo({ center: [-120.8, 49.5], zoom: 7 }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/smoky-aug10-cams-wide.png` });
  expect(asked.filter((a) => a === 'CAMS').length).toBeLessThan(8);
  expect(errors).toEqual([]);
});

test('air quality: a quiet late-August day (CAMS, recorded): little smoke, fewer fires', async ({ page, context }) => {
  await stub(context, { aqhi: false });
  await open(page, '2026-08-30T18:30:00Z', 'cams');
  await expect(page.locator('body')).toHaveAttribute('data-air-series', 'ready', { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-air-fill', 'ready', { timeout: 30_000 });
  await expect(page.locator('#cursor-time')).toHaveText('Sun 11 AM');
  const value = Number((await page.locator('.readout-text').textContent())!.match(/([\d.]+) µg/)![1]);
  expect(value).toBeLessThan(15);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/quiet-aug30-cams.png` });
});

test('air quality: ECCC (recorded Nov 18 answer), AQHI as issued, source menu, settings and the save panel', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const asked = await stub(context, { aqhi: true });
  await open(page, '2026-11-18T12:30:00Z', 'eccc', 7);
  await expect(page.locator('#model-pill')).toHaveText('ECCC');
  await expect(page.locator('#run-age')).toHaveText('00Z run · 12 h old');
  await expect(page.locator('body')).toHaveAttribute('data-air-series', 'ready', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-air-fill', 'ready', { timeout: 30_000 });
  // The recorded point value (smoke at Manning, 12Z) for the cursor's hour, from ECCC's 10 km grid.
  // The pin shows only name · value · elevation, no source note (Kaden's interface rule, Nov 21).
  await expect(page.locator('.readout-text')).toContainText(/\d+ µg\/m³/);
  // The cursor steps through ECCC's hours: two days back to the newest run's end.
  expect(asked.filter((a) => a.startsWith('GetCoverage')).length).toBeGreaterThan(0);
  // Nov 18: no fire burning near Manning.
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/eccc-nov18.png` });

  // AQHI, as issued.
  await page.locator('#sheet-handle').click();
  const details = page.locator('.details');
  await expect(details).toContainText('AQHI 1 · Low risk, observed at Eastern Fraser Valley');
  await expect(details).toContainText('ECCC’s value 1.41 · as issued');
  await expect(details).toContainText(/Forecast AQHI \d · \w+ risk for Wed 4 AM/);
  await expect(details).toContainText('No wildfires burning within 50 km now');
  await expect(page.locator('.footer-lines')).toContainText('ECCC RAQDPS (FireWork) · 10 km cells · 00Z run · 12 h old');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/details-eccc-aqhi.png` });

  // Settings: all PM2.5 instead of smoke only.
  await page.locator('#layer-settings').click();
  const settings = page.getByRole('dialog', { name: 'Air quality settings' });
  await expect(settings).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/settings.png` });
  await settings.getByRole('button', { name: 'All PM2.5' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();
  // The pin shows only name · value · elevation, no source note (Kaden's interface rule, Nov 21).
  await expect(page.locator('.readout-text')).toContainText(/\d+ µg\/m³/, { timeout: 60_000 });
  await page.locator('#sheet-handle').click();

  // The source menu: Auto first (Kaden's interface rule, Nov 21), then ECCC (chosen here) and CAMS.
  await page.locator('#model-pill').click();
  const sources = page.getByRole('dialog', { name: 'Source' });
  await expect(sources.locator('.model-name')).toHaveText(['Auto', 'ECCC RAQDPS (FireWork)', 'CAMS global']);
  await expect(sources.locator('.model-row', { hasText: 'ECCC RAQDPS' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/source-menu.png` });
  await sources.getByRole('button', { name: 'Close' }).click();

  // The layer menu lists Air quality.
  await page.click('#layer-button');
  const menu = page.getByRole('dialog', { name: 'Condition layer' });
  await expect(menu.getByRole('button', { name: 'Air quality' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/layer-menu.png` });
  await menu.getByRole('button', { name: 'Close' }).click();
  expect(errors).toEqual([]);
});
