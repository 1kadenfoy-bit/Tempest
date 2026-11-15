import { describe, expect, it } from 'vitest';
import { TimeCursor } from './cursor';
import { dayStart, weekRange, windowRange } from './window';
import { precipTotals } from '../precip/totals';

const steps = Array.from({ length: 48 }, (_, i) => new Date(Date.UTC(2026, 10, 15, 13 + i)));

describe('time cursor', () => {
  it('sits on real steps and stops at the model ends', () => {
    const c = new TimeCursor();
    c.setSteps(steps, new Date('2026-11-15T15:20:00Z'));
    expect(c.time?.toISOString()).toBe('2026-11-15T15:00:00.000Z');
    c.setTime(new Date('2026-12-01T00:00:00Z'));
    expect(c.index).toBe(47);
    expect(c.stepBy(1)).toBe(false);
    c.setIndex(-5);
    expect(c.index).toBe(0);
  });
  it('tells listeners when it moves, and only then', () => {
    const c = new TimeCursor();
    c.setSteps(steps, steps[0]);
    let n = 0;
    c.subscribe(() => n++);
    c.setIndex(0);
    c.stepBy(2);
    expect(n).toBe(1);
  });
});

describe('window and week', () => {
  it('centres the window on the cursor', () => {
    const r = windowRange(new Date('2026-11-15T12:00:00Z'), 48);
    expect(r.start.toISOString()).toBe('2026-11-14T12:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-16T12:00:00.000Z');
  });
  it('finds BC midnight (UTC-7 per tz 2026e)', () => {
    expect(dayStart(new Date('2026-11-15T22:30:00Z')).toISOString()).toBe('2026-11-15T07:00:00.000Z');
  });
  it('spans two days back to four ahead', () => {
    const w = weekRange(new Date('2026-11-15T22:30:00Z'));
    expect(w.days).toHaveLength(7);
    expect(w.start.toISOString()).toBe('2026-11-13T07:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-20T07:00:00.000Z');
  });
});

describe('precipitation totals', () => {
  it('adds the window by type, hour-ending', () => {
    const times = steps.slice(0, 4);
    const precip = [1, 2, 3, 4];
    const swe = [0, 1, 3, 4];
    const all = precipTotals(times, precip, swe, new Date('2026-11-15T12:00:00Z'), new Date('2026-11-15T16:00:00Z'));
    expect(all).toMatchObject({ rainMm: 1, mixedMm: 2, snowMm: 7, wetHours: 4 });
    expect(all.snowCm).toBeCloseTo(4.9);
    // The hour ending at the window start is outside it.
    expect(precipTotals(times, precip, swe, steps[0]!, steps[1]!).rainMm).toBe(0);
  });
});
