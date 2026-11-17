import { describe, expect, it } from 'vitest';
import { expandQuery, inBC, isSearchable, matchTier, normaliseQuery, placeLine, rankPlaces, words, type Place } from './search';

const place = (name: string, over: Partial<Place> = {}): Place => ({
  id: `${name}-${over.lat ?? 49.4}`, featureId: `${name}-${over.lat ?? 49.4}`, name, kind: 'other', type: 'Feature', area: null,
  lat: 49.4, lon: -123, elevation: null, official: true, rescinded: false, ...over,
});

describe('query clean-up', () => {
  it('trims, collapses spaces and drops wildcard and markup characters', () => {
    expect(normaliseQuery('  Mount   Sey*mour  ')).toBe('Mount Sey mour');
    expect(normaliseQuery('<b>Whistler</b>')).toBe('b Whistler /b');
    expect(normaliseQuery('x'.repeat(100))).toHaveLength(60);
  });
  it('needs two letters', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('a ')).toBe(false);
    expect(isSearchable('Sé')).toBe(true);
  });
  it('folds accents and spells out abbreviations', () => {
    expect(words('Garibaldi Névé')).toEqual(['garibaldi', 'neve']);
    expect(words('Mt. Seymour')).toEqual(['mount', 'seymour']);
    expect(expandQuery('mt seymour')).toBe('Mount seymour');
    expect(expandQuery('Mt. Garibaldi')).toBe('Mount Garibaldi');
  });
});

describe('matching', () => {
  it('tells whole, starting and word matches apart', () => {
    expect(matchTier('Seymour', 'Seymour')).toBe(0);
    expect(matchTier('seymour l', 'Seymour Lake')).toBe(1);
    expect(matchTier('Seymour', 'Mount Seymour')).toBe(1);
    expect(matchTier('Mount', 'Mount Seymour')).toBe(1);
    expect(matchTier('Elsay', 'Mount Seymour')).toBeNull();
    expect(matchTier('Arm', 'Seymour Arm')).toBe(2);
    expect(matchTier('mt seym', 'Mount Seymour')).toBe(1);
    expect(matchTier('Seymour', 'Mount Ho')).toBeNull();
    expect(matchTier('Mount Sey', 'Mount Ada')).toBeNull();
  });
  it('knows BC from its neighbours', () => {
    expect(inBC(49.39, -122.94)).toBe(true);
    expect(inBC(47.6, -122.3)).toBe(false); // Seattle
    expect(inBC(53.55, -113.49)).toBe(false); // Edmonton
  });
});

describe('ranking', () => {
  it('puts mountains and towns before minor features, then official, shorter names', () => {
    const list = rankPlaces('Seymour', [
      place('Seymour Creek', { kind: 'water' }),
      place('Seymour', { kind: 'other' }),
      place('Mount Seymour', { kind: 'mountain', lat: 49.39 }),
      place('Seymour Heights', { kind: 'locality', lat: 49.32 }),
      place('Seymour Range', { kind: 'mountain', lat: 51.5 }),
    ]);
    expect(list.map((p) => p.name)).toEqual(['Mount Seymour', 'Seymour Range', 'Seymour Heights', 'Seymour', 'Seymour Creek']);
  });
  it('an exact name wins among the same kind', () => {
    const list = rankPlaces('Mount Seymour', [place('Mount Seymour Park', { kind: 'park' }), place('Mount Seymour', { kind: 'park', lat: 50 })]);
    expect(list[0]!.name).toBe('Mount Seymour');
  });
  it('leaves out former names, places outside BC and names that do not match', () => {
    const list = rankPlaces('Seymour', [
      place('Seymour Ridge', { rescinded: true }),
      place('Seymour', { lat: 47.6, lon: -122.3 }),
      place('Mount Ho'),
      place('Seymour Bay'),
    ]);
    expect(list.map((p) => p.name)).toEqual(['Seymour Bay']);
  });
  it('shows one row per place', () => {
    const list = rankPlaces('Seymour Lake', [
      place('Seymour Lake', { id: 'a', featureId: '1', kind: 'water' }),
      place('Seymour Lake', { id: 'b', featureId: '2', kind: 'water', lat: 49.405 }),
      place('Seymour Lake', { id: 'c', featureId: '3', kind: 'locality', lat: 49.405 }),
      place('Seymour Lake', { id: 'd', featureId: '4', kind: 'water', lat: 54.7 }),
      place('Lake Seymour', { id: 'e', featureId: '1', kind: 'water' }),
    ]);
    expect(list.map((p) => p.id)).toEqual(['c', 'a', 'd']);
  });
  it('of places that rank alike, puts the nearest first', () => {
    const three = [place('Mount Seymour', { id: 'haida', kind: 'mountain', lat: 53.22, lon: -132.27 }), place('Mount Seymour', { id: 'north-shore', kind: 'mountain', lat: 49.39, lon: -122.94 })];
    expect(rankPlaces('Mount Seymour', three, 20, { lat: 49.3, lon: -123.1 })[0]!.id).toBe('north-shore');
    expect(rankPlaces('Mount Seymour', three, 20, { lat: 53, lon: -132 })[0]!.id).toBe('haida');
  });
  it('stops at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => place(`Seymour ${i}`, { lat: 49 + i * 0.1 }));
    expect(rankPlaces('Seymour', many)).toHaveLength(20);
    expect(rankPlaces('Seymour', many, 5)).toHaveLength(5);
  });
});

it('writes the row line from the type and the area', () => {
  expect(placeLine(place('Mount Seymour', { type: 'Mountain', area: 'NE corner of North Vancouver' }))).toBe('Mountain · NE corner of North Vancouver');
  expect(placeLine(place('X', { type: 'Lake' }))).toBe('Lake');
});
