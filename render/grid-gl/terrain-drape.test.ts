import { describe, expect, it } from 'vitest';
import { tileMatrix } from './terrain-drape';

const apply = (m: Float32Array, x: number, y: number) => [m[0]! * x + m[4]! * y + m[12]!, m[1]! * x + m[5]! * y + m[13]!];

describe('tileMatrix', () => {
  it('puts the tile\'s south-west corner at (-1, -1) and north-east at (1, 1)', () => {
    const z = 12, x = 647, y = 1401;
    const m = tileMatrix({ canonical: { z, x, y } });
    const n = 2 ** z;
    // North-west corner of the tile in Web Mercator 0..1 (y grows south).
    const [wx, ny] = [x / n, y / n];
    const [ex, sy] = [(x + 1) / n, (y + 1) / n];
    expect(apply(m, wx, sy)[0]).toBeCloseTo(-1, 3);
    expect(apply(m, wx, sy)[1]).toBeCloseTo(-1, 3);
    expect(apply(m, ex, ny)[0]).toBeCloseTo(1, 3);
    expect(apply(m, ex, ny)[1]).toBeCloseTo(1, 3);
  });

  it('shifts by whole worlds for wrapped tiles', () => {
    const m = tileMatrix({ canonical: { z: 1, x: 0, y: 0 }, wrap: 1 });
    // The tile one world east starts at mercator x = 1.
    expect(apply(m, 1, 0)).toEqual([-1, 1]);
  });
});
