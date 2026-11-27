import { describe, expect, it } from 'vitest';
import { newerRunPossible, nextRunPossibleAt } from './run-schedule';
import { retryDelay, RETRY_TRIES } from './retry';

const at = (s: string) => new Date(s);

describe('run timetable', () => {
  it('waits for the next run to be possible', () => {
    // HRDPS 18Z: the 00Z run could be complete from 03Z (seen 03:20 at the earliest).
    expect(nextRunPossibleAt('cmc_gem_hrdps', at('2026-11-19T18:00Z'))).toEqual(at('2026-11-20T03:00Z'));
    expect(newerRunPossible('cmc_gem_hrdps', at('2026-11-19T18:00Z'), at('2026-11-20T01:11Z'))).toBe(false);
    expect(newerRunPossible('cmc_gem_hrdps', at('2026-11-19T18:00Z'), at('2026-11-20T03:00Z'))).toBe(true);
    // GDPS runs twice a day.
    expect(nextRunPossibleAt('cmc_gem_gdps_15km', at('2026-11-19T12:00Z'))).toEqual(at('2026-11-20T04:30Z'));
  });

  it('is never later than the fastest run seen (Nov 20 to 27)', () => {
    const fastest: Record<string, number> = { cmc_gem_hrdps: 3.33, cmc_gem_rdps_10km: 3.9, cmc_gem_gdps_15km: 4.83, cmc_gem_gdps_15km_upper_level: 4.83, ecmwf_ifs: 5.96 };
    const runEvery: Record<string, number> = { cmc_gem_hrdps: 6, cmc_gem_rdps_10km: 6, cmc_gem_gdps_15km: 12, cmc_gem_gdps_15km_upper_level: 12, ecmwf_ifs: 6 };
    const run = at('2026-11-27T00:00Z');
    for (const [m, h] of Object.entries(fastest)) {
      const seen = run.getTime() + (runEvery[m]! + h) * 3_600_000;
      expect(nextRunPossibleAt(m, run)!.getTime(), m).toBeLessThan(seen);
    }
  });

  it('asks every time for a model without a timetable', () => {
    expect(nextRunPossibleAt('some_model', at('2026-11-27T00:00Z'))).toBeNull();
    expect(newerRunPossible('some_model', at('2026-11-27T00:00Z'), at('2026-11-27T00:01Z'))).toBe(true);
  });
});

describe('asking again', () => {
  it('backs off, then stops', () => {
    const waits = Array.from({ length: RETRY_TRIES + 2 }, (_, k) => retryDelay(k));
    expect(waits).toEqual([3000, 6000, 12000, 24000, 48000, 96000, null, null]);
  });
});
