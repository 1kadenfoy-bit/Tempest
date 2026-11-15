import { describe, expect, it } from 'vitest';
import { formatRunAge, nearestStepIndex, runAgeHours } from './run-age';

const run = new Date('2026-11-15T12:00:00Z');

describe('run age', () => {
  it('labels the run hour in UTC and its age in hours', () => {
    expect(formatRunAge(run, new Date('2026-11-15T14:40:00Z'))).toBe('12Z run · 2 h old');
  });
  it('pads single-digit run hours', () => {
    expect(formatRunAge(new Date('2026-11-15T06:00:00Z'), new Date('2026-11-15T06:10:00Z'))).toBe('06Z run · 0 h old');
  });
  it('switches to days at 48 h', () => {
    expect(formatRunAge(run, new Date('2026-11-17T13:00:00Z'))).toBe('12Z run · 2 d old');
  });
  it('never reports a negative age', () => {
    expect(runAgeHours(run, new Date('2026-11-15T11:00:00Z'))).toBe(0);
  });
});

describe('nearest step', () => {
  const steps = ['12:00', '13:00', '14:00'].map((t) => new Date(`2026-11-15T${t}:00Z`));
  it('picks the closest valid time', () => {
    expect(nearestStepIndex(steps, new Date('2026-11-15T13:20:00Z'))).toBe(1);
    expect(nearestStepIndex(steps, new Date('2026-11-16T00:00:00Z'))).toBe(2);
  });
  it('returns -1 for no steps', () => {
    expect(nearestStepIndex([], run)).toBe(-1);
  });
});
