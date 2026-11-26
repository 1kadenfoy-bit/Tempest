import { expect, test, type Page } from './fixtures';

// App settings (M9): units, theme, saved data only, credits. Asserts on the
// legend, labels and settings state rather than live forecast numbers, so it
// holds when the forecast service is busy.
const YOU = { latitude: 49.3895, longitude: -122.948 };
const HOME = '/?insets=47,34';

test.use({ geolocation: YOU, permissions: ['geolocation'] });

async function started(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-pin', 'ready', { timeout: 45_000 });
  await page.waitForFunction(() => document.body.dataset.idle === 'true', undefined, { timeout: 45_000 });
}

async function openSettings(page: Page) {
  await page.click('#map-layers');
  const mapPanel = page.getByRole('dialog', { name: 'Map' });
  await expect(mapPanel).toBeVisible();
  await mapPanel.getByRole('button', { name: 'App settings' }).click();
  const panel = page.getByRole('dialog', { name: 'App settings' });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(400);
  return panel;
}

/** Pick a condition layer once no other panel is still closing. */
async function pickLayer(page: Page, name: string) {
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.click('#layer-button');
  await page.getByRole('dialog', { name: 'Condition layer' }).getByRole('button', { name }).click();
  await expect(page.locator('#layer-name')).toHaveText(name);
}

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.sheet')!).backgroundColor);

test('units: imperial everywhere, remembered', async ({ page }) => {
  await page.goto(HOME);
  await started(page);
  await expect(page.locator('.legend-range')).toHaveText('0.1 to 6+ mm/h');

  const panel = await openSettings(page);
  await expect(panel.getByRole('button', { name: 'Metric' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Imperial' }).click();
  await expect(panel.getByRole('button', { name: 'Imperial' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // Precipitation legend in inches an hour; the pin's height in feet.
  await expect(page.locator('.legend-range')).toHaveText('0.004 to 0.24+ in/h');
  await expect(page.locator('#place-text')).toContainText(/ ft$/);

  // Temperature legend in °F; wind legend in mph.
  await pickLayer(page, 'Temperature');
  await expect(page.locator('.legend-unit')).toHaveText('°F');
  await expect(page.locator('.legend-ticks span')).toHaveText(['−4', '14', '32', '50', '68 °F']);
  await pickLayer(page, 'Wind');
  await expect(page.locator('.legend-ticks span').last()).toHaveText('37+ mph');

  // Layer settings follow too: the calm thresholds in mph.
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.click('#sheet-handle');
  await page.click('#layer-settings');
  const wind = page.getByRole('dialog', { name: 'Wind settings' });
  await expect(wind.getByRole('button', { name: '16 mph' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await started(page);
  await expect(page.locator('.legend-ticks span').last()).toHaveText('37+ mph');
  await expect(page.locator('html')).toHaveAttribute('data-units', 'imperial');
});

test('theme: light from the tokens, remembered; credits from the sources', async ({ page }) => {
  await page.goto(HOME);
  await started(page);
  const dark = await background(page);
  expect(dark).toBe('rgba(17, 21, 26, 0.96)');

  const panel = await openSettings(page);
  await expect(panel.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await background(page)).toBe('rgba(255, 255, 255, 0.96)');
  expect(await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content)).toBe('#E6EAE2');
  // The map's ground follows the theme.
  const ground = await page.evaluate(() => String((window as unknown as { tempestMap: { getPaintProperty(l: string, p: string): unknown } }).tempestMap.getPaintProperty('background', 'background-color')));
  expect(ground.toLowerCase()).toBe('#e6eae2');

  // Credits: generated from each source's metadata.
  // Folded away at the bottom until asked for.
  const credits = panel.locator('a[data-credit]');
  await expect(credits.first()).toBeHidden();
  await panel.getByRole('button', { name: 'Credits and licences' }).click();
  await expect(credits.first()).toBeVisible();
  const text = (await credits.allTextContents()).join(' | ');
  expect(text).toContain('Open-Meteo');
  expect(text).toContain('Environment and Climate Change Canada');
  expect(text).toContain('OpenStreetMap');
  expect(text).toContain('Mapterhorn');

  // "Saved data only" is gone from settings (Kaden, Nov 22).
  await expect(panel.getByRole('switch', { name: 'Saved data only' })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.reload();
  await started(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await background(page)).toBe('rgba(255, 255, 255, 0.96)');

  // Match phone follows the phone's setting.
  await page.emulateMedia({ colorScheme: 'dark' });
  const again = await openSettings(page);
  await again.getByRole('button', { name: 'Match phone' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('save for offline: draw the area, pull the card up, save; the bell tells the story', async ({ page }) => {
  await page.goto(HOME);
  await started(page);
  const panel = await openSettings(page);
  // Settings close and the Save for offline card comes up over the home screen.
  await panel.locator('#save-data').click();
  const card = page.locator('.ofl-card');
  await expect(card).toBeVisible();
  await expect(page.locator('.ofl-summary')).toContainText('Trace a closed shape');
  await expect(page.locator('.sheet')).toBeHidden();

  // There is no starting area: the user traces one with a finger.
  const pts: [number, number][] = [[120, 300], [200, 260], [280, 300], [300, 380], [240, 440], [160, 430], [110, 370], [118, 305]];
  await page.mouse.move(...pts[0]!);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ofl-summary')).toContainText(/Area .* km² · map /);

  // Partly up, like the weather card: the Save button is at the bottom without pulling the card up.
  await expect(card).toHaveAttribute('data-state', 'peek');
  await expect(page.locator('.ofl-go')).toBeVisible();
  await expect(page.locator('.ofl-frame')).toBeVisible();

  // Redraw removes the tracing at once and waits for a new one.
  await page.locator('.ofl-redraw').click();
  await expect(page.locator('.ofl-summary')).toContainText('Trace a closed shape');
  expect(await page.evaluate(() => (window as unknown as { tempestMap: { getSource(id: string): { _data?: { features?: unknown[] } } | undefined } }).tempestMap.getSource('save-shape')?._data?.features?.length ?? 0)).toBe(0);
  await page.mouse.move(...pts[0]!);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ofl-summary')).toContainText(/Area .* km² · map /);

  // Pulled up: the time frame, every layer, and the total on the Save button.
  await page.locator('.ofl-handle').click();
  await expect(card).toHaveAttribute('data-state', 'up');
  await expect(page.locator('.ofl-row')).toHaveCount(6);
  await expect(page.locator('.ofl-frame')).toBeVisible();
  await expect(page.locator('.ofl-go')).toContainText(/Save data · [\d.]+ [kM]B/);

  // Save: back to the home screen, and the bell says a download started, then that it finished.
  await page.locator('.ofl-go').click();
  await expect(card).toBeHidden();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('#alert-badge')).toHaveAttribute('data-unread', 'true');
  await page.click('#alert-badge');
  const centre = page.getByRole('dialog', { name: 'Notification Centre' });
  await expect(centre.locator('.notice-words').first()).toContainText(/Download started|Saved for offline/);
  await expect(centre.locator('.notice-words', { hasText: 'Saved for offline' })).toBeVisible({ timeout: 20_000 });
});
