import { defineConfig } from '@playwright/test';

// PW_PORT lets several copies of the app be tested side by side (one per working copy).
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  // Longer than the longest wait inside a test (the pin's live forecast: up
  // to 90 s on a slow runner), so a slow answer fails as a wait, not as a
  // cut-off test.
  timeout: 150_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    // Kaden's phone is in BC; GitHub's machines are on UTC. Pages run in BC's
    // time zone so a mistake that only shows there shows here too.
    timezoneId: 'America/Vancouver',
    // WebGL in headless Chromium needs a software GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    // Longer than the longest wait inside a test (the pin's live forecast: up
  // to 90 s on a slow runner), so a slow answer fails as a wait, not as a
  // cut-off test.
  timeout: 150_000,
  },
});
