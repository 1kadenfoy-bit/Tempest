#!/usr/bin/env node
// After a failed pixel test, print where the differing pixels are, so a CI
// log is enough to see what changed without downloading the images.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('-diff.png')) yield p;
  }
}

for (const file of walk('test-results')) {
  const png = PNG.sync.read(readFileSync(file));
  const { width, height, data } = png;
  // Playwright marks differing pixels in red.
  const rows = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
        const r = rows.get(y) ?? [x, x, 0];
        r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); r[2]++;
        rows.set(y, r);
      }
    }
  }
  console.log(`${file} (${width}x${height})`);
  let band = null;
  const flush = () => band && console.log(`  y ${band.y0}-${band.y1}, x ${band.x0}-${band.x1}, ${band.n} px`);
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const [x0, x1, n] = rows.get(y);
    if (band && y - band.y1 <= 2) { band.y1 = y; band.x0 = Math.min(band.x0, x0); band.x1 = Math.max(band.x1, x1); band.n += n; }
    else { flush(); band = { y0: y, y1: y, x0, x1, n }; }
  }
  flush();
}
