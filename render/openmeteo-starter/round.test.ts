import { describe, expect, it } from 'vitest';
import { pointApiDecimals, roundLikePointApi } from './om-reader';

describe('map-file values rounded as the point API gives them', () => {
  it('keeps the API decimals per variable', () => {
    expect(pointApiDecimals('temperature_850hPa')).toBe(1);
    expect(pointApiDecimals('wind_speed_700hPa')).toBe(1);
    expect(pointApiDecimals('wind_gusts_10m')).toBe(1);
    expect(pointApiDecimals('relative_humidity_700hPa')).toBe(0);
    expect(pointApiDecimals('geopotential_height_850hPa')).toBe(0);
    expect(pointApiDecimals('wind_direction_10m')).toBe(0);
    expect(pointApiDecimals('precipitation')).toBeNull();
  });
  it('matches what the API returned for the same cells (Nov 17)', () => {
    // File values read beside the API's for HRDPS near Mt Seymour.
    const rh = Float32Array.from([58.89, 60, 61.11, 63.33]);
    roundLikePointApi('relative_humidity_700hPa', rh);
    expect(Array.from(rh)).toEqual([59, 60, 61, 63]);
    const t = Float32Array.from([-2.29]);
    roundLikePointApi('temperature_850hPa', t);
    expect(t[0]).toBeCloseTo(-2.3, 5);
    const p = Float32Array.from([0.37]);
    roundLikePointApi('precipitation', p);
    expect(p[0]).toBeCloseTo(0.37, 5);
  });
});
