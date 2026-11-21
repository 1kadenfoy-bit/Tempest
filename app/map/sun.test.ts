import { describe, expect, it } from 'vitest';
import { nightAmount, sunPosition } from './sun';

describe('sun position', () => {
  it('stands about 17 degrees up and due south at winter-solstice noon in Vancouver', () => {
    // 12:00 PST is 20:00 UTC; the sun's height is 90 - 49.28 - 23.44 = 17.3 degrees.
    const { altitude, azimuth } = sunPosition(new Date('2026-12-21T20:08:00Z'), 49.28, -123.12);
    expect(altitude).toBeGreaterThan(16.5);
    expect(altitude).toBeLessThan(18);
    expect(azimuth).toBeGreaterThan(176);
    expect(azimuth).toBeLessThan(184);
  });

  it('is high in the south at summer-solstice noon, and below the horizon at midnight', () => {
    const noon = sunPosition(new Date('2026-06-21T20:14:00Z'), 49.28, -123.12);
    expect(noon.altitude).toBeGreaterThan(63);
    expect(noon.altitude).toBeLessThan(65);
    const midnight = sunPosition(new Date('2026-12-21T08:00:00Z'), 49.28, -123.12);
    expect(midnight.altitude).toBeLessThan(-30);
  });

  it('rises in the east and sets in the west', () => {
    const morning = sunPosition(new Date('2026-03-20T14:00:00Z'), 49.28, -123.12);
    const evening = sunPosition(new Date('2026-03-21T01:30:00Z'), 49.28, -123.12);
    expect(morning.azimuth).toBeLessThan(180);
    expect(evening.azimuth).toBeGreaterThan(180);
  });
});

describe('night amount', () => {
  it('is 0 in full daylight, rises through dusk, and is 1 well after dark', () => {
    expect(nightAmount(40)).toBe(0);
    expect(nightAmount(6)).toBe(0);
    expect(nightAmount(-3)).toBeGreaterThan(0.2);
    expect(nightAmount(-3)).toBeLessThan(0.8);
    expect(nightAmount(-12)).toBe(1);
    expect(nightAmount(-40)).toBe(1);
  });
});
