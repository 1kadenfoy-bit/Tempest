import { describe, expect, it } from 'vitest';
import { gridRequest, spacingForZoom } from './grid-request';

const BC: [number, number, number, number] = [-139.1, 48.2, -114, 60];

describe('grid request', () => {
  it('snaps the view outward so small pans reuse the grid', () => {
    const a = gridRequest([-123.3, 49.2, -122.6, 49.7], 10, BC)!;
    const b = gridRequest([-123.2, 49.25, -122.7, 49.6], 10, BC)!;
    expect(a.bbox).toEqual([-124, 49, -122, 50]);
    expect(a.key).toBe(b.key);
  });
  it('uses model spacing close in and coarser far out', () => {
    expect(spacingForZoom(11)).toBe(0.0225);
    expect(spacingForZoom(5)).toBe(0.09);
    const r = gridRequest([-124, 49, -122, 50], 10, BC)!;
    expect(r.ny).toBe(44);
    expect(r.nx).toBeGreaterThan(55);
  });
  it('clips to the limit, and gives nothing outside it', () => {
    expect(gridRequest([-150, 40, -100, 70], 4, BC)!.bbox).toEqual([-139.1, 48.2, -114, 60]);
    expect(gridRequest([-80, 40, -70, 45], 8, BC)).toBeNull();
  });
});
