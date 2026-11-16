import { describe, expect, it } from 'vitest';
import { bandHeight, bandOf, bandsAt } from './bands';

describe('elevation bands (proposal)', () => {
  it('match the v8 screens on the North Shore', () => {
    const b = bandsAt(49.39, -122.95);
    expect([b.valleyTop, b.alpineBottom]).toEqual([600, 1400]);
    expect(bandOf(b, 1180)).toBe('Mid');
    expect(bandOf(b, 300)).toBe('Valley');
    expect(bandOf(b, 1449)).toBe('Alpine');
  });
  it('rise inland and in the Rockies', () => {
    expect(bandsAt(50.12, -122.95).alpineBottom).toBe(1650); // Whistler
    expect(bandsAt(51.0, -118.2).alpineBottom).toBe(1950); // Revelstoke
    expect(bandsAt(51.3, -116.0).alpineBottom).toBe(2200); // Rogers Pass east / Rockies
  });
  it('gives a height for each band', () => {
    const b = bandsAt(49.39, -122.95);
    expect([bandHeight(b, 'Valley'), bandHeight(b, 'Mid'), bandHeight(b, 'Alpine')]).toEqual([300, 1000, 1700]);
  });
});
