import { describe, expect, it } from 'vitest';
import { BASEMAP_ATTRIBUTION, credits, linkIn, plainText } from './credits';

// Every adapter file that declares a source, read as text so no adapter code
// (or the map library) has to load in a unit test.
const adapterFiles = import.meta.glob('../../adapters/*/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const declared = Object.entries(adapterFiles)
  .filter(([path]) => !path.endsWith('.test.ts'))
  .flatMap(([path, text]) => {
    const m = /export const source = \{\s*id: '([^']+)'/.exec(text);
    return m ? [{ path, id: m[1]! }] : [];
  });

describe('credits registry', () => {
  const list = credits();

  it('finds the adapters it checks', () => {
    // openmeteo-maps, openmeteo-api, eccc-geomet today.
    expect(new Set(declared.map((d) => d.path.split('/')[3])).size).toBeGreaterThanOrEqual(3);
  });

  it('lists every adapter that declares a source', () => {
    const ids = new Set(list.map((c) => c.id));
    for (const d of declared) expect(ids, `${d.path} declares ${d.id}`).toContain(d.id);
  });

  it('gives every adapter folder at least one source', () => {
    const folders = new Set(Object.keys(adapterFiles).map((p) => p.split('/')[3]));
    const withSource = new Set(declared.map((d) => d.path.split('/')[3]));
    expect([...folders].filter((f) => !withSource.has(f))).toEqual([]);
  });

  it('carries a name, licence, attribution and link for each', () => {
    for (const c of list) {
      expect(c.name, c.id).not.toBe('');
      expect(c.licence, c.id).not.toBe('');
      expect(c.attribution, c.id).not.toBe('');
      expect(c.link, c.id).toMatch(/^https:\/\//);
      expect(c.attribution, c.id).not.toMatch(/[<>]/);
    }
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });

  it('names Open-Meteo, ECCC, ECMWF, the base map and the terrain', () => {
    const names = list.map((c) => `${c.name} ${c.attribution}`).join(' | ');
    expect(names).toContain('Open-Meteo');
    expect(names).toContain('Environment and Climate Change Canada');
    expect(names).toContain('ECMWF');
    expect(names).toContain('OpenStreetMap');
    expect(names).toContain('Mapterhorn');
  });

  it('reads map attributions as plain text and finds their links', () => {
    expect(plainText(BASEMAP_ATTRIBUTION)).toBe('Protomaps © OpenStreetMap');
    expect(linkIn(BASEMAP_ATTRIBUTION, 'openstreetmap')).toBe('https://openstreetmap.org/copyright');
    expect(linkIn(BASEMAP_ATTRIBUTION)).toBe('https://protomaps.com');
  });
});
