import { expect, test, type Page } from './fixtures';

// 3D terrain and 3D buildings (map panel, TERRAIN group). Nothing here waits
// for the forecast: the switches, the tilt and the draped layers work without
// it. Screenshots go to test-results/screens/3d-*.png.
//
// TEMPEST_3D_MEASURE=1 also runs the frame-time measurement for
// docs/spikes/3d-terrain.md (slow under the software GPU).

test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

type MapHandle = {
  getTerrain(): unknown;
  getPitch(): number;
  getBearing(): number;
  getZoom(): number;
  getLayer(id: string): { implementation?: Record<string, unknown> } | undefined;
  jumpTo(o: object): void;
  triggerRepaint(): void;
  isMoving(): boolean;
  loaded(): boolean;
  areTilesLoaded(): boolean;
  queryRenderedFeatures(o: object): unknown[];
  on(e: string, f: () => void): void;
  off(e: string, f: () => void): void;
  once(e: string): Promise<unknown>;
};
type Win = { tempestMap: MapHandle };
const onMap = <T>(page: Page, fn: (m: MapHandle, arg: unknown) => T, arg: unknown = null) =>
  page.evaluate(({ src, a }) => {
    const m = (window as unknown as Win).tempestMap;
    return new Function('m', 'a', `return (${src})(m, a)`)(m, a) as T;
  }, { src: fn.toString(), a: arg });

async function mapReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as Win).tempestMap?.loaded() && document.body.dataset.idle === 'true', null, { timeout: 60_000 });
}
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as Win).tempestMap;
    return !m.isMoving() && m.areTilesLoaded();
  }, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
}
// The open map panel (a closing one can still be in the page for a moment).
const mapPanel = (page: Page) => page.locator('.panel[data-open="true"][aria-label="Map"]');
/** Press a button in the map panel, then close it. 3D on is the View switch's "3D" (named "3D terrain"), off is its "2D". */
async function toggle(page: Page, name: string) {
  await page.click('#map-layers');
  const panel = mapPanel(page);
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

test('3D terrain: switch, tilt, back to flat, remembered', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?insets=47,34');
  await mapReady(page);

  // Off by default: flat, no terrain, no north button.
  expect(await onMap(page, (m) => m.getTerrain())).toBeNull();
  await expect(page.locator('#reset-view')).toBeHidden();
  await page.click('#map-layers');
  const panel = mapPanel(page);
  await expect(panel.getByRole('button', { name: '3D terrain' })).toHaveAttribute('aria-pressed', 'false');
  // 3D buildings is greyed out in 2D (Kaden's interface rule 8a, Nov 20).
  await expect(panel.getByRole('button', { name: '3D buildings' })).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.getByRole('button', { name: '3D buildings' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await toggle(page, '3D terrain');
  await expect(page.locator('body')).toHaveAttribute('data-terrain3d', 'true');
  expect(await onMap(page, (m) => m.getTerrain())).not.toBeNull();
  // Turning it on tilts the map, and the north button appears.
  await page.waitForFunction(() => (window as unknown as Win).tempestMap.getPitch() > 50);
  await expect(page.locator('#reset-view')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-tilted', 'true');

  // Mt Seymour from the south-west, turned, with the precipitation fill (if any falls) draped.
  await onMap(page, (m) => m.jumpTo({ center: [-122.96, 49.37], zoom: 11.6, pitch: 60, bearing: 35 }));
  await settle(page);
  // A reference picture only (no check reads it). Under GitHub's software GPU
  // one tilted frame takes about a minute, which pushed this test past its
  // limit; it is taken everywhere else.
  if (!process.env.CI) await page.screenshot({ path: 'test-results/screens/3d-terrain.png' });

  // The north button brings it back flat and north up.
  await page.click('#reset-view');
  await page.waitForFunction(() => { const m = (window as unknown as Win).tempestMap; return m.getPitch() === 0 && m.getBearing() === 0; });
  await expect(page.locator('#reset-view')).toBeHidden();

  // Remembered.
  await page.reload();
  await mapReady(page);
  expect(await onMap(page, (m) => m.getTerrain())).not.toBeNull();

  // Off again (the View switch's 2D): no terrain, flat.
  await onMap(page, (m) => m.jumpTo({ pitch: 40 }));
  await toggle(page, '2D');
  await expect(page.locator('body')).toHaveAttribute('data-terrain3d', 'false');
  expect(await onMap(page, (m) => m.getTerrain())).toBeNull();
  await page.waitForFunction(() => (window as unknown as Win).tempestMap.getPitch() === 0);
  expect(errors).toEqual([]);
});

test('3D buildings: downtown Vancouver, raised by height', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?insets=47,34');
  await mapReady(page);
  // Buildings are a 3D option: 3D first (Kaden's interface rule 8a, Nov 20).
  await toggle(page, '3D terrain');
  await toggle(page, '3D buildings');
  expect(await onMap(page, (m) => Boolean(m.getLayer('buildings-3d')))).toBe(true);
  await onMap(page, (m) => m.jumpTo({ center: [-123.1195, 49.2835], zoom: 15.5, pitch: 60, bearing: -30 }));
  await settle(page);
  const n = await onMap(page, (m) => m.queryRenderedFeatures({ layers: ['buildings-3d'] }).length);
  expect(n).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/screens/3d-buildings.png' });
  expect(errors).toEqual([]);
});

test('report: temperature fill on 3D terrain, and frame times', async ({ page }) => {
  // Needs the forecast (map files; no point API), so only on request.
  test.skip(!process.env.TEMPEST_3D_MEASURE, 'report and measurement only on request');
  test.setTimeout(900_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tempest.prefs.v1', JSON.stringify({ layer: 'temperature' }));
  });
  await page.goto('/?insets=47,34');
  await mapReady(page);
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 300_000 });
  const results: Record<string, unknown> = {};
  await onMap(page, (m) => m.jumpTo({ center: [-122.96, 49.37], zoom: 11.6 }));
  await settle(page);
  results['flat, turning'] = await measureAt(page, 'turn', 0);
  results['flat, fill changing'] = await measureAt(page, 'fill', 0);
  await toggle(page, '3D terrain');
  await settle(page);
  results['3D 55°, turning'] = await measureAt(page, 'turn', 55);
  results['3D 55°, fill changing'] = await measureAt(page, 'fill', 55);

  // The picture: north from above Seymour towards the Sea to Sky peaks.
  await onMap(page, (m) => m.jumpTo({ center: [-123.0, 49.47], zoom: 10.7, pitch: 60, bearing: -15 }));
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => document.body.dataset.idle === 'true', null, { timeout: 120_000 });
  await settle(page);
  await page.waitForTimeout(4000);
  await settle(page);
  await page.screenshot({ path: 'test-results/screens/3d-terrain-fill.png' });

  // Without a fill.
  await onMap(page, (m) => { (m.getLayer('temperature-grid')!.implementation as { visible: boolean }).visible = false; });
  results['3D 55°, no fill, turning'] = await measureAt(page, 'turn', 55);
  console.log(`3D-MEASURE ${JSON.stringify(results)}`);
});

/**
 * Frames while the camera turns (every frame redrawn), or while the fill
 * itself changes every frame (draped tiles redrawn, as during a time change):
 * wall time between frames, and draped-tile draws per frame.
 */
function measureAt(page: Page, mode: string, pitch: number) {
  return onMap(page, async (m, a) => {
    type Draw = (gl: WebGL2RenderingContext, ...rest: unknown[]) => void;
    const fill = m.getLayer('temperature-grid')!.implementation as unknown as Record<string, Draw> & { drape: { changed(map: unknown): void } };
    const o = a as { mode: string; pitch: number };
    // Each fill draw, timed to completion: a one-pixel read before and after
    // waits for the GPU (gl.finish alone does not in Chromium).
    const px = new Uint8Array(4);
    const sync = (gl: WebGL2RenderingContext) => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const calls: Record<string, number[]> = { render: [], renderToTerrainTile: [] };
    let frameFill = 0;
    let frameTiles = 0;
    const origs: Record<string, Draw> = {};
    for (const name of ['render', 'renderToTerrainTile']) {
      const orig = fill[name]!;
      origs[name] = orig;
      fill[name] = function (this: unknown, gl: WebGL2RenderingContext, ...rest: unknown[]) {
        sync(gl);
        const t0 = performance.now();
        orig.call(this, gl, ...rest);
        sync(gl);
        const ms = performance.now() - t0;
        calls[name]!.push(ms);
        frameFill += ms;
        if (name === 'renderToTerrainTile') frameTiles++;
      };
    }
    const frames: number[] = [];
    const fillMs: number[] = [];
    const tiles: number[] = [];
    let last = performance.now();
    let i = 0;
    const N = 25;
    await new Promise<void>((done) => {
      const step = () => {
        const t = performance.now();
        if (i > 0) { frames.push(t - last); fillMs.push(frameFill); tiles.push(frameTiles); }
        last = t; frameFill = 0; frameTiles = 0;
        if (++i > N) { m.off('render', step); done(); return; }
        if (o.mode === 'turn') m.jumpTo({ center: [-122.96, 49.37], zoom: 11.6, pitch: o.pitch, bearing: i * 2 });
        else fill.drape.changed(m);
      };
      m.on('render', step);
      m.jumpTo({ center: [-122.96, 49.37], zoom: 11.6, pitch: o.pitch, bearing: 0 });
    });
    for (const name in origs) fill[name] = origs[name]!;
    const med = (x: number[]) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return Math.round(y[y.length >> 1]! * 10) / 10; };
    const mean = (x: number[]) => Math.round((x.reduce((p, q) => p + q, 0) / Math.max(1, x.length)) * 10) / 10;
    return {
      frameMsMedian: med(frames),
      fillMsPerFrameMean: mean(fillMs),
      flatDrawMsMedian: med(calls.render!),
      tileDrawMsMedian: med(calls.renderToTerrainTile!),
      tileDrawsPerFrameMean: mean(tiles),
    };
  }, { mode, pitch });
}
