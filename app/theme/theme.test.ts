import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';
import { colorToken, solidToken, tokenCss } from './tokens';

describe('theme', () => {
  it('is dark unless chosen otherwise; "Match phone" follows the phone', () => {
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  it('keeps the dark tokens exactly as before', () => {
    expect(colorToken('map-ground')).toBe('#1A2026');
    expect(colorToken('surface')).toBe('rgba(17, 21, 26, 0.92)');
    expect(colorToken('card')).toBe('rgba(255, 255, 255, 0.045)');
  });

  it('reads the light values, and tints cards with the light ink', () => {
    expect(colorToken('map-ground', 'light')).toBe('#E6EAE2');
    expect(colorToken('ink', 'light')).toBe('#14181D');
    expect(colorToken('panel', 'light')).toBe('rgba(255, 255, 255, 0.98)');
    expect(colorToken('card', 'light')).toBe('rgba(20, 24, 29, 0.045)');
    expect(solidToken('surface', 'light')).toBe('#FFFFFF');
    expect(tokenCss('light')).toContain('--ink: #14181D;');
  });
});
