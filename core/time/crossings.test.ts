import { describe, expect, it } from 'vitest';
import { crossings } from './crossings';

const t = (h: number) => new Date(Date.UTC(2026, 10, 16, h));
describe('crossings', () => {
  it('finds each crossing, its direction and the interpolated time', () => {
    const c = crossings([t(0), t(1), t(2), t(3)], [2, -2, -1, 1]);
    expect(c.map((x) => x.dir)).toEqual(['down', 'up']);
    expect(c[0]!.time.toISOString()).toBe('2026-11-16T00:30:00.000Z');
    expect(c[1]!.time.toISOString()).toBe('2026-11-16T02:30:00.000Z');
  });
  it('skips gaps', () => {
    expect(crossings([t(0), t(1), t(2)], [2, null, -1])).toEqual([]);
  });
});
