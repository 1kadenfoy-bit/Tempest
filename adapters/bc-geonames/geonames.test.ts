// Contract tests against real answers saved from apps.gov.bc.ca on Nov 17, 2026
// (name=Seymour* and name=Garibaldi*, outputStyle=detail, 40 per page).
import { describe, expect, it } from 'vitest';
import { rankPlaces } from '../../core/search/search';
import { fetchPlaces, parsePlaces, searchUrl, source, typeLabel } from './geonames';
import seymour from './fixtures/seymour-2026-11-17.json';
import garibaldi from './fixtures/garibaldi-2026-11-17.json';

describe('BC Geographical Names adapter', () => {
  it('asks for detailed names, the last word open-ended', () => {
    const u = new URL(searchUrl('mt seym'));
    expect(u.origin + u.pathname).toBe('https://apps.gov.bc.ca/pub/bcgnws/names/search');
    expect(u.searchParams.get('name')).toBe('Mount seym*');
    expect(u.searchParams.get('outputFormat')).toBe('json');
    expect(u.searchParams.get('outputSRS')).toBe('4326');
    expect(u.searchParams.get('outputStyle')).toBe('detail');
    expect(u.searchParams.get('itemsPerPage')).toBe('40');
  });

  it('reads the North Shore peak as issued', () => {
    const places = parsePlaces(seymour);
    expect(places).toHaveLength(37);
    const peak = places.find((p) => p.featureId === '21986');
    expect(peak).toEqual({
      id: 'apps.gov.bc.ca/pub/bcgnws/names/15303',
      featureId: '21986',
      name: 'Mount Seymour',
      kind: 'mountain',
      type: 'Mountain',
      area: 'Between Seymour River and Indian Arm, S of Mount Elsay, NE corner of North Vancouver (district municipality)',
      lat: 49.393333329,
      lon: -122.9444444444,
      elevation: null,
      official: true,
      rescinded: false,
    });
  });

  it('maps feature categories onto the app kinds', () => {
    const byName = (n: string, list = parsePlaces(garibaldi)) => list.find((p) => p.name === n)!;
    expect(byName('Garibaldi').kind).toBe('locality');
    expect(byName('Garibaldi Lake').kind).toBe('water');
    expect(byName('Garibaldi Park').kind).toBe('park');
    expect(byName('Garibaldi Névé').kind).toBe('mountain');
    expect(byName('Mount Garibaldi').kind).toBe('mountain');
    expect(byName('Seymour Pass', parsePlaces(seymour)).kind).toBe('mountain');
    expect(byName('Mount Seymour', parsePlaces(seymour)).kind).toBe('other'); // the ski area, a recreation facility
    expect(byName('Seymour Ridge', parsePlaces(seymour)).rescinded).toBe(true);
  });

  it('cleans feature types for the row', () => {
    expect(typeLabel('Creek (1)')).toBe('Creek');
    expect(typeLabel('Mount')).toBe('Mountain');
    expect(typeLabel('Provincial Park')).toBe('Provincial Park');
  });

  it('ranks the real answer with mountain features near the top', () => {
    const rows = rankPlaces('Seymour', parsePlaces(seymour));
    const names = rows.map((p) => `${p.name} (${p.type})`);
    // The exact name first (a locality), then mountain features, Mount Seymour among them.
    expect(names.slice(0, 6)).toEqual([
      'Seymour (Trading Post)', 'Seymour Hill (Hill)', 'Seymour Pass (Pass)',
      'Mount Seymour (Mountain)', 'Mount Seymour (Mountain)', 'Mount Seymour (Mountain)',
    ]);
    expect(names.indexOf('Mount Seymour (Mountain)')).toBeLessThan(names.indexOf('Seymour Creek (Creek)'));
    // The rescinded Seymour Ridge is a former name of Seymour Range: not shown.
    expect(names.some((n) => n.startsWith('Seymour Ridge'))).toBe(false);
    expect(rows.length).toBeLessThanOrEqual(20);
    const peaks = rankPlaces('Mount Seymour', parsePlaces(seymour));
    expect(peaks.slice(0, 3).map((p) => p.type)).toEqual(['Mountain', 'Mountain', 'Mountain']);
  });

  it('reads junk as no places', () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({ features: [{ properties: { name: 'X' } }, null] })).toEqual([]);
  });

  it('carries its licence and attribution', () => {
    expect(source.licence).toMatch(/Crown Copyright/);
    expect(source.attribution).toMatch(/BC Geographical Names/);
    expect(source.link).toMatch(/^https:\/\//);
  });

  it('throws on an error answer', async () => {
    const fake = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchPlaces('Seymour', undefined, fake)).rejects.toThrow(/503/);
  });
});
