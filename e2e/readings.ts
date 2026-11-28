// What the app shows for the pin, read the same way by every test that
// compares the app with itself (consistency, signal, new run): the readout,
// the summaries, the week, the legend, the age and a fingerprint of the
// chart. Moved out of e2e/consistency.spec.ts (Nov 28) so the sequence tests
// read exactly what it reads.
import { expect, type Page } from './fixtures';

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
export const YOU = { latitude: 49.3895, longitude: -122.948 };
export const HOME = '/?insets=47,34';

export type MapHandle = {
  jumpTo(o: object): void;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  isMoving(): boolean;
  areTilesLoaded(): boolean;
  loaded(): boolean;
};
export const jump = (page: Page, o: object) => page.evaluate((v) => (window as unknown as { tempestMap: MapHandle }).tempestMap.jumpTo(v), o);

/** What `readings` reads, as a plain function so it can also run inside the page (see `steady`). */
export function readNow() {
  const text = (sel: string) => document.querySelector(sel)?.textContent?.trim();
  // The pin's place name comes from the nearest map label, which depends on
  // the labels drawn at that zoom: the weather and the height are compared.
  const el = document.querySelector('.pin-readout .readout-text');
  let readout: string | undefined;
  if (el) {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelector('.pin-name')?.remove();
    readout = c.textContent?.replace(/^\s*·\s*/, '').trim();
  }
  const canvas = document.querySelector('#chart-canvas') as HTMLCanvasElement | null;
  let chart = '';
  if (canvas) {
    const d = canvas.toDataURL();
    let h = 0;
    for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
    chart = `${canvas.width}x${canvas.height}:${h}`;
  }
  return {
    layer: text('#layer-name'),
    readout,
    place: text('#place-text'),
    time: text('#cursor-time'),
    note: text('#cursor-note'),
    age: text('#run-age')?.split(' · ')[0],
    before: text('#summary-before'),
    beforeLabel: text('#summary-before-label'),
    after: text('#summary-after'),
    afterLabel: text('#summary-after-label'),
    week: text('#week-days'),
    legend: text('#legend-row'),
    chart,
  };
}

/**
 * Everything the app shows for the pin at the cursor, as text, and a fingerprint of the chart's pixels.
 * Read in one go: on the Wind layer the streaks redraw the map every frame, and GitHub's
 * machines draw in software, so each separate read waited a second or more for the page
 * (one reading took about 50 s there, and the test ran out of time; Nov 28).
 */
export const readings = (page: Page) => page.evaluate(readNow);

/**
 * The readings once they stop changing: the same twice, 1.5 s apart, with
 * nothing still loading ("…"). Parts of a forecast arrive one after another,
 * and a comparison made between two of them would blame the wrong thing.
 * The whole wait runs inside the page (Nov 28): on the Wind layer every call
 * from the test waits for a turn of the page, which the streaks keep busy, so
 * each separate read cost seconds on top of the 1.5 s. The 1.5 s spacing, the
 * loading test and the 20 tries are the same as before.
 */
export async function steady(page: Page) {
  return page.evaluate(async (src) => {
    const read = new Function(`return (${src})`)() as typeof readNow;
    let last = read();
    for (let k = 0; k < 20; k++) {
      await new Promise((r) => setTimeout(r, 1500));
      const now = read();
      const loading = !now.readout || [now.readout, now.before, now.after].some((t) => t?.includes('…'));
      if (!loading && JSON.stringify(now) === JSON.stringify(last)) return now;
      last = now;
    }
    return last;
  }, readNow.toString());
}

/** The map has drawn, the pin's forecast is in, and nothing is on its way. */
export async function settled(page: Page) {
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
export async function pick(page: Page, name: string) {
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).last().click();
  await expect(page.locator('#layer-name')).toHaveText(name);
}

/** Drag the chart left by a share of its width: forward in time. */
export async function dragChart(page: Page, share: number) {
  const c = (await page.locator('#chart').boundingBox())!;
  await page.mouse.move(c.x + c.width * (0.5 + share / 2), c.y + 30);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * (0.5 - share / 2), c.y + 30, { steps: 8 });
  await page.mouse.up();
}

