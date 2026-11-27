// The recorder's tour (tools/record-weather.mjs, step 1): at each spot, each
// layer, with the hours played through, and the forecast summary where the
// summary tests press. Runs on the set being recorded (RECORD=<set>), so
// everything it asks is asked live and kept (e2e/recorded.ts). The browser
// tests then fill what else they read (step 2).
import { test } from '../../e2e/fixtures';

// The places the browser tests use, plus the Manning smoke spot.
const SPOTS: Record<string, { name: string; latitude: number; longitude: number }> = {
  seymour: { name: 'Mt Seymour', latitude: 49.3895, longitude: -122.948 },
  bowen: { name: 'Bowen Island', latitude: 49.38, longitude: -123.28 },
  manning: { name: 'Manning Park', latitude: 49.07, longitude: -120.8 },
};
const spots = (process.env.RECORD_SPOTS || Object.keys(SPOTS).join(',')).split(',');
const layers = (process.env.RECORD_LAYERS || 'precipitation,temperature,wind,radar,avalanche,air-quality').split(',');
const playSeconds = Number(process.env.RECORD_PLAY || 25);

test.skip(!process.env.RECORD, 'only while recording (tools/record-weather.mjs)');

for (const id of spots) {
  const spot = SPOTS[id];
  if (!spot) throw new Error(`Unknown spot "${id}" (${Object.keys(SPOTS).join(', ')})`);
  test.describe(spot.name, () => {
    test.use({ geolocation: { latitude: spot.latitude, longitude: spot.longitude }, permissions: ['geolocation'] });
    for (const layer of layers) {
      test(layer, async ({ page }) => {
        const note = (what: string) => () => console.log(`  ${spot.name}, ${layer}: ${what}`);
        await page.addInitScript((l) => {
          const key = 'tempest.prefs.v1';
          const old = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
          localStorage.setItem(key, JSON.stringify({ ...old, layer: l }));
        }, layer);
        await page.goto('/?insets=47,34');
        await page.waitForFunction(() => document.body.dataset.run === 'ready', null, { timeout: 90_000 }).catch(note('run not ready'));
        await page.waitForFunction(() => document.body.dataset.series === 'ready', null, { timeout: 90_000 }).catch(note('series not ready'));
        await page.waitForTimeout(3000);
        // Play through the hours so each hour's map is asked for.
        await page.click('#play-button').catch(note('no play button'));
        await page.waitForTimeout(playSeconds * 1000);
        await page.click('#play-button').catch(() => undefined);
        // The forecast summary (it asks for the longer-range models too), where
        // the summary tests press: 200, 300 on the screen.
        if (layer === layers[0]) {
          await page.click('#now-button').catch(() => undefined);
          await page.mouse.move(200, 300);
          await page.mouse.down();
          await page.waitForTimeout(800);
          await page.mouse.up();
          await page.waitForFunction(() => document.body.dataset.summary === 'ready', null, { timeout: 90_000 }).catch(note('summary not ready'));
        }
        await page.waitForTimeout(2000);
      });
    }
  });
}
