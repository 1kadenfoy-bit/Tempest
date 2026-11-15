import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { appManifest } from './tools/vite-plugin-app-manifest.ts';

// Cross-origin isolation lets the starter weather library share decoded data with
// its workers (SharedArrayBuffer). The same headers are sent by the preview host
// through public/_headers.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // GitHub Pages serves the app under /Tempest/; local runs use the root.
  base: process.env.BASE_PATH ?? '/',
  plugins: [appManifest()],
  server: { headers: isolation, host: true },
  preview: { headers: isolation, host: true, port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        spike: resolve(import.meta.dirname, 'spike.html'),
      },
    },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@openmeteo/weather-map-layer'] },
  test: {
    include: ['{core,adapters,layers,render,app}/**/*.test.ts'],
    environment: 'node',
  },
});
