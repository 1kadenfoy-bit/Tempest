// The recorder's tour (tools/record-weather.mjs): the same browser setup as
// the tests (playwright.config.ts), with the tour's own folder. The app is
// served from the project's root, as for the tests (a config's own folder is
// the default).
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({ ...base, testDir: '.', timeout: 300_000, webServer: { ...base.webServer!, cwd: root } });
