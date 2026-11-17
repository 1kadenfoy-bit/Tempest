import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchMeasurements, measurementsUrl, networkId, parseMeasurements, parseStations, source, stationsUrl } from './stations';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;

describe('Avalanche Canada weather stations', () => {
  it('reads the station list (as published on avalanche.ca, Nov 17, 2026)', () => {
    const list = parseStations(fixture('stations-from-page-2026-11-17.json'));
    expect(list).toHaveLength(154);
    const strachan = list.find((s) => s.name === 'Mt. Strachan')!;
    expect(strachan).toMatchObject({
      id: 'avcan-weather:11', sourceId: 'avcan-weather', lat: 49.41003, lon: -123.19636, elevation: 1420,
      provider: 'Avalanche Canada · BC Ministry of Transportation & Infrastructure',
    });
    expect(strachan.attribution).toBe('Weather station data from Avalanche Canada; station run by BC Ministry of Transportation & Infrastructure');
    expect(networkId(strachan.id)).toBe('11');
  });

  it('accepts the list wrapped in an object, and skips entries without a place', () => {
    expect(parseStations({ stations: [{ stationId: 3, name: 'Mud Lake', latitude: 50.79, longitude: -115.3, elevation: 1900 }, { stationId: 4, name: 'Nowhere' }] })).toHaveLength(1);
    expect(parseStations(null)).toEqual([]);
  });

  it('reads measurements (the documentation example), missing values as null', () => {
    const obs = parseMeasurements(fixture('measurements-docs-example.json'));
    expect(obs).toHaveLength(2);
    expect(obs[0]).toEqual({
      time: new Date('2025-12-15T17:00:00Z'), airTemp: -1.5, windSpeed: 12.3, windDir: 213, gust: 32.7, precip1h: null, snowDepth: 113.9,
    });
    // The schema's wrapped form reads the same.
    expect(parseMeasurements({ measurements: fixture('measurements-docs-example.json') })).toEqual(obs);
  });

  it('asks for the documented addresses', async () => {
    expect(stationsUrl()).toBe('https://weather.prod.avalanche.ca/stations');
    expect(measurementsUrl('11', new Date('2026-11-15T14:00:00.000Z'))).toBe('https://weather.prod.avalanche.ca/stations/11/measurements?fromDate=2026-11-15T14%3A00%3A00Z');
    const asked: string[] = [];
    const fake = (async (u: string) => { asked.push(u); return new Response('[]'); }) as unknown as typeof fetch;
    await fetchMeasurements('avcan-weather:11', new Date('2026-11-15T14:00:00Z'), fake);
    expect(asked[0]).toContain('/stations/11/measurements');
    expect(source.link).toMatch(/^https:\/\/avalanche\.ca\//);
  });
});
