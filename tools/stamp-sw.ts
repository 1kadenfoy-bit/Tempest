// Stamps the service worker (public/sw.js, copied to the build) with a
// fingerprint of the build's file list (asset-manifest.json). A browser
// installs a new service worker only when sw.js itself changes: before
// Nov 28 it never changed, so a new version of the app never replaced the
// offline copy's worker, and the old copy's files were kept for good.
// Used by the build (tools/vite-plugin-app-manifest.ts) and by the test that
// makes a second version (e2e/update.spec.ts).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The line the stamp replaces, in public/sw.js. */
const VERSION_LINE = /const VERSION = '[^']*';/;

/** Returns the version written, or null when sw.js has no version line (the build then fails). */
export function stampServiceWorker(outDir: string): string | null {
  const version = createHash('sha256').update(readFileSync(join(outDir, 'asset-manifest.json'))).digest('hex').slice(0, 12);
  const file = join(outDir, 'sw.js');
  const sw = readFileSync(file, 'utf8');
  if (!VERSION_LINE.test(sw)) return null;
  writeFileSync(file, sw.replace(VERSION_LINE, `const VERSION = '${version}';`));
  return version;
}
