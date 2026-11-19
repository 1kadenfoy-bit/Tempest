// What every browser test imports instead of @playwright/test: the same API,
// with recorded weather on by default (e2e/recorded.ts), so tests show the same
// weather every run and never spend the forecast servers' free limits.
//
// A test file that needs live data says test.use({ weather: 'live' }).
// WEATHER=live (or WEATHER=<set>) changes it for a whole run.
import { test as base } from '@playwright/test';
import { useRecordedWeather } from './recorded';

export * from '@playwright/test';

export const test = base.extend<{ weather: string }>({
  weather: [process.env.WEATHER ?? 'default', { option: true }],
  context: async ({ context, weather }, use) => {
    if (weather !== 'live') await useRecordedWeather(context, weather);
    await use(context);
  },
});
