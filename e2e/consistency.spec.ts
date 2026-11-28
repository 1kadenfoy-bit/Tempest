import { expect, test, type Page } from './fixtures';
import { useRecordedWeather } from './recorded';

// Is the number on screen the right one? These tests check that what the app
// shows depends only on what should change it (the pin, the time, the layer,
// the settings), never on how the map is looked at, the order things were
// tapped in, or the phone's time zone. They run on recorded weather, so the
// same answers come every time, and compare the app with itself: a value that
// changes when it should not is a bug, whatever the value is.

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
const YOU = { latitude: 49.3895, longitude: -122.948 };
test.use({ geolocation: YOU, permissions: ['geolocation'] });
const HOME = '/?insets=47,34';

type MapHandle = {
  jumpTo(o: object): void;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  isMoving(): boolean;
  areTilesLoaded(): boolean;
  loaded(): boolean;
};
const jump = (page: Page, o: object) => page.evaluate((v) => (window as unknown as { tempestMap: MapHandle }).tempestMap.jumpTo(v), o);

/** Everything the app shows for the pin at the cursor, as text, and a fingerprint of the chart's pixels. */
async function readings(page: Page) {
  // The pin's place name comes from the nearest map label, which depends on
  // the labels drawn at that zoom: the weather and the height are compared.
  const readout = await page.locator('.pin-readout .readout-text').evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelector('.pin-name')?.remove();
    return c.textContent?.replace(/^\s*·\s*/, '').trim();
  });
  const text = (sel: string) => page.locator(sel).first().textContent().then((t) => t?.trim());
  const chart = await page.locator('#chart-canvas').evaluate((c) => {
    const d = (c as HTMLCanvasElement).toDataURL();
    let h = 0;
    for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
    return `${(c as HTMLCanvasElement).width}x${(c as HTMLCanvasElement).height}:${h}`;
  });
  return {
    layer: await text('#layer-name'),
    readout,
    place: await text('#place-text'),
    time: await text('#cursor-time'),
    note: await text('#cursor-note'),
    age: (await text('#run-age'))?.split(' · ')[0],
    before: await text('#summary-before'),
    beforeLabel: await text('#summary-before-label'),
    after: await text('#summary-after'),
    afterLabel: await text('#summary-after-label'),
    week: await text('#week-days'),
    legend: await text('#legend-row'),
    chart,
  };
}

/**
 * The readings once they stop changing: the same twice, 1.5 s apart, with
 * nothing still loading ("…"). Parts of a forecast arrive one after another,
 * and a comparison made between two of them would blame the wrong thing.
 */
async function steady(page: Page) {
  let last = await readings(page);
  for (let k = 0; k < 20; k++) {
    await page.waitForTimeout(1500);
    const now = await readings(page);
    const loading = !now.readout || [now.readout, now.before, now.after].some((t) => t?.includes('…'));
    if (!loading && JSON.stringify(now) === JSON.stringify(last)) return now;
    last = now;
  }
  return last;
}

/** The map has drawn, the pin's forecast is in, and nothing is on its way. */
async function settled(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  // (Not data-series-complete: the recorded set lacks some later models' hours
  // for temperature, so the app keeps asking for them; what it has is shown.)
  await expect(page.locator('.pin-readout')).toHaveAttribute('data-loading', 'false', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const m = (window as unknown as { tempestMap: MapHandle }).tempestMap;
    return document.body.dataset.idle === 'true' && m.loaded() && !m.isMoving() && m.areTilesLoaded();
  }, undefined, { timeout: 60_000 });
  // The sheet's chart and texts are redrawn a frame or two after the data lands.
  await page.waitForTimeout(300);
}

/** Pick a layer the way a finger does: the menu, then its tile. */
async function pick(page: Page, name: string) {
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).last().click();
  await expect(page.locator('#layer-name')).toHaveText(name);
}

/** Drag the chart left by a share of its width: forward in time. */
async function dragChart(page: Page, share: number) {
  const c = (await page.locator('#chart').boundingBox())!;
  await page.mouse.move(c.x + c.width * (0.5 + share / 2), c.y + 30);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * (0.5 - share / 2), c.y + 30, { steps: 8 });
  await page.mouse.up();
}

test('zooming, panning and tilting the map never change the numbers', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HOME);
  await settled(page);
  // A few hours ahead, so the values come from a forecast step, not the first hour.
  await dragChart(page, 0.4);
  await expect(page.locator('#cursor-note')).toHaveText(/^in \d+ h$/);
  const home = await page.evaluate(() => {
    const m = (window as unknown as { tempestMap: MapHandle }).tempestMap;
    const c = m.getCenter();
    return { center: [c.lng, c.lat], zoom: m.getZoom() };
  });

  for (const name of ['Precipitation', 'Temperature', 'Wind']) {
    if (name !== 'Precipitation') await pick(page, name);
    await settled(page);
    const first = await steady(page);
    expect(first.readout, `${name}: a value at the pin`).toMatch(/\d|Dry|Calm/);

    // Close in on the pin, far out over BC, and off to one side tilted: the
    // weather picture is redrawn each time, the numbers must not move.
    for (const view of [
      { center: [YOU.longitude, YOU.latitude], zoom: 14.5 },
      { center: [-123.5, 50.5], zoom: 6.5 },
      { center: [home.center[0]! + 0.15, home.center[1]! - 0.08], zoom: home.zoom + 1, pitch: 50, bearing: 40 },
    ]) {
      await jump(page, view);
      await page.waitForTimeout(200);
      await settled(page);
      expect(await steady(page), `${name} after moving the map to ${JSON.stringify(view)}`).toEqual(first);
    }
    await jump(page, { ...home, pitch: 0, bearing: 0 });
  }
  expect(errors).toEqual([]);
});

test('quick taps end on the last choice: layers, pin and time', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HOME);
  await settled(page);

  // The answers reached slowly, one step at a time. (Precipitation for the
  // dropped pin: the recorded set holds the point forecast for your location
  // only, and precipitation reads the map files elsewhere.)
  const rainAtYou = await steady(page);
  await pick(page, 'Temperature');
  await settled(page);
  const tempAtYou = await steady(page);
  await pick(page, 'Precipitation');
  await settled(page);
  expect(await steady(page), 'precipitation again').toEqual(rainAtYou);
  await page.mouse.click(250, 330);
  await settled(page);
  const rainThere = await steady(page);
  expect(rainThere.place, 'the tap moved the pin').not.toBe(rainAtYou.place);
  await page.click('#locate');
  await settled(page);
  expect(await steady(page), 'back at your location').toEqual(rainAtYou);

  // Layers chosen one after another without waiting: what each started
  // loading must not land on top of the last one chosen.
  for (const name of ['Temperature', 'Wind', 'Precipitation', 'Wind', 'Temperature']) await pick(page, name);
  await settled(page);
  expect(await steady(page), 'temperature after quick layer changes').toEqual(tempAtYou);
  await expect(page.locator('body')).toHaveAttribute('data-layer', 'temperature');
  await pick(page, 'Precipitation');
  await settled(page);

  // The pin dropped in three places one after another: the last place wins.
  await page.mouse.click(120, 300);
  await page.mouse.click(300, 420);
  await page.mouse.click(250, 330);
  await settled(page);
  expect(await steady(page), 'the last tapped place').toEqual(rainThere);

  // Time dragged ahead, then Now: the same hour and the same numbers as before.
  await page.click('#locate');
  await settled(page);
  await dragChart(page, 0.6);
  await expect(page.locator('#cursor-note')).toHaveText(/^in \d+ h$/);
  await page.click('#now-button');
  await settled(page);
  expect(await steady(page), 'back at now').toEqual(rainAtYou);
  expect(errors).toEqual([]);
});

test('the phone’s time zone does not change the times or days shown', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.goto(HOME);
  await settled(page);
  await page.click('#sheet-handle');
  await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
  const inBc = { ...(await readings(page)), cards: await page.locator('.details .card-title').allTextContents() };

  // The same app on a phone set to Tokyo time, on the same recorded weather and clock.
  const tokyo = await browser.newContext({
    timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: YOU, permissions: ['geolocation'],
  });
  try {
    await useRecordedWeather(tokyo);
    const other = await tokyo.newPage();
    await other.goto(HOME);
    await settled(other);
    await other.click('#sheet-handle');
    await expect(other.locator('body')).toHaveAttribute('data-details', 'ready');
    const inTokyo = { ...(await readings(other)), cards: await other.locator('.details .card-title').allTextContents() };
    expect(inTokyo).toEqual(inBc);
  } finally {
    await tokyo.close();
  }
});

test('the data’s age matches the run and the clock', async ({ page }) => {
  await page.goto(HOME);
  await settled(page);
  await page.click('#sheet-handle');
  await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
  // "HRDPS · 18Z run, 6 h old": the run's hour, and how old it is by the page's clock.
  const footer = (await page.locator('.details-footer').textContent()) ?? '';
  const m = footer.match(/(\d\d)Z run, (\d+) h old/);
  expect(m, footer).not.toBeNull();
  const now = await page.evaluate(() => Date.now());
  const run = new Date(now);
  run.setUTCMinutes(0, 0, 0);
  run.setUTCHours(Number(m![1]));
  if (run.getTime() > now) run.setUTCDate(run.getUTCDate() - 1);
  const hours = Math.floor((now - run.getTime()) / 3_600_000);
  expect(Number(m![2])).toBe(hours);
  // The top bar says the same age.
  await expect(page.locator('#run-age')).toHaveText(new RegExp(`^${hours} h old · `));
});

test('imperial units show the same weather, converted', async ({ page, context }) => {
  test.setTimeout(180_000);
  const temp = (t: string) => Number(t.replace('−', '-').match(/-?\d+/)![0]);
  await page.goto(HOME);
  await pick(page, 'Temperature');
  await settled(page);
  await steady(page); // parts of a forecast still land after "ready" on a slow machine (seen Nov 28: 1 km/h, then 5)
  const c = (await page.locator('.readout-text strong').textContent())!;
  const high = (await page.locator('#summary-before').textContent())!;
  await pick(page, 'Wind');
  await settled(page);
  await steady(page);
  const kmh = (await page.locator('.readout-text strong').textContent())!;
  const gusts = (await page.locator('#summary-before').textContent())!;

  await context.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem('tempest.prefs.v1') ?? '{}') as Record<string, unknown>;
    localStorage.setItem('tempest.prefs.v1', JSON.stringify({ ...p, units: 'imperial' }));
  });
  await page.reload();
  await settled(page);
  await steady(page);
  const mph = (await page.locator('.readout-text strong').textContent())!;
  const gustsMph = (await page.locator('#summary-before').textContent())!;
  await pick(page, 'Temperature');
  await settled(page);
  await steady(page);
  const f = (await page.locator('.readout-text strong').textContent())!;
  const highF = (await page.locator('#summary-before').textContent())!;
  console.log(`${c} = ${f}; ${high} = ${highF}; ${kmh} = ${mph}; ${gusts} = ${gustsMph}`);

  // Each shown number is rounded: a °C shown can be up to half a degree off,
  // nine tenths of a °F once converted, plus the °F's own rounding.
  expect(f).toMatch(/°F$/);
  expect(Math.abs(temp(f) - (temp(c) * 9 / 5 + 32))).toBeLessThanOrEqual(1.4);
  const [hiC, loC] = [...high.matchAll(/[+−-]?\d+/g)].map((m) => temp(m[0]));
  const [hiF, loF] = [...highF.matchAll(/[+−-]?\d+/g)].map((m) => temp(m[0]));
  expect(Math.abs(hiF! - (hiC! * 9 / 5 + 32))).toBeLessThanOrEqual(1.4);
  expect(Math.abs(loF! - (loC! * 9 / 5 + 32))).toBeLessThanOrEqual(1.4);
  expect(mph).toMatch(/mph$|Calm/);
  if (!/Calm/.test(kmh)) expect(Math.abs(temp(mph) - temp(kmh) / 1.609344)).toBeLessThanOrEqual(1);
  expect(Math.abs(temp(gustsMph) - temp(gusts) / 1.609344)).toBeLessThanOrEqual(1);
});
