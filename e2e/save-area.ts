// Saving an area as a finger does, and what the app then keeps on the phone:
// shared by the tests that save (e2e/save-interrupted.spec.ts, e2e/update.spec.ts).
import { expect, type Page } from './fixtures';

/** What the app keeps on the phone for saved areas: its files and the saved map pieces' addresses. */
export async function stored(page: Page) {
  return page.evaluate(async () => {
    const files: string[] = [];
    let bytes = 0;
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('tempest');
      for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
        files.push(name);
        bytes += (await (await dir.getFileHandle(name)).getFile()).size;
      }
    } catch { /* no folder yet */ }
    const pieces = (await (await caches.open('tempest-saved-v1')).keys()).map((r) => r.url);
    let index: { id: string }[] = [];
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('tempest');
      index = JSON.parse(await (await (await dir.getFileHandle('saved-areas.json')).getFile()).text()) as { id: string }[];
    } catch { /* nothing saved */ }
    return { files: files.sort(), pieces: pieces.length, areas: index.map((a) => a.id), bytes };
  });
}

/**
 * Trace an area on the save card and press Save: the same area, layers and
 * time frame as e2e/offline.spec.ts, which the recorded weather holds.
 */
export async function startSaving(page: Page) {
  await page.click('#settings-button');
  await page.locator('#save-data').click();
  const card = page.locator('.ofl-card');
  await expect(card).toBeVisible();
  const pts: [number, number][] = [[120, 300], [200, 260], [280, 300], [300, 380], [240, 440], [160, 430], [110, 370], [118, 305]];
  await page.mouse.move(...pts[0]!);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ofl-summary')).toContainText(/Area .* km²/);
  await page.locator('.ofl-handle').click();
  await expect(card).toHaveAttribute('data-state', 'up');
  for (const name of ['Temperature', 'Wind']) await page.locator('.ofl-row', { hasText: name }).locator('.ofl-tick').click();
  const end = (await page.locator('.ofl-frame [data-part="to"]').boundingBox())!;
  const axis = (await page.locator('.ofl-axis').boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(axis.x + axis.width - 1, end.y + end.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ofl-go')).toContainText(/Save data · [\d.]+ [kM]B/, { timeout: 60_000 });
  await page.locator('.ofl-go').click();
  await expect(card).toBeHidden();
}

