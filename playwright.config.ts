import { defineConfig } from '@playwright/test';

// PW_PORT lets several copies of the app be tested side by side (one per working copy).
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    // WebGL in headless Chromium needs a software GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
