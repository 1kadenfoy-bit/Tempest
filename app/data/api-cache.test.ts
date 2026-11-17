import { describe, expect, it } from 'vitest';
import { apiWeight, waitFor } from './api-cache';

describe('the API’s free limits', () => {
  it('weighs a request as Open-Meteo counts it', () => {
    const pts = Array.from({ length: 20 }, () => '49.1').join(',');
    const vars = Array.from({ length: 45 }, (_, i) => `v${i}`).join(',');
    expect(apiWeight(`https://x/v1/forecast?latitude=${pts}&longitude=${pts}&hourly=${vars}&start_hour=2026-11-17T00:00&end_hour=2026-11-19T00:00`)).toBeCloseTo(90);
    expect(apiWeight(`https://x/v1/forecast?latitude=49&longitude=-123&hourly=a,b&past_days=2&forecast_days=3`)).toBe(1);
    // Over two weeks counts extra.
    expect(apiWeight(`https://x/v1/forecast?latitude=49&longitude=-123&hourly=a&past_days=2&forecast_days=26`)).toBeCloseTo(2);
  });
  it('waits until enough has aged out of the minute', () => {
    const now = 1_000_000;
    expect(waitFor(90, [], now)).toBe(0);
    const log: [number, number][] = [[now - 50_000, 200], [now - 30_000, 200], [now - 10_000, 90]];
    expect(waitFor(5, log, now)).toBe(0);
    // 490 used; 90 more needs the oldest 200 gone: 10 s from now.
    expect(waitFor(90, log, now)).toBe(10_000);
  });
});
