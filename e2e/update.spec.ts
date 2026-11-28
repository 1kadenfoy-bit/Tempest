import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve } from 'node:path';
import { expect, test, type Page, upTo } from './fixtures';
import { startSaving } from './save-area';
import { stampServiceWorker } from '../tools/stamp-sw';

// A new version of the app is installed over an old offline copy (docs/
// testing.md, "Sequences that could cause trouble"). The installed app keeps
// its own files on the phone (public/sw.js) so it opens without signal. When
// a new version is published, the phone must either keep a whole old copy or
// get a whole new one: never the new page without the files it needs, never a
// blank app in the mountains. Saved areas must keep working across the change.
//
// The test serves the built app (dist/) from its own little server, so it can
// replace it with a second version at the same address: the same build with
// every built file renamed (a new build's files have new names) and a mark in
// the page to tell the versions apart.
test.use({ geolocation: { latitude: 49.3895, longitude: -122.948 }, permissions: ['geolocation'] });

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.pmtiles': 'application/octet-stream', '.webp': 'image/webp',
};

/**
 * The app's files over HTTP, as GitHub Pages serves them (plus the isolation
 * headers, as vite preview), from `site.dir`. While `site.down`, only the page,
 * the service worker and its list of files answer: the signal drops just after
 * they arrived, while the new version's files are being kept.
 */
function serve(site: { dir: string; down: boolean }): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (site.down && req.headers['sec-fetch-mode'] !== 'navigate' && !['/sw.js', '/asset-manifest.json'].includes(path)) { req.socket.destroy(); return; }
    const file = join(site.dir, path);
    if (!file.startsWith(site.dir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    const size = statSync(file).size;
    const headers: Record<string, string> = {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-cache',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp',
    };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'content-length': String(size) });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, 'localhost', () => ok(server)));
}

/**
 * The next version: the built app with every built file renamed and the
 * names changed wherever they are written, a mark in the page, and the
 * service worker stamped for its file list as the build does. The big map
 * folders are shared, not copied.
 */
function nextVersion(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(join(to, 'assets'), { recursive: true });
  const renamed = new Map<string, string>();
  for (const f of readdirSync(join(from, 'assets'))) {
    const next = f.replace(/-([A-Za-z0-9_-]{8})(\.\w+)$/, (_, hash: string, ext: string) => `-${hash.slice(0, 5)}nxt${ext}`);
    renamed.set(f, next);
    copyFileSync(join(from, 'assets', f), join(to, 'assets', next));
  }
  for (const f of readdirSync(from)) {
    if (f === 'assets') continue;
    if (statSync(join(from, f)).isDirectory()) { symlinkSync(resolve(from, f), join(to, f)); continue; }
    copyFileSync(join(from, f), join(to, f));
  }
  const text = [...readdirSync(to).filter((f) => /\.(html|js|json|webmanifest)$/.test(f)), ...[...renamed.values()].filter((f) => /\.(js|css)$/.test(f)).map((f) => `assets/${f}`)];
  for (const f of text) {
    let s = readFileSync(join(to, f), 'utf8');
    for (const [a, b] of renamed) s = s.split(a).join(b);
    if (f === 'index.html') s = s.replace('<head>', '<head>\n    <meta name="tempest-version" content="next" />');
    writeFileSync(join(to, f), s);
  }
  stampServiceWorker(to);
}

/** Waits until the phone has finished installing whatever version the server offers (or gave up). */
async function updateSettled(page: Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.update().catch(() => undefined);
    for (let k = 0; k < 120 && (reg.installing || reg.waiting); k++) await new Promise((r) => setTimeout(r, 500));
  });
}

/** Opened without signal: the app runs, on the saved area, with the map's weather and the pin's forecast. */
async function worksOffline(page: Page, url: string) {
  await page.goto(url).catch(() => undefined);
  await expect(page.locator('body')).toHaveAttribute('data-run', 'saved', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-fill', 'ready', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 60_000 });
}

const version = (page: Page) => page.evaluate(() => document.querySelector('meta[name="tempest-version"]')?.getAttribute('content') ?? 'first');

/** The app's own kept files, by cache: names only. */
const appCaches = (page: Page) => page.evaluate(async () => {
  const out: Record<string, string[]> = {};
  for (const key of await caches.keys()) out[key] = (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname.split('/').pop() ?? '');
  return out;
});

test('a new version over an old offline copy opens without signal, and saved areas still work', async ({ page, context }) => {
  test.setTimeout(upTo(900_000, 600_000));
  const dist = resolve('dist');
  expect(existsSync(join(dist, 'asset-manifest.json')), 'the built app (npm run build)').toBe(true);
  const next = resolve('test-results/update-next-version');
  nextVersion(dist, next);
  const site = { dir: dist, down: false };
  const server = await serve(site);
  const home = `http://localhost:${(server.address() as AddressInfo).port}/?insets=47,34`;
  try {
    // Observed precipitation is online only (ECCC asks that it not be bulk-copied).
    await context.route('**/geo.weather.gc.ca/**', (r) => r.abort());
    await page.goto(home);
    await page.evaluate(() => localStorage.setItem('tempest.prefs.v1', JSON.stringify({ windowHours: 12 })));
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(2000);

    // The first version, installed: an area saved, and it works without signal.
    await startSaving(page);
    await page.click('#alert-badge');
    const centre = page.getByRole('dialog', { name: 'Notification Centre' });
    await expect(centre.locator('.notice-words', { hasText: 'Saved for offline' })).toBeVisible({ timeout: upTo(720_000, 480_000) });
    await page.keyboard.press('Escape');
    await updateSettled(page);
    const before = await appCaches(page);
    await context.setOffline(true);
    await worksOffline(page, home);
    expect(await version(page)).toBe('first');
    await context.setOffline(false);

    // The next version is published. The app is opened with weak signal: the
    // new page arrives, then the signal drops before the rest of it.
    site.dir = next;
    site.down = true;
    await page.goto(home).catch(() => undefined);
    await page.waitForTimeout(3000);
    await updateSettled(page);
    site.down = false;
    // Later, with no signal at all: a whole copy opens (the old one: the new one never arrived), with the saved area.
    await context.setOffline(true);
    await worksOffline(page, home);
    await page.screenshot({ path: 'test-results/screens/update-half-arrived-offline.png' });
    expect(await version(page), 'the whole old copy, as the new one never fully arrived').toBe('first');
    await context.setOffline(false);

    // With signal again: the new version arrives whole and replaces the old copy.
    await page.goto(home);
    await expect(page.locator('body')).toHaveAttribute('data-series', 'ready', { timeout: 90_000 });
    expect(await version(page)).toBe('next');
    await updateSettled(page);
    await context.setOffline(true);
    await worksOffline(page, home);
    expect(await version(page), 'the new version, without signal').toBe('next');
    await page.screenshot({ path: 'test-results/screens/update-new-offline.png' });
    await context.setOffline(false);

    // The old copy's files are gone; what the app keeps beside them stays: the
    // saved area's map pieces, the forecasts kept on the phone.
    const after = await appCaches(page);
    console.log('kept before:', Object.entries(before).map(([k, v]) => `${k}: ${v.length}`).join(', '));
    console.log('kept after: ', Object.entries(after).map(([k, v]) => `${k}: ${v.length}`).join(', '));
    const oldFiles = Object.values(before).flat().filter((f) => /-[A-Za-z0-9_-]{8}\.\w+$/.test(f));
    expect(Object.values(after).flat().filter((f) => oldFiles.includes(f)), 'the old version’s files, still kept').toEqual([]);
    for (const key of Object.keys(before).filter((k) => !k.startsWith('tempest-app'))) {
      expect(after[key]?.length ?? 0, `${key} after the update`).toBeGreaterThanOrEqual(before[key]!.length);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  }
});
