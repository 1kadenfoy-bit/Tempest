import { describe, expect, it } from 'vitest';
import { ApiLimitError, apiUrl, fetchApiSeries, limitResets, parseApiSeries } from './point-series';

const run = new Date('2026-11-16T06:00:00Z');
const t0 = Date.parse('2026-11-16T06:00:00Z') / 1000;
const times = [t0 - 3600, t0, t0 + 3600, t0 + 7200];
const valid = [new Date(t0 * 1000), new Date((t0 + 3600) * 1000)];

describe('Open-Meteo point API adapter', () => {
  it('asks for the nearest cell, several places at once', () => {
    const u = new URL(apiUrl('cmc_gem_hrdps', [{ lat: 49.38, lon: -123 }, { lat: 49.5, lon: -122.9 }], ['temperature_850hPa']));
    expect(u.searchParams.get('latitude')).toBe('49.3800,49.5000');
    expect(u.searchParams.get('models')).toBe('gem_hrdps_continental');
    expect(u.searchParams.get('cell_selection')).toBe('nearest');
  });

  it('keeps only the run’s hours, one series per place, and marks gaps', () => {
    const loc = (k: number) => ({ latitude: 49, longitude: -123, hourly: { time: times, temperature_850hPa: [1, 2 + k, null, 4] } });
    const s = parseApiSeries([loc(0), loc(10)], 'cmc_gem_hrdps', run, ['temperature_850hPa'], [{ lat: 49, lon: -123 }, { lat: 49.5, lon: -123 }], valid);
    expect(s).toHaveLength(2);
    expect(s[0]!.times.map((t) => t.getTime())).toEqual(valid.map((t) => t.getTime()));
    expect(s[0]!.values.temperature_850hPa).toEqual([2, NaN]);
    expect(s[1]!.values.temperature_850hPa).toEqual([12, NaN]);
    expect(s[1]!.label.source).toBe('openmeteo-api');
  });

  it('a single place comes back as an object, not an array', () => {
    const s = parseApiSeries({ latitude: 49, longitude: -123, hourly: { time: times, temperature_2m: [0, 1, 2, 3] } }, 'cmc_gem_hrdps', run, ['temperature_2m'], [{ lat: 49, lon: -123 }], valid);
    expect(s[0]!.values.temperature_2m).toEqual([1, 2]);
  });

  it('rejects an error answer', () => {
    expect(() => parseApiSeries({ error: true, reason: 'Daily API request limit exceeded.' }, 'cmc_gem_hrdps', run, ['temperature_2m'], [{ lat: 49, lon: -123 }], valid)).toThrow(/limit/);
  });
});

describe('point API refusals and retries', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const one = { latitude: 49, longitude: -123, hourly: { time: [1_763_337_600], temperature_850hPa: [-2] } };
  const run = new Date(1_763_337_600_000);

  it('knows when a limit resets', () => {
    const now = new Date('2026-11-17T10:20:15Z');
    expect(limitResets('Minutely API request limit exceeded. Please try again in one minute.', now).toISOString()).toBe('2026-11-17T10:21:00.000Z');
    expect(limitResets('Hourly API request limit exceeded.', now).toISOString()).toBe('2026-11-17T11:00:30.000Z');
    expect(limitResets('Daily API request limit exceeded.', now).toISOString()).toBe('2026-11-18T00:00:30.000Z');
  });

  it('tries a dropped connection again, and stops at once on a limit', async () => {
    let calls = 0;
    const flaky = (async () => { calls++; if (calls === 1) throw new TypeError('Failed to fetch'); return ok(one); }) as typeof fetch;
    const got = await fetchApiSeries('cmc_gem_hrdps', run, ['temperature_850hPa'], [{ lat: 49, lon: -123 }], [run], flaky);
    expect(calls).toBe(2);
    expect(got[0]!.values.temperature_850hPa).toEqual([-2]);

    let limited = 0;
    const refuse = (async () => { limited++; return new Response(JSON.stringify({ error: true, reason: 'Minutely API request limit exceeded' }), { status: 429 }); }) as typeof fetch;
    await expect(fetchApiSeries('cmc_gem_hrdps', run, ['temperature_850hPa'], [{ lat: 49, lon: -123 }], [run], refuse)).rejects.toBeInstanceOf(ApiLimitError);
    expect(limited).toBe(1);
  });

  it('asks for a span of hours when given one', () => {
    const u = new URL(apiUrl('cmc_gem_hrdps', [{ lat: 49, lon: -123 }], ['temperature_850hPa'], [new Date('2026-11-17T06:00Z'), new Date('2026-11-19T06:00Z')]));
    expect(u.searchParams.get('start_hour')).toBe('2026-11-17T06:00');
    expect(u.searchParams.get('end_hour')).toBe('2026-11-19T06:00');
    expect(u.searchParams.get('past_days')).toBeNull();
  });
});
