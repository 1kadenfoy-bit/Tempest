import { describe, expect, it } from 'vitest';
import { veilAmount, weatherCover } from './ground-veil';

describe('ground veil', () => {
  it('quietens the terrain most under layers that colour everywhere, less under rain, not at all otherwise', () => {
    expect(weatherCover('temperature')).toBe(1);
    expect(weatherCover('wind')).toBe(1);
    expect(weatherCover('precipitation')).toBeLessThan(1);
    expect(weatherCover('avalanche')).toBe(0);
    expect(veilAmount('temperature', 'dark')).toBeGreaterThan(veilAmount('precipitation', 'dark'));
    expect(veilAmount('avalanche', 'dark')).toBe(0);
    expect(veilAmount('', 'light')).toBe(0);
  });
  it('is lighter on the light theme, and never hides the terrain', () => {
    expect(veilAmount('temperature', 'light')).toBeLessThan(veilAmount('temperature', 'dark'));
    expect(veilAmount('temperature', 'dark')).toBeLessThanOrEqual(0.5);
  });
});
