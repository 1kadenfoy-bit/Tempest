import { describe, expect, it } from 'vitest';
import { MemoryStore, pointKey } from './memory-store';

describe('memory store', () => {
  it('stores, finds and evicts the least recently used', () => {
    const s = new MemoryStore<number>(2);
    s.put('a', 1);
    s.put('b', 2);
    expect(s.get('a')).toBe(1);
    s.put('c', 3);
    expect(s.has('b')).toBe(false);
    expect(s.list()).toEqual(['a', 'c']);
  });
  it('keys a point series by run, variables and place', () => {
    const run = new Date('2026-11-15T12:00:00Z');
    expect(pointKey('om', 'hrdps', run, ['snowfall_water_equivalent', 'precipitation'], 49.38951, -122.9481))
      .toBe('om|hrdps|2026-11-15T12:00:00.000Z|precipitation+snowfall_water_equivalent|49.390|-122.948');
  });
});
