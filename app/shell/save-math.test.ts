import { describe, expect, it } from 'vitest';
import { bboxAreaKm2, clampFrame, dragFrame, formatArea, formatBytes, ringAreaKm2 } from './save-math';

const H = 3_600_000;

describe('shape size', () => {
  it('a 0.1 by 0.1 degree square near Vancouver is about 80 km2', () => {
    const ring: [number, number][] = [[-123.1, 49.3], [-123.0, 49.3], [-123.0, 49.4], [-123.1, 49.4]];
    const a = ringAreaKm2(ring);
    expect(a).toBeGreaterThan(70);
    expect(a).toBeLessThan(90);
    expect(bboxAreaKm2([-123.1, 49.3, -123.0, 49.4])).toBeCloseTo(a, -1);
  });
  it('a line or a point has no area', () => {
    expect(ringAreaKm2([[-123, 49], [-123.1, 49.1]])).toBe(0);
  });
  it('does not care which way round the ring goes', () => {
    const a: [number, number][] = [[-123.1, 49.3], [-123.0, 49.3], [-123.0, 49.4]];
    expect(ringAreaKm2(a)).toBeCloseTo(ringAreaKm2([...a].reverse()), 6);
  });
});

describe('the scrubber frame', () => {
  const axis = { from: 0, to: 100 * H };
  it('dragging the left handle past the right one stops one minimum short', () => {
    const f = dragFrame({ from: 20 * H, to: 40 * H }, 'from', 50 * H, axis, 2 * H);
    expect(f).toEqual({ from: 38 * H, to: 40 * H });
  });
  it('dragging the right handle past the end stops at the end', () => {
    expect(dragFrame({ from: 20 * H, to: 40 * H }, 'to', 500 * H, axis, 2 * H).to).toBe(100 * H);
  });
  it('moving the whole frame keeps its length and stops at the edges', () => {
    const f = dragFrame({ from: 20 * H, to: 40 * H }, 'move', 500 * H, axis, 2 * H);
    expect(f).toEqual({ from: 80 * H, to: 100 * H });
    const g = dragFrame({ from: 20 * H, to: 40 * H }, 'move', -500 * H, axis, 2 * H);
    expect(g).toEqual({ from: 0, to: 20 * H });
  });
  it('clamps a frame that sticks out of the axis', () => {
    expect(clampFrame({ from: -5 * H, to: 200 * H }, axis, 2 * H)).toEqual({ from: 0, to: 100 * H });
  });
});

describe('plain words', () => {
  it('sizes', () => {
    expect(formatBytes(340_000)).toBe('340 kB');
    expect(formatBytes(4_800_000)).toBe('4.8 MB');
    expect(formatBytes(48_000_000)).toBe('48 MB');
    expect(formatBytes(1_240_000_000)).toBe('1.2 GB');
  });
  it('areas', () => {
    expect(formatArea(0.84)).toBe('0.8 km²');
    expect(formatArea(1240)).toBe('1,240 km²');
  });
});
