import { expect, test } from '@playwright/test';

test('phone test page runs every check', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/spike.html');
  await page.click('#run');
  await expect(page.locator('body')).toHaveAttribute('data-done', 'true', { timeout: 200_000 });
  const out = (await page.textContent('#out')) ?? '';
  expect(out).not.toContain('FAILED');
  expect(out).toMatch(/region file: 48 steps/);
  // M2 acceptance: the pin's numbers match Open-Meteo's point forecast for the
  // same model. Skipped where the point API refuses this machine (daily limit).
  const checks = [...out.matchAll(/point check (.+?): (\d+) h compared, (\d+) within 0\.1 mm/g)];
  console.log(out.split('\n').filter((l) => l.startsWith('point check')).join('\n'));
  if (!out.includes('Open-Meteo refused')) {
    expect(checks.length).toBe(3);
    for (const [, , hours, within] of checks) expect(Number(within) / Number(hours)).toBeGreaterThanOrEqual(0.9);
  }
  await page.screenshot({ path: 'test-results/screens/phone-tests.png', fullPage: true });
});
