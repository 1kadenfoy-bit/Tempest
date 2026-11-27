import { expect, test, type Page, reportDir } from './fixtures';

// The forecast summary window: press-and-hold on the map (or a right click)
// moves the pin there and opens every chosen layer's chart, on one time line.

// Mt Seymour area, where the v8 screens place "You · 1,180 m".
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });
// Live data for now: the starter recording (Nov 19) was made while the point
// API's daily limit was spent, so it lacks the longer models the window reads.
// Back to recorded weather once a fuller set is recorded (Data section).
test.use({ weather: 'live' });
const HOME = '/?insets=47,34';
const SHOTS = reportDir('summary');

// No live weather alerts: a real one would add the badge and change the pictures.
test.beforeEach(async ({ context }) => {
  await context.route('**/collections/weather-alerts/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 }) }));
});

async function ready(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
}

/** Hold the mouse still on the map for most of a second. */
async function hold(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}

const win = (page: Page) => page.getByRole('dialog', { name: 'Forecast summary' });
const strips = (page: Page) => win(page).locator('.summary-strip');
const stripIds = (page: Page) => strips(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.layer));

async function stripsReady(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-summary', 'ready', { timeout: 90_000 });
  await page.waitForTimeout(400);
}

test('press-and-hold moves the pin and opens three strips by default', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HOME);
  await ready(page);
  await hold(page, 200, 300);
  await expect(win(page)).toBeVisible();
  // The pin moved there, as a tap moves it.
  await expect(page.locator('#place-text')).not.toContainText('Your location');
  expect(await stripIds(page)).toEqual(['precipitation', 'temperature', 'wind']);
  await stripsReady(page);
  // Each strip: the layer's name, its readout at the cursor and its chart.
  await expect(strips(page).nth(0).locator('.card-title')).toHaveText('PRECIPITATION');
  await expect(strips(page).nth(1).locator('.strip-value')).toHaveText(/°C/);
  await expect(strips(page).nth(2).locator('.strip-value')).toHaveText(/km\/h|Calm/);
  await expect(win(page).locator('.summary-footer')).toContainText(/HRDPS · \d\dZ run · \d+ [hd] old/);
  // The window's span is the sheet's: 48 h.
  await expect(win(page).getByRole('button', { name: '48 h' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/01-summary-dark.png` });
  expect(errors).toEqual([]);
});

test('dragging the shared time line moves the app’s one cursor', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  const before = await page.locator('#cursor-time').textContent();
  await hold(page, 200, 300);
  await stripsReady(page);
  const c = (await strips(page).nth(1).locator('.summary-chart').boundingBox())!;
  await page.mouse.move(c.x + c.width * 0.8, c.y + 30);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.3, c.y + 30, { steps: 10 });
  await page.mouse.up();
  const shown = win(page).locator('.summary-time');
  await expect(shown).not.toHaveText(before!);
  await expect(win(page).locator('.summary-time-note')).toHaveText(/^in \d+ h$/);
  const moved = await shown.textContent();
  await page.screenshot({ path: `${SHOTS}/02-summary-moved.png` });
  // The window's span changes the sheet's too.
  await win(page).getByRole('button', { name: '24 h' }).click();
  await win(page).getByRole('button', { name: 'Close' }).click();
  await expect(win(page)).toBeHidden();
  // The map and sheet are left at that hour.
  await expect(page.locator('#cursor-time')).toHaveText(moved!);
  await expect(page.locator('#window-label')).toHaveText('24 h');
});

test('settings add and remove a layer, remembered after a reload', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await hold(page, 200, 300);
  await expect(win(page)).toBeVisible();
  await page.click('#summary-settings');
  const settings = page.getByRole('dialog', { name: 'Summary settings' });
  await expect(settings).toBeVisible();
  // Every layer whose chart works at the pin; radar is not offered.
  const titles = await settings.locator('.check-title').allTextContents();
  expect(titles.slice(0, 4)).toEqual(['Precipitation', 'Temperature', 'Wind', 'Avalanche']);
  expect(titles).not.toContain('Radar');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/03-summary-settings.png` });
  await settings.getByText('Wind').click();
  await settings.getByText('Avalanche').click();
  await settings.getByRole('button', { name: 'Close' }).click();
  // Back to the window, with the strips chosen.
  await expect(win(page)).toBeVisible();
  expect(await stripIds(page)).toEqual(['precipitation', 'temperature', 'avalanche']);
  await stripsReady(page);
  await page.screenshot({ path: `${SHOTS}/04-summary-with-avalanche.png` });
  await page.reload();
  await ready(page);
  // A right click opens it on a computer.
  await page.mouse.click(200, 300, { button: 'right' });
  await expect(win(page)).toBeVisible();
  expect(await stripIds(page)).toEqual(['precipitation', 'temperature', 'avalanche']);
});

test('a tap still just moves the pin', async ({ page }) => {
  await page.goto(HOME);
  await ready(page);
  await page.mouse.click(120, 300);
  await expect(page.locator('#place-text')).not.toContainText('Your location');
  await page.waitForTimeout(800);
  await expect(win(page)).toHaveCount(0);
  // A drag across the map pans it; it never opens the window, even held a while.
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(260, 360, { steps: 5 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(win(page)).toHaveCount(0);
});

test('opens from the foot of the details too; light theme, imperial units', async ({ page, context }) => {
  await context.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem('tempest.prefs.v1') ?? '{}') as Record<string, unknown>;
    localStorage.setItem('tempest.prefs.v1', JSON.stringify({ ...p, theme: 'light', units: 'imperial' }));
  });
  await page.goto(HOME);
  await ready(page);
  await page.click('#sheet-handle');
  await expect(page.locator('body')).toHaveAttribute('data-details', 'ready');
  // The details redraw as data comes in; the click finds the button as it is then (and scrolls to it).
  await page.locator('#summary-open').click();
  await expect(win(page)).toBeVisible();
  await stripsReady(page);
  await expect(strips(page).nth(1).locator('.strip-value')).toHaveText(/°F/);
  await expect(strips(page).nth(2).locator('.strip-value')).toHaveText(/mph|Calm/);
  await page.screenshot({ path: `${SHOTS}/05-summary-light-imperial.png` });
});
