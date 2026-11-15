import { describe, expect, it } from 'vitest';
import { REGION_FILE_VERSION, decodeRegionFile, encodeRegionFile, type RegionHeader } from './format';

const header: RegionHeader = {
  version: REGION_FILE_VERSION,
  source: 'openmeteo-maps',
  model: 'cmc_gem_hrdps',
  run: '2026-11-15T12:00:00Z',
  variable: 'precipitation',
  unit: 'mm/h',
  bbox: [-123.4, 49.25, -122.7, 50.35],
  validTimes: ['2026-11-15T13:00:00Z', '2026-11-15T14:00:00Z'],
  valuesPerStep: 3,
  savedAt: '2026-11-15T16:00:00Z',
};

describe('region file', () => {
  it('round-trips header and values', () => {
    const steps = [Float32Array.of(0, 0.5, 2.25), Float32Array.of(1, NaN, 6)];
    const back = decodeRegionFile(encodeRegionFile({ header, steps }));
    expect(back.header).toEqual(header);
    expect(Array.from(back.steps[0]!)).toEqual([0, 0.5, 2.25]);
    expect(back.steps[1]![1]).toBeNaN();
  });

  it('refuses a mismatched step count', () => {
    expect(() => encodeRegionFile({ header, steps: [new Float32Array(3)] })).toThrow();
  });

  it('refuses a file from a newer version', () => {
    const buf = encodeRegionFile({ header, steps: [new Float32Array(3), new Float32Array(3)] });
    new DataView(buf).setUint32(4, REGION_FILE_VERSION + 1, true);
    expect(() => decodeRegionFile(buf)).toThrow(/newer/);
  });

  it('refuses something that is not a region file', () => {
    expect(() => decodeRegionFile(new ArrayBuffer(16))).toThrow();
  });
});
