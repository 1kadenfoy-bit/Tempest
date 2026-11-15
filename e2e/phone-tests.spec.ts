import { expect, test } from '@playwright/test';

test('phone test page runs every check', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/spike.html');
  await page.click('#run');
  await expect(page.locator('body')).toHaveAttribute('data-done', 'true', { timeout: 200_000 });
  const out = (await page.textContent('#out')) ?? '';
  expect(out).not.toContain('FAILED');
  expect(out).toMatch(/region file: 48 steps/);
  await page.screenshot({ path: 'test-results/screens/phone-tests.png', fullPage: true });
});
