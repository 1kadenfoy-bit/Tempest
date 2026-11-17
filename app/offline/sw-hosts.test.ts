import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { terrainSource } from '../map/terrain-source';

// The service worker only handles other sites that saved areas keep copies
// from; if the terrain or map font host changes, saved areas would stop
// working offline unless the worker's list changes with it.
describe('service worker hosts', () => {
  const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const hosts = JSON.parse(/SAVED_HOSTS = new Set\((\[[^\]]*\])\)/.exec(sw)![1]!.replace(/'/g, '"')) as string[];
  it('covers the terrain tiles and the map fonts and icons', () => {
    expect(hosts).toContain(new URL(terrainSource.url.replace(/\{[xyz]\}/g, '0')).host);
    const style = readFileSync(new URL('../map/style.ts', import.meta.url), 'utf8');
    for (const m of style.matchAll(/https:\/\/([a-z0-9.-]+)\/basemaps-assets/g)) expect(hosts).toContain(m[1]);
  });
  it('leaves data services to the browser', () => {
    for (const h of ['api.avalanche.ca', 'api.open-meteo.com', 'api.weather.gc.ca', 'geo.weather.gc.ca']) expect(hosts).not.toContain(h);
  });
});
