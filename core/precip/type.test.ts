import { describe, expect, it } from 'vitest';
import { precipType, snowShare } from './type';

describe('precipitation type', () => {
  it('splits by the snow share of the step', () => {
    expect(precipType(2, 0)).toBe('rain');
    expect(precipType(2, 0.3)).toBe('rain');
    expect(precipType(2, 1)).toBe('mixed');
    expect(precipType(2, 1.7)).toBe('snow');
    expect(precipType(2, 2)).toBe('snow');
  });
  it('never divides by zero', () => {
    expect(snowShare(0, 0)).toBe(0);
    expect(snowShare(0.5, 0.9)).toBe(1);
  });
});
