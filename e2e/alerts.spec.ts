import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from './fixtures';

// M9 alerts: the badge and panel with ECCC's alerts stubbed from saved real
// answers (the live alerts change by the hour). Does not wait for the pin's
// forecast, so it runs when Open-Meteo is unreachable.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'], serviceWorkers: 'block' });

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../adapters/eccc-alerts/fixtures/${name}`, import.meta.url), 'utf8')) as {
  features: { properties: Record<string, string | null> }[]; timeStamp: string;
};

/** A real yellow snowfall warning and a real special weather statement, moved to the present so they have not expired. */
function twoAlerts() {
  const warning = fixture('lethbridge-2026-11-17.json');
  const statement = fixture('calgary-2026-11-17.json');
  const shift = Date.now() - new Date(warning.timeStamp).getTime();
  const features = [...statement.features, ...warning.features].map((f) => {
    const p = { ...f.properties };
    for (const k of ['publication_datetime', 'expiration_datetime', 'validity_datetime', 'event_end_datetime']) {
      if (p[k]) p[k] = new Date(new Date(p[k]!).getTime() + shift).toISOString();
    }
    return { ...f, properties: p };
  });
  return { ...warning, features, numberMatched: features.length, numberReturned: features.length };
}

async function stub(context: BrowserContext, body: unknown) {
  const asked: string[] = [];
  await context.route('**/api.weather.gc.ca/collections/weather-alerts/**', (r) => {
    asked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return asked;
}

test('alerts at the pin: badge with the count, panel with one row per alert as issued', async ({ page, context }) => {
  const asked = await stub(context, twoAlerts());
  await page.goto('/?insets=47,34');
  const badge = page.locator('#alert-badge');
  await expect(badge).toBeVisible({ timeout: 45_000 });
  await expect(badge).toHaveText('2');
  // The badge is a 44 px round button at the left of the top bar.
  const b = (await badge.boundingBox())!;
  expect(b).toMatchObject({ x: 16, width: 44, height: 44 });
  // The pin's point, without shapes.
  const q = new URL(asked[0]!).searchParams;
  expect(q.get('bbox')).toBe('-122.94810,49.38990,-122.94790,49.39010');
  expect(q.get('skipGeometry')).toBe('true');

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screens/m9-alert-badge.png' });
  await badge.click();
  const panel = page.getByRole('dialog', { name: 'Weather alerts' });
  await expect(panel).toBeVisible();
  const rows = panel.locator('.alert-row');
  await expect(rows).toHaveCount(2);
  // Most severe first: the yellow warning, then the statement (no colour level).
  await expect(rows.nth(0).locator('.alert-title')).toHaveText('snowfall warning');
  await expect(rows.nth(0).locator('.alert-level')).toHaveText('yellow warning');
  await expect(rows.nth(0).locator('.alert-area')).toHaveText('City of Lethbridge');
  await expect(rows.nth(0).locator('.alert-times')).toHaveText(/^Issued \w{3} \d{1,2}(:\d\d)? [AP]M · Expires \w{3} \d{1,2}(:\d\d)? [AP]M$/);
  await expect(rows.nth(1).locator('.alert-title')).toHaveText('special weather statement');
  // ECCC's legend colours: yellow for the warning, grey for the statement.
  expect(await rows.nth(0).locator('.alert-swatch').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 0)');
  expect(await rows.nth(1).locator('.alert-swatch').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(219, 219, 219)');
  const link = rows.nth(0).getByRole('link', { name: 'Read on weather.gc.ca' });
  await expect(link).toHaveAttribute('href', 'https://weather.gc.ca/warnings/index_e.html?prov=ab');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(panel.locator('.alert-source')).toHaveText(/^Environment and Climate Change Canada · fetched \d{1,2}:\d\d [AP]M$/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m9-alerts.png' });
});

test('no alerts at the pin: a plain badge with no count, and a panel that says so', async ({ page, context }) => {
  const asked = await stub(context, fixture('north-shore-2026-11-17.json'));
  await page.goto('/?insets=47,34');
  await expect(page.locator('body')).toHaveAttribute('data-alerts', '0', { timeout: 45_000 });
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  const badge = page.locator('#alert-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-count', '0');
  await expect(badge.locator('.alert-count')).toBeHidden();
  await badge.click();
  const panel = page.getByRole('dialog', { name: 'Weather alerts' });
  await expect(panel.locator('.alert-none')).toHaveText('No alerts in force at the pin.');
  await expect(panel.locator('.alert-source')).toContainText('Environment and Climate Change Canada');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screens/m9-alerts-none.png' });
});
