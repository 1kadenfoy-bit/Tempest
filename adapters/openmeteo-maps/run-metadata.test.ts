import { describe, expect, it } from 'vitest';
import fixture from './fixtures/cmc_gem_hrdps-latest.json';
import { latestUrl, parseRunMetadata, stepFileUrl } from './run-metadata';

describe('Open-Meteo map file metadata', () => {
  const meta = parseRunMetadata('cmc_gem_hrdps', fixture);

  it('reads the run and its 48 h of hourly steps', () => {
    expect(meta.referenceTime.toISOString()).toBe('2026-11-15T12:00:00.000Z');
    expect(meta.validTimes).toHaveLength(49);
    expect(meta.validTimes[48]!.getTime() - meta.referenceTime.getTime()).toBe(48 * 3_600_000);
  });

  it('lists the variables the precipitation and temperature layers need', () => {
    for (const v of ['precipitation', 'snowfall_water_equivalent', 'temperature_2m', 'temperature_850hPa', 'geopotential_height_850hPa']) {
      expect(meta.variables).toContain(v);
    }
  });

  it('rejects an unexpected shape', () => {
    expect(() => parseRunMetadata('x', { hello: 1 })).toThrow();
  });

  it('builds file addresses', () => {
    expect(latestUrl('cmc_gem_hrdps')).toBe('https://openmeteo.s3.amazonaws.com/data_spatial/cmc_gem_hrdps/latest.json');
    expect(stepFileUrl('cmc_gem_hrdps', meta.referenceTime, meta.validTimes[5]!)).toBe(
      'https://openmeteo.s3.amazonaws.com/data_spatial/cmc_gem_hrdps/2026/11/15/1200Z/2026-11-15T1700.om',
    );
  });
});
