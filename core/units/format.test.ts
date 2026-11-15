import { describe, expect, it } from 'vitest';
import { formatCursorTime, formatElevation, formatRelative } from './format';

describe('formatting', () => {
  it('formats elevation with a thousands separator', () => {
    expect(formatElevation(1180.4)).toBe('1,180 m');
    expect(formatElevation(12)).toBe('12 m');
  });
  it('formats the cursor time in BC time', () => {
    // tz data 2026e: BC stays on UTC-7 from November 2026 (permanent daylight
    // time), so 00:00 UTC on Sat 14 Nov is 5 PM Friday in Vancouver.
    expect(formatCursorTime(new Date('2026-11-14T00:00:00Z'))).toBe('Fri 5 PM');
    expect(formatCursorTime(new Date('2026-11-14T00:30:00Z'))).toBe('Fri 5:30 PM');
  });
  it('formats time relative to now', () => {
    const now = new Date('2026-11-13T19:00:00Z');
    expect(formatRelative(new Date('2026-11-14T01:00:00Z'), now)).toBe('in 6 h');
    expect(formatRelative(now, now)).toBe('now');
    expect(formatRelative(new Date('2026-11-13T16:00:00Z'), now)).toBe('3 h ago');
    expect(formatRelative(new Date('2026-11-16T19:00:00Z'), now)).toBe('in 3 d');
  });
});
