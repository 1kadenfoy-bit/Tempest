import { describe, expect, it } from 'vitest';
import { REFERENCE_ZOOM, zoomScale } from './wind-look';

describe('zoomScale', () => {
  it('leaves the look as made at the reference zoom', () => {
    expect(zoomScale(REFERENCE_ZOOM)).toEqual({ speed: 1, width: 1 });
  });
  it('makes the streaks faster and wider the further in you zoom', () => {
    const a = zoomScale(REFERENCE_ZOOM + 1), b = zoomScale(REFERENCE_ZOOM + 2);
    expect(a.speed).toBeCloseTo(1.5);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.width).toBeGreaterThan(a.width);
  });
  it('slows them when zoomed out, but never to a stop, and stops growing at the top', () => {
    expect(zoomScale(2).speed).toBe(0.6);
    expect(zoomScale(22).speed).toBe(8);
    expect(zoomScale(22).width).toBeLessThanOrEqual(2.2);
    expect(zoomScale(2).width).toBe(1);
  });
});
