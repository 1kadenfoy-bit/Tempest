import { describe, expect, it } from 'vitest';
import { comparePrecip, fetchApiRun, fetchApiSeries } from './point-api';

describe('point API check', () => {
  it('parses the API and compares hour by hour', async () => {
    const fake = (async () => new Response(JSON.stringify({
      hourly: { time: ['2026-11-15T13:00', '2026-11-15T14:00', '2026-11-15T15:00'], precipitation: [0.2, 1.0, null], snowfall: [0, 0.7, 0] },
    }))) as unknown as typeof fetch;
    const api = await fetchApiSeries('cmc_gem_hrdps', 49.39, -122.95, fake);
    expect(api.times[1]!.toISOString()).toBe('2026-11-15T14:00:00.000Z');
    const c = comparePrecip(api.times, [0.2, 1.05, 3], api);
    expect(c.hours).toBe(2);
    expect(c.maxDiffMm).toBeCloseTo(0.05);
    expect(c.matchedWithin01).toBe(2);
  });
  it('reads which run the API serves', async () => {
    const fake = (async () => new Response(JSON.stringify({ last_run_initialisation_time: 1794765600 }))) as unknown as typeof fetch;
    expect((await fetchApiRun('cmc_gem_hrdps', fake)).toISOString()).toBe('2026-11-15T18:00:00.000Z');
  });
  it('reports the API refusing', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: true, reason: 'Daily API request limit exceeded.' }), { status: 429 })) as unknown as typeof fetch;
    await expect(fetchApiSeries('cmc_gem_hrdps', 0, 0, fake)).rejects.toThrow(/limit/);
  });
});
