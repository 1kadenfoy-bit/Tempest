// Writes manifest.webmanifest and the theme-colour meta from design/tokens.json,
// so the installed app's colours come from the tokens like everything else.
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

interface Tokens { color: Record<string, { dark?: string }> }

export function appManifest(): Plugin {
  const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8')) as Tokens;
  const ground = tokens.color['map-ground']?.dark ?? '#000000';
  const surface = tokens.color['surface']?.dark ?? '#000000';
  const manifest = JSON.stringify({
    name: 'Tempest',
    short_name: 'Tempest',
    description: 'Map-first mountain weather for BC',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: ground,
    theme_color: surface,
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }, null, 2);
  return {
    name: 'tempest-app-manifest',
    transformIndexHtml(html) {
      return html.replace('<meta name="theme-color" content="" />', `<meta name="theme-color" content="${surface}" />`);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('/manifest.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest);
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
    },
  };
}
