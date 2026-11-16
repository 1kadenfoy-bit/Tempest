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

import { formatAxisTime, formatCm, formatDayLabel, formatMm, formatRate } from './format';

describe('amounts and labels', () => {
  it('formats rates and amounts', () => {
    expect(formatRate(2.44)).toBe('2.4 mm/h');
    expect(formatMm(12.4)).toBe('12 mm');
    expect(formatMm(0.42)).toBe('0.4 mm');
    expect(formatCm(21.2)).toBe('21 cm');
  });
  it('labels the chart axis and week days in BC time', () => {
    // 07:00 UTC is midnight in BC (UTC-7).
    expect(formatAxisTime(new Date('2026-11-14T07:00:00Z'))).toBe('Sat');
    expect(formatAxisTime(new Date('2026-11-14T19:00:00Z'))).toBe('12 PM');
    const today = new Date('2026-11-15T20:00:00Z');
    expect(formatDayLabel(new Date('2026-11-15T10:00:00Z'), today)).toBe('Today');
    expect(formatDayLabel(new Date('2026-11-13T10:00:00Z'), today)).toBe('Fri 13');
  });
});

import { formatSpan } from './format';
describe('spans', () => {
  it('reads hours, then days from 3 days', () => {
    expect(formatSpan(6)).toBe('6 h');
    expect(formatSpan(24)).toBe('24 h');
    expect(formatSpan(84)).toBe('3.5 d');
    expect(formatSpan(72)).toBe('3 d');
  });
});
