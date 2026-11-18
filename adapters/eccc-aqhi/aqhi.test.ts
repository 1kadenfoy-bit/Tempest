import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { forecastsUrl, observationsUrl, parseForecast, parseObservations } from './aqhi';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
const MANNING = { lat: 49.07, lon: -120.8 };

describe('AQHI adapter (recorded answers, Nov 18, 2026)', () => {
  it('asks for the newest reading of stations around the pin', () => {
    const u = new URL(observationsUrl(MANNING.lat, MANNING.lon));
    expect(u.searchParams.get('latest')).toBe('true');
    expect(u.searchParams.get('bbox')!.split(',')).toHaveLength(4);
    expect(new URL(forecastsUrl('JCVCC')).searchParams.get('sortby')).toBe('-publication_datetime,forecast_datetime');
  });

  it('names the nearest station within 100 km, with its value as issued', () => {
    const list = parseObservations(fx('observations-manning-2026-11-18.json'), MANNING.lat, MANNING.lon);
    expect(list.length).toBeGreaterThan(0);
    const n = list[0]!;
    expect(n.station).toBe('Eastern Fraser Valley');
    expect(n.km).toBeGreaterThan(70);
    expect(n.km).toBeLessThan(100);
    expect(n.value).toBe(1.41);
    expect(n.timeText).toContain('November 2026');
    // Far away: nothing.
    expect(parseObservations(fx('observations-manning-2026-11-18.json'), 56, -125)).toEqual([]);
  });

  it('keeps the newest publication’s hours only', () => {
    const f = parseForecast(fx('forecasts-JCVCC-2026-11-18.json'), { station: 'Eastern Fraser Valley', stationId: 'JCVCC', km: 83 })!;
    expect(f.published.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(f.hours.length).toBeGreaterThan(30);
    expect(f.hours[0]!.time.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(f.hours.every((h) => Number.isInteger(h.value))).toBe(true);
    expect(parseForecast({ features: [] }, { station: '', stationId: '', km: 0 })).toBeNull();
  });
});
