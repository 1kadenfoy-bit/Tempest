// What every browser test imports instead of @playwright/test: the same API,
// with recorded weather on by default (e2e/recorded.ts), so tests show the same
// weather every run and never spend the forecast servers' free limits.
//
// A test file that needs live data says test.use({ weather: 'live' }).
// WEATHER=live (or WEATHER=<set>) changes it for a whole run.
//
// While a set is recorded (RECORD=<set>, tools/record-weather.mjs) every test
// runs on that set, live-weather ones too, and what the set lacks is asked
// live and kept (e2e/recorded.ts). Checks do not stop a test then (they are
// "soft"): a check that fails on the new day must not stop the test before
// it has asked for everything it reads.
import { expect as baseExpect, test as base } from '@playwright/test';
import { RECORDING, useRecordedWeather, type Missing } from './recorded';

export * from '@playwright/test';

export const expect = RECORDING ? baseExpect.configure({ soft: true }) : baseExpect;

export const test = base.extend<{ weather: string }>({
  weather: [RECORDING ?? process.env.WEATHER ?? 'default', { option: true }],
  context: async ({ context, weather }, use, testInfo) => {
    const missing: Missing = [];
    const set = RECORDING ?? weather;
    if (set !== 'live') await useRecordedWeather(context, set, missing);
    await use(context);
    if (missing.length && RECORDING) {
      console.log(`[${testInfo.title}] asked ${new Set(missing).size} answer(s) live for the set "${RECORDING}"`);
    } else if (missing.length) {
      // Not a failure by itself (a test may expect a gap), but the likely cause of one.
      const unique = [...new Set(missing)];
      const note = `${unique.length} answer(s) not in the recorded weather "${weather}" (a new set must cover them: docs/tasks/test-upkeep.md):\n  ${unique.slice(0, 8).join('\n  ')}${unique.length > 8 ? `\n  … and ${unique.length - 8} more` : ''}`;
      console.log(`[${testInfo.title}] ${note}`);
      testInfo.annotations.push({ type: 'not recorded', description: note });
    }
  },
});

/**
 * Where a test's report pictures go: test-results/reports/<name> on every run,
 * docs/reports/<name> only with REPORTS=1, so a test run never leaves
 * changed pictures in the working copy to be committed by mistake.
 */
export const reportDir = (name: string) => `${process.env.REPORTS === '1' ? 'docs/reports' : 'test-results/reports'}/${name}`;

/**
 * A wait long enough for live weather (the point service can be slow or
 * refuse), cut on recorded weather, which answers at once: there a missing
 * answer fails in a minute or two instead of after ten (Kaden, Nov 27).
 */
export const upTo = (liveMs: number, recordedMs = 90_000) => (process.env.WEATHER === 'live' || RECORDING ? liveMs : Math.min(liveMs, recordedMs));
