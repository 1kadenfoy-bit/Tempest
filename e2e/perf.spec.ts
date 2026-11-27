import { expect, test, type Page } from './fixtures';

// The lasting speed checks (Performance section, docs/wishes/performance.md).
// GitHub's machines draw the map in software, many times slower than a phone,
// so frame rates are measured on the phone with ?perf, not here. What is
// checked here holds on any machine:
// - untouched, the app does no work: no redraws, no downloads (rule 6);
// - hidden, it does nothing at all (rule 6);
// - going round the layers again and again does not keep taking memory (rule 7);
// - the work a tap starts before the screen can answer stays short (rules 4 and 5),
//   with room for the slow machine.
// Each prints its numbers, so a change shows in the log before it fails.

test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });
const HOME = '/?insets=47,34';

type MapHandle = {
  on(e: string, f: () => void): void;
  off(e: string, f: () => void): void;
  isMoving(): boolean;
  areTilesLoaded(): boolean;
  loaded(): boolean;
};
type Win = { tempestMap: MapHandle; renders?: number };

/**
 * Loaded and still. (Wind's map picture is not waited for: the recorded set
 * of Nov 20 lacks the pieces the wind layer now reads, docs/tasks/test-upkeep.md.)
 */
async function settled(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  if (await page.locator('body').getAttribute('data-layer') !== 'wind') await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 90_000 });
  await expect(page.locator('.pin-readout')).toHaveAttribute('data-loading', 'false', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const m = (window as unknown as Win).tempestMap;
    return document.body.dataset.idle === 'true' && m.loaded() && !m.isMoving() && m.areTilesLoaded();
  }, undefined, { timeout: 60_000 });
  // Late pieces and fades finish within a second or two after "idle".
  await page.waitForTimeout(2500);
}

async function pick(page: Page, name: string) {
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).last().click();
  await expect(page.locator('#layer-name')).toHaveText(name);
}

/** Map redraws, downloads and long stalls (over 50 ms) of the page during `ms`. */
async function quiet(page: Page, ms: number) {
  const requests: string[] = [];
  const onRequest = (r: { url(): string }) => requests.push(r.url());
  page.on('request', onRequest);
  const inPage = await page.evaluate((wait) => new Promise<{ renders: number; longTasks: number }>((done) => {
    const m = (window as unknown as Win).tempestMap;
    let renders = 0;
    let longTasks = 0;
    const count = () => { renders++; };
    const obs = new PerformanceObserver((l) => { longTasks += l.getEntries().length; });
    obs.observe({ type: 'longtask' });
    m.on('render', count);
    setTimeout(() => { m.off('render', count); obs.disconnect(); done({ renders, longTasks }); }, wait);
  }), ms);
  page.off('request', onRequest);
  return { ...inPage, requests };
}

test('untouched, the app does no work; hidden, nothing at all', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(HOME);
  await settled(page);
  for (const name of ['Precipitation', 'Temperature']) {
    if (name !== 'Precipitation') { await pick(page, name); await settled(page); }
    const q = await quiet(page, 5000);
    console.log(`${name}, untouched for 5 s: ${q.renders} map redraws, ${q.requests.length} downloads, ${q.longTasks} long stalls`);
    expect(q.renders, `${name}: the map redraws while untouched`).toBe(0);
    expect(q.requests, `${name}: downloads while untouched`).toEqual([]);
    expect(q.longTasks, `${name}: work while untouched`).toBe(0);
  }

  // Wind animates its streaks while shown; once the app is hidden, everything stops.
  await pick(page, 'Wind');
  await settled(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1000);
  const hidden = await quiet(page, 5000);
  console.log(`Wind, hidden for 5 s: ${hidden.renders} map redraws, ${hidden.requests.length} downloads, ${hidden.longTasks} long stalls`);
  expect(hidden.renders, 'the map redraws while the app is hidden').toBe(0);
  expect(hidden.requests, 'downloads while the app is hidden').toEqual([]);
});

test('going round the layers again and again does not keep taking memory', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(HOME);
  await settled(page);
  const cdp = await page.context().newCDPSession(page);
  const heapMB = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    return usedSize / 1e6;
  };
  const round = async () => {
    for (const name of ['Temperature', 'Wind', 'Precipitation']) { await pick(page, name); await settled(page); }
  };
  // The first round loads each layer's data once: kept on purpose (memory caches).
  await round();
  const first = await heapMB();
  for (let k = 0; k < 3; k++) await round();
  const after = await heapMB();
  console.log(`script memory after one round of the layers: ${first.toFixed(1)} MB; after three more: ${after.toFixed(1)} MB`);
  // Three more rounds of the same data should need no more memory; 10 MB of
  // room for the browser's own variation. A leak grows by tens of MB a round.
  expect(after - first).toBeLessThan(10);
});

test('the work a tap starts stays short', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(HOME);
  await settled(page);
  // The browser's own timing of each tap: from the press to the end of the
  // app's handling of it (before the screen is drawn). On the phone this is
  // most of what makes a tap feel slow; here the machine is a few times slower.
  await page.evaluate(() => {
    const w = window as unknown as { taps: { name: string; ms: number }[] };
    w.taps = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as PerformanceEventTiming[]) {
        if (e.name === 'click' || e.name === 'pointerup' || e.name === 'pointerdown') w.taps.push({ name: e.name, ms: e.processingEnd - e.processingStart });
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  });
  const taps: Record<string, number> = {};
  const timed = async (label: string, act: () => Promise<void>) => {
    await page.evaluate(() => { (window as unknown as { taps: unknown[] }).taps.length = 0; });
    await act();
    await page.waitForTimeout(600);
    taps[label] = await page.evaluate(() => Math.max(0, ...(window as unknown as { taps: { ms: number }[] }).taps.map((t) => t.ms)));
  };
  await timed('layer menu', () => page.click('#layer-button'));
  await timed('switch to Temperature', () => page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name: 'Temperature' }).last().click());
  await settled(page);
  await timed('map panel', () => page.click('#map-layers'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel')).toHaveCount(0);
  await timed('sheet up', () => page.click('#sheet-handle'));
  await timed('sheet down', () => page.click('#sheet-handle'));
  await timed('model menu', () => page.click('#model-pill'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel')).toHaveCount(0);
  await timed('tap the map', () => page.mouse.click(250, 330));
  console.log(`work started by each tap (ms): ${JSON.stringify(Object.fromEntries(Object.entries(taps).map(([k, v]) => [k, Math.round(v)])))}`);
  // Kaden's rules: a tap answers in 0.1 to 0.2 s, a layer switch in under
  // 1 s. On this slower machine the app's own work for one tap must stay
  // within those times; anything above is felt on the phone too.
  for (const [label, ms] of Object.entries(taps)) {
    expect(ms, label).toBeLessThan(label.startsWith('switch') ? 1000 : 200);
  }
});
