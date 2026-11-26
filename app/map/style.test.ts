import { describe, expect, it } from 'vitest';
import { scaleWidth } from './style';

describe('road width scaling', () => {
  it('scales the outputs of a zoom curve and leaves the zoom stops alone', () => {
    expect(scaleWidth(['interpolate', ['exponential', 1.6], ['zoom'], 11, 0, 12, 1, 18, 20], 0.5)).toEqual(['interpolate', ['exponential', 1.6], ['zoom'], 11, 0, 12, 0.5, 18, 10]);
  });

  it('reaches into a case inside the curve, and plain numbers', () => {
    expect(scaleWidth(['interpolate', ['linear'], ['zoom'], 10, ['case', ['has', 'x'], 4, 2], 14, 8], 0.5)).toEqual(['interpolate', ['linear'], ['zoom'], 10, ['case', ['has', 'x'], 2, 1], 14, 4]);
    expect(scaleWidth(3, 0.5)).toBe(1.5);
  });

  it('leaves other expressions as they are', () => {
    expect(scaleWidth(['get', 'width'], 0.5)).toEqual(['get', 'width']);
  });
});
