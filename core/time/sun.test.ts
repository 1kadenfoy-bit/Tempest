import { describe, expect, it } from 'vitest';
import { isDaylight, sunElevation } from './sun';

describe('sun', () => {
  // North Vancouver, Nov 16 2026: sunrise about 15:27 UTC, sunset about 00:25 UTC.
  const lat = 49.32, lon = -123.07;
  it('is up at noon and down at midnight', () => {
    expect(isDaylight(new Date('2026-11-16T20:00:00Z'), lat, lon)).toBe(true);
    expect(isDaylight(new Date('2026-11-17T08:00:00Z'), lat, lon)).toBe(false);
  });
  it('rises and sets near the published times', () => {
    expect(isDaylight(new Date('2026-11-16T15:15:00Z'), lat, lon)).toBe(false);
    expect(isDaylight(new Date('2026-11-16T15:45:00Z'), lat, lon)).toBe(true);
    expect(isDaylight(new Date('2026-11-17T00:10:00Z'), lat, lon)).toBe(true);
    expect(isDaylight(new Date('2026-11-17T00:40:00Z'), lat, lon)).toBe(false);
  });
  it('noon height is about 90 − latitude − 18.6° in mid-November', () => {
    expect(sunElevation(new Date('2026-11-16T20:12:00Z'), lat, lon)).toBeCloseTo(90 - lat - 18.6, 0);
  });
});
