// The effects lab page (effects.html): the wind particles draw over 3D terrain,
// follow the sliders, and stop asking for frames when paused.
import { expect, test } from './fixtures';

test('wind particles draw, follow the wind, and stop when paused', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/effects.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#wind-text')).toHaveText(/From W 280° · 36 km\/h/);
  await expect(page.locator('#fps')).toContainText('streaks');
  // Clouds: a readout of their cover and height, and the sliders change it.
  await expect(page.locator('#cloud-text')).toContainText('Low 40% 1.2 km');
  await page.locator('#s-coverLow').fill('80');
  await expect(page.locator('#cloud-text')).toContainText('Low 80% 1.2 km');

  // The wind slider turns the readout and the arrow.
  await page.locator('#s-speedKmh').fill('80');
  await page.locator('#s-fromDeg').fill('0');
  await expect(page.locator('#wind-text')).toHaveText(/From N 0° · 80 km\/h/);
  await expect(page.locator('#arrow')).toHaveAttribute('style', /rotate\(165deg/);

  // Paused: no more frames are requested (the readout says so, and the layer stops its loop).
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#fps')).toHaveText('paused');
  const frames = await page.evaluate(() => new Promise<number>((resolve) => {
    const lab = (window as unknown as { tempestEffectsLab: { map: { on(e: string, f: () => void): void; off(e: string, f: () => void): void } } }).tempestEffectsLab;
    let n = 0;
    const count = () => { n++; };
    lab.map.on('render', count);
    setTimeout(() => { lab.map.off('render', count); resolve(n); }, 1000);
  }));
  expect(frames).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
