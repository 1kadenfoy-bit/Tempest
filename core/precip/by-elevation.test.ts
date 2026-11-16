import { describe, expect, it } from 'vitest';
import { PROFILE_LEVELS, type PointSeries } from '../vocabulary';
import { totalAtHeight } from './by-elevation';

// Two hours of 2 mm each; 0 °C at 1,000 m, saturated.
function series(): PointSeries {
  const times = [new Date('2026-11-16T10:00:00Z'), new Date('2026-11-16T11:00:00Z')];
  const values: PointSeries['values'] = { precipitation: [2, 2] };
  PROFILE_LEVELS.forEach((l, k) => {
    const z = k * 300;
    values[`geopotential_height_${l}hPa`] = [z, z];
    values[`temperature_${l}hPa`] = [-0.0065 * (z - 1000), -0.0065 * (z - 1000)];
    values[`relative_humidity_${l}hPa`] = [100, 100];
  });
  return { label: {} as PointSeries['label'], lat: 49, lon: -123, times, stepHours: 1, values };
}

describe('totals by elevation', () => {
  const s = series();
  const span = [new Date('2026-11-16T09:00:00Z'), new Date('2026-11-16T11:00:00Z')] as const;
  it('rain in the valley, snow up high, from the same amount', () => {
    expect(totalAtHeight(s, 300, ...span, '10:1')).toEqual({ rainMm: 4, snowCm: 0, complete: true });
    expect(totalAtHeight(s, 1600, ...span, '10:1')).toEqual({ rainMm: 0, snowCm: 4, complete: true });
    expect(totalAtHeight(s, 1600, ...span, '7:1').snowCm).toBeCloseTo(2.8);
  });
  it('says when the span reaches past the hours held', () => {
    expect(totalAtHeight(s, 300, new Date('2026-11-16T00:00:00Z'), span[1], '10:1').complete).toBe(false);
  });
});
