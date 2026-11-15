import { expect, test } from '@playwright/test';

// M0 checks against live data, so they assert structure and save screenshots
// for review rather than comparing pixels. Pixel baselines start in M1, with
// weather requests answered from fixtures.

test('hello map draws the base map, terrain and HRDPS precipitation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-weather', 'ready');
  await expect(page.locator('#status')).toContainText('HRDPS precipitation');
  await expect(page.locator('#status')).toContainText(/\d\dZ run · \d+ [hd] old/);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.waitForFunction(() => document.body.dataset.idle === 'true');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/screens/m0-hello-map.png' });
  expect(errors).toEqual([]);
});

test('status pill sits 8 px below the safe area and inside the screen edges', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('#status').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBe(8);
  expect(box!.x).toBe(16);
  expect(box!.width).toBe(390 - 32);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('phone test page runs every check', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/spike.html');
  await page.click('#run');
  await expect(page.locator('body')).toHaveAttribute('data-done', 'true', { timeout: 200_000 });
  const out = (await page.textContent('#out')) ?? '';
  expect(out).not.toContain('FAILED');
  expect(out).toMatch(/region file: 48 steps/);
  await page.screenshot({ path: 'test-results/screens/m0-phone-tests.png', fullPage: true });
});
