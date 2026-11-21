import { describe, expect, it } from 'vitest';
import { coverThreshold, drawnHeight } from './cloud-layer';

describe('clouds', () => {
  it('more cover needs a lower threshold; none and full are at the ends', () => {
    const t = (c: number) => coverThreshold(c, 3);
    expect(t(0)).toBeGreaterThan(1);
    expect(t(1)).toBeLessThan(-1);
    expect(t(0.2)).toBeGreaterThan(t(0.5));
    expect(t(0.5)).toBeGreaterThan(t(0.8));
    expect(t(0.5)).toBeCloseTo(0.5, 2);
  });

  it('heights are true up to 3 km and squeezed above, still in order', () => {
    expect(drawnHeight(1200)).toBe(1200);
    expect(drawnHeight(3000)).toBe(3000);
    expect(drawnHeight(8000)).toBeLessThan(8000);
    expect(drawnHeight(8000)).toBeGreaterThan(drawnHeight(3500));
    expect(drawnHeight(12000)).toBeGreaterThan(drawnHeight(8000));
  });
});
