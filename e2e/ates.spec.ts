import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page, reportDir } from './fixtures';

// Terrain complexity (ATES) inside the avalanche layer. Avalanche Canada's
// answers are stubbed: the bulletins from the saved Nov 17 answers, and the
// ATES area files from saved real ones (Longworth, id 533, has every kind of
// piece). No loops against the live service: every KMZ request is answered
// here and counted. The pin's weather forecast is not waited for.
//
// The Sea to Sky screenshots use real KMZ files saved by
// `node tools/ates-index.mjs --keep=DIR`: set ATES_KMZ_DIR=DIR to take them.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'], serviceWorkers: 'block' });

const avy = (name: string) => readFileSync(new URL(`../adapters/avalanche-canada/fixtures/${name}`, import.meta.url), 'utf8');
const KMZ: Record<number, Buffer> = { 533: readFileSync(new URL('../adapters/avalanche-canada/fixtures/ates-533-2026-11-17.kmz', import.meta.url)) };
const KMZ_DIR = process.env.ATES_KMZ_DIR;
const SHOTS = reportDir('ates');
type W = { tempestMap: import('maplibre-gl').Map };
// The wait for the area's zones: measured under a slowed browser, the file is
// fetched, read and drawn within about 5 s, but drawing the zones without a
// graphics chip (GitHub's machines) can keep the page too busy to answer for
// well over 20 s. The check is unchanged; only the patience is longer.
const ZONES_WAIT = 45_000;


async function stub(context: BrowserContext) {
  const kmz: number[] = [];
  const json = (body: string) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  await context.route('**/api.avalanche.ca/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/forecasts/en/areas') return r.fulfill(json(avy('areas-2026-11-17.json')));
    if (u.pathname === '/forecasts/en/products') return r.fulfill(json(avy('products-2026-11-17.json')));
    if (u.pathname === '/min/submissions') return r.fulfill(json('[]'));
    return r.fulfill({ status: 404, body: '' });
  });
  await context.route('**/avcan-services-api.prod.avalanche.ca/ates/**', (r) => {
    const id = Number(/areas\/(\d+)\.kmz$/.exec(r.request().url())?.[1]);
    kmz.push(id);
    const file = KMZ[id] ?? (KMZ_DIR && existsSync(`${KMZ_DIR}/${id}.kmz`) ? readFileSync(`${KMZ_DIR}/${id}.kmz`) : null);
    if (!file) return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return r.fulfill({ status: 200, contentType: 'application/vnd.google-earth.kmz', headers: { 'access-control-allow-origin': '*' }, body: file });
  });
  await context.route('**/collections/weather-alerts/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 }) }));
  return kmz;
}

async function open(page: Page, prefs: Record<string, unknown> = { layer: 'avalanche' }) {
  await page.addInitScript((p) => {
    if (sessionStorage.getItem('ates-seeded')) return;
    sessionStorage.setItem('ates-seeded', '1');
    localStorage.setItem('tempest.prefs.v1', JSON.stringify(p));
  }, prefs);
  await page.goto('/?insets=47,34');
  await expect(page.locator('#layer-name')).toHaveText('Avalanche');
  await expect(page.locator('body')).toHaveAttribute('data-avalanche-map', 'ready', { timeout: 45_000 });
  // The app flies to the phone's location first; jumping before that ends would be undone.
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => !(window as unknown as W).tempestMap.isMoving());
  await page.waitForTimeout(500);
}

const jump = (page: Page, center: [number, number], zoom: number) =>
  page.evaluate(([c, z]) => (window as unknown as W).tempestMap.jumpTo({ center: c as [number, number], zoom: z as number }), [center, zoom] as const);

/** Features of one map layer drawn on screen now. */
const rendered = (page: Page, layer: string) => page.evaluate((l) => (window as unknown as W).tempestMap.queryRenderedFeatures({ layers: [l] }).map((f) => f.properties), layer);

/** A screen point on a zone of `rating`, clear of points and lines, for a tap. */
const zonePoint = (page: Page, rating: string) => page.evaluate((want) => {
  const m = (window as unknown as W).tempestMap;
  const { width, height } = m.getCanvas().getBoundingClientRect();
  for (let y = 140; y < height - 360; y += 9) {
    for (let x = 30; x < width - 30; x += 9) {
      const z = m.queryRenderedFeatures([x, y], { layers: ['ates-zone-fill'] })[0];
      if (z?.properties.rating !== want) continue;
      const near = m.queryRenderedFeatures([[x - 14, y - 14], [x + 14, y + 14]], { layers: ['ates-decision', 'ates-points', 'ates-rated-line', 'ates-path', 'ates-route'] });
      if (!near.length) return { x, y };
    }
  }
  return null;
}, rating);

async function tapMap(page: Page, p: { x: number; y: number }) {
  const box = (await page.locator('#map').boundingBox())!;
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

test('ATES: the round button, outlines, zones on demand, taps', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const kmz = await stub(context);
  await open(page);

  // Off by default; the round button shows only with the avalanche layer.
  const button = page.locator('#ates-toggle');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).toHaveAttribute('data-ates', 'off');

  // On: the areas' outlines from the shipped index; no area file asked for at this zoom.
  await jump(page, [-121.43, 53.95], 8);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-ates', 'on');
  await expect(page.locator('body')).toHaveAttribute('data-ates-index', /^\d{3}$/);
  await expect.poll(async () => (await rendered(page, 'ates-outline')).map((p) => p.name)).toContain('Longworth');
  await expect(page.locator('#legend-row')).toContainText('Zoom in for zones');
  await expect(page.locator('#legend-row .legend-ates')).toContainText('Simple');
  expect(kmz).toEqual([]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/outlines.png` });

  // A tap inside the outline names the area and offers to zoom in.
  const inside = await page.evaluate(() => (window as unknown as W).tempestMap.project([-121.425, 53.955]));
  await tapMap(page, inside);
  const area = page.getByRole('dialog', { name: 'Longworth' });
  await expect(area).toBeVisible();
  await expect(area).toContainText('Complex:');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/area.png` });
  await area.getByRole('button', { name: 'Zoom in to see the zones' }).click();
  await expect(area).toBeHidden();

  // Closer in: the area's file is asked for once, and its zones are drawn in the publisher's classes.
  await expect(page.locator('body')).toHaveAttribute('data-ates-areas', /533/, { timeout: ZONES_WAIT });
  await expect.poll(async () => (await rendered(page, 'ates-zone-fill')).length).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const zones = await rendered(page, 'ates-zone-fill');
  expect(new Set(zones.map((z) => z.rating))).toEqual(new Set(['simple', 'challenging', 'complex']));
  // The icons come from the file and follow the zones.
  await expect.poll(async () => (await rendered(page, 'ates-points')).map((p) => p.pointKind)).toContain('cabin');
  await expect.poll(async () => (await rendered(page, 'ates-decision')).length).toBe(1);
  expect((await rendered(page, 'ates-path')).length).toBeGreaterThan(0);
  expect(kmz.filter((id) => id === 533)).toHaveLength(1);
  expect(kmz.length).toBeLessThanOrEqual(3);
  await expect(page.locator('#legend-row .legend-ates')).toContainText('Challenging');
  await expect(page.locator('#legend-row .legend-ates')).toContainText('Complex');
  // The danger fill fades under the zones; the danger outlines stay.
  expect(await page.evaluate(() => JSON.stringify((window as unknown as W).tempestMap.getPaintProperty('avy-fill', 'fill-opacity')))).toContain('0.12');
  await page.screenshot({ path: `${SHOTS}/zones.png` });

  // A tap on a complex zone: the class and its meaning, as published.
  const p = await zonePoint(page, 'complex');
  expect(p).not.toBeNull();
  await tapMap(page, p!);
  const zone = page.getByRole('dialog', { name: 'Complex terrain' });
  await expect(zone).toBeVisible();
  await expect(zone.locator('.panel-caption')).toHaveText('Zone in Longworth');
  await expect(zone).toContainText('Complex (3)');
  await expect(zone.getByRole('link', { name: 'Open the Trip Planner on avalanche.ca' })).toHaveAttribute('href', 'https://avalanche.ca/planning/trip-planner');
  await expect(zone).toContainText('Avalanche Canada');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/zone-panel.png` });
  await zone.getByRole('button', { name: 'Close' }).click();

  // A tap on the decision point: its concerns and how to manage them, as published.
  const dp = await page.evaluate(() => {
    const m = (window as unknown as W).tempestMap;
    const f = m.querySourceFeatures('ates').find((x) => x.properties.pointKind === 'decision-point')!;
    return m.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
  });
  await tapMap(page, dp);
  const point = page.getByRole('dialog', { name: 'Decision Point' });
  await expect(point).toBeVisible();
  await expect(point.locator('.panel-caption')).toHaveText('Decision point in Longworth');
  await expect(point).toContainText('CONCERN');
  await expect(point).toContainText('Regroup, assess conditions, and reassess trip plans.');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/decision-point.png` });
  await point.getByRole('button', { name: 'Close' }).click();

  // The same switch in the layer settings; off hides everything again.
  await page.locator('#sheet-handle').click();
  await page.locator('#layer-settings').click();
  const settings = page.getByRole('switch', { name: 'Terrain complexity (ATES)' });
  await expect(settings).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/settings.png` });
  await settings.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as unknown as W).tempestMap.getLayoutProperty('ates-zone-fill', 'visibility'))).toBe('none');
  expect(errors).toEqual([]);
});

test('ATES: hidden with other layers; light theme and 3D drape', async ({ page, context }) => {
  await stub(context);
  await open(page, { layer: 'avalanche', theme: 'light', terrain3d: true, layerSettings: { avalanche: { ates: true } } });
  await expect(page.locator('#ates-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-ates-index', /^\d{3}$/);
  const said: string[] = [];
  page.on('console', (m) => { if (/ATES|ates/i.test(m.text())) said.push(m.text().slice(0, 160)); });
  await page.evaluate(() => (window as unknown as W).tempestMap.jumpTo({ center: [-121.43, 53.952], zoom: 12.6, pitch: 55, bearing: -20 }));
  // On a failure, say what the app was doing (seen only on GitHub's machines so far).
  await expect(page.locator('body')).toHaveAttribute('data-ates-areas', /533/, { timeout: ZONES_WAIT }).catch(async (err: unknown) => {
    const state = await page.evaluate(() => ({ ...document.body.dataset, zoom: (window as unknown as W).tempestMap.getZoom(), center: (window as unknown as W).tempestMap.getCenter() }));
    console.log('ATES state', JSON.stringify(state), 'said', JSON.stringify(said));
    throw err;
  });
  expect(await page.evaluate(() => !!(window as unknown as W).tempestMap.getTerrain())).toBe(true);
  await expect.poll(async () => (await rendered(page, 'ates-zone-fill')).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/light-3d.png` });

  // Another layer: the button and the terrain ratings go away.
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name: 'Temperature' }).click();
  await expect(page.locator('#ates-toggle')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-ates', 'off');
});

test('ATES: Sea to Sky (real saved files, when given)', async ({ page, context }) => {
  test.skip(!KMZ_DIR, 'set ATES_KMZ_DIR to the folder tools/ates-index.mjs --keep wrote');
  await stub(context);
  await open(page, { layer: 'avalanche', layerSettings: { avalanche: { ates: true } } });
  await jump(page, [-123.1, 49.85], 8.6);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/sea-to-sky-outlines.png` });
  await jump(page, [-123.17, 50.12], 11.4);
  await expect(page.locator('body')).toHaveAttribute('data-ates-areas', /356/, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/brandywine.png` });
  await jump(page, [-123.02, 49.8], 12);
  await expect(page.locator('body')).toHaveAttribute('data-ates-areas', /516|478/, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/elfin-lakes.png` });
});
