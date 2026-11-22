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
  // allowedHosts: the Claude app's live view reaches the dev server under its
  // own address (docs/sections/README.md, "Showing your work").
  server: { headers: isolation, host: true, allowedHosts: true },
  preview: { headers: isolation, host: true, port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    // A list of every built file, which the service worker keeps on install.
    manifest: 'asset-manifest.json',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        spike: resolve(import.meta.dirname, 'spike.html'),
        dataViewer: resolve(import.meta.dirname, 'data-viewer.html'),
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
