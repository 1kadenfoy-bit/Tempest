import { describe, expect, it } from 'vitest';
import { VOCABULARY } from '../../core/vocabulary';
import { CLOUD_SUPPORT, CLOUD_VARIABLES, cloudGridVariables, hasCloudLayersOnGrid } from './clouds';

describe('cloud fields', () => {
  it('every cloud variable has a name, a unit in percent and a meaning', () => {
    for (const v of CLOUD_VARIABLES) {
      const entry = (VOCABULARY as Record<string, { unit: string; meaning: string }>)[v];
      expect(entry?.unit).toBe('%');
      expect(entry?.meaning.length).toBeGreaterThan(10);
    }
  });
  it('every model gives all four at the pin, and the total on the map', () => {
    for (const support of Object.values(CLOUD_SUPPORT)) {
      expect(support.pin).toEqual(CLOUD_VARIABLES);
      expect(support.grid).toContain('cloud_cover');
    }
  });
  it('only ECMWF has low, mid and high cloud in its map files', () => {
    expect(hasCloudLayersOnGrid('ecmwf')).toBe(true);
    expect(hasCloudLayersOnGrid('hrdps')).toBe(false);
    expect(cloudGridVariables('rdps')).toEqual(['cloud_cover']);
  });
});
