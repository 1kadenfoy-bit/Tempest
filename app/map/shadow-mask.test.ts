import { describe, expect, it } from 'vitest';
import { shadowMask, shrinkMax } from './shadow-mask';

/** A flat plain with one tall ridge three cells wide at column `at`, 400 m high. */
function ridge(width = 60, height = 20, at = 20) {
  const g = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = at - 1; x <= at + 1; x++) g[y * width + x] = 400;
  return { g, width, height };
}

describe('shadow mask', () => {
  it('puts the shadow on the far side of a ridge from the sun (sun in the east: shadow to the west)', () => {
    const { g, width, height } = ridge();
    const m = shadowMask(g, width, height, { cellM: 20, azimuth: 90, altitude: 20 });
    const row = 10;
    expect(m[row * width + 17]!).toBeGreaterThan(200); // just west of the ridge: shaded
    expect(m[row * width + 30]!).toBe(0); // east of the ridge: lit
  });

  it('casts a longer shadow when the sun is lower', () => {
    const { g, width, height } = ridge(120, 10, 100);
    const shaded = (alt: number) => shadowMask(g, width, height, { cellM: 20, azimuth: 90, altitude: alt }).slice(5 * width, 6 * width).filter((v) => v > 128).length;
    expect(shaded(10)).toBeGreaterThan(shaded(40));
  });

  it('leaves flat ground lit', () => {
    const m = shadowMask(new Float32Array(30 * 30), 30, 30, { cellM: 20, azimuth: 200, altitude: 15 });
    expect(Math.max(...m)).toBe(0);
  });

  it('shrinks a grid keeping each block\'s highest cell', () => {
    const g = Float32Array.from([1, 2, 3, 9, 5, 6, 7, 8, 1, 1, 1, 1, 1, 1, 1, 1]);
    const s = shrinkMax(g, 4, 4, 2);
    expect(s.width).toBe(2);
    expect(Array.from(s.data)).toEqual([6, 9, 1, 1]);
  });
});
