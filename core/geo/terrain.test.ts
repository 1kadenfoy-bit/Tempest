import { describe, expect, it } from 'vitest';
import { pixelAt, terrariumElevation } from './terrain';

describe('terrain', () => {
  it('decodes Terrarium pixels', () => {
    expect(terrariumElevation(128, 0, 0)).toBe(0);
    // 1,449 m = 32768 + 1449 = 34217 = 133 * 256 + 169
    expect(terrariumElevation(133, 169, 0)).toBe(1449);
    expect(terrariumElevation(127, 255, 128)).toBe(-0.5);
  });
  it('finds the tile and pixel for a point', () => {
    const p = pixelAt(-122.9406, 49.3933, 12, 512);
    expect([p.x, p.y]).toEqual([649, 1399]);
    expect(p.px).toBeGreaterThanOrEqual(0);
    expect(p.px).toBeLessThan(512);
  });
});
