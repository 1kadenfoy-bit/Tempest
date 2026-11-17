import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIELDS, fetchLatest, latestUrl, networkId, parseLatest, parseSeries, seriesUrl, titleCase } from './swob';

// Saved real answers from api.weather.gc.ca, Nov 17, 2026 (about 14:03 UTC).
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;

describe('ECCC surface weather stations (swob-realtime)', () => {
  it('reads each station once, with its newest hourly report', () => {
    const list = parseLatest(fixture('latest-cell-124-49-2026-11-17.json'));
    expect(list).toHaveLength(17); // 16 names; two Nanaimo stations share one
    const pa = list.find((s) => s.station.name === 'Point Atkinson')!;
    expect(pa.station).toMatchObject({ id: 'eccc-swob:1106200', provider: 'MSC', lat: 49.330352, lon: -123.264704, elevation: 15 });
    // ECCC's own stations carry no notice: the collection's attribution.
    expect(pa.station.attribution).toBe('Contains information from Environment and Climate Change Canada (surface weather observations)');
    expect(pa.latest!.time.toISOString()).toBe('2026-11-17T14:00:00.000Z');
    expect(pa.latest).toMatchObject({ airTemp: 7.2, windSpeed: 2.7, windDir: 7, gust: 6.1, precip1h: 0, snowDepth: null });
  });

  it('keeps a partner network\'s own notice, and its readings as given', () => {
    const list = parseLatest(fixture('latest-cell-124-50-2026-11-17.json'));
    const chef = list.find((s) => s.station.id === 'eccc-swob:BC_WMB_1383')!;
    expect(chef.station.provider).toBe('BC-FOR');
    expect(chef.station.elevation).toBe(456);
    expect(chef.station.attribution).toBe('Observational data provided by the Government of British Columbia: Ministry of Forests (BC-FOR). All rights reserved.');
    // BC Wildfire stations report rain only (no precipitation total): read as the hour's precipitation.
    expect(chef.latest!.precip1h).not.toBeNull();
    const callaghan = list.find((s) => s.station.name === 'Callaghan Valley')!;
    expect(callaghan.station.elevation).toBe(887.4);
    expect(callaghan.latest!.snowDepth).toBe(3);
  });

  it('reads a station\'s 48 hours for the chart, missing values as null (never zero)', () => {
    const { station, observations } = parseSeries(fixture('series-callaghan-valley-2026-11-17.json'));
    expect(station?.name).toBe('Callaghan Valley');
    expect(observations).toHaveLength(49);
    expect(observations[0]).toEqual({
      time: new Date('2026-11-15T14:00:00Z'), airTemp: 5, windSpeed: 4.8, windDir: 92, gust: 19.5, precip1h: 3.8, snowDepth: 3,
    });
    const cayley = parseSeries(fixture('series-mount-cayley-2026-11-17.json'));
    expect(cayley.station).toMatchObject({ name: 'Mount Cayley', elevation: 1592, provider: 'BC-FOR' });
    // Mount Cayley sent a direction without a speed.
    expect(cayley.observations[0]).toMatchObject({ airTemp: 0.8, windSpeed: null, windDir: 149, precip1h: 0.4, snowDepth: 5 });
  });

  it('asks politely: hourly reports only, the fields used, the past day in a box', () => {
    const u = new URL(latestUrl([-124, 49, -123, 50], new Date('2026-11-17T14:03:00Z')));
    expect(u.origin + u.pathname).toBe('https://api.weather.gc.ca/collections/swob-realtime/items');
    expect(u.searchParams.get('bbox')).toBe('-124,49,-123,50');
    expect(u.searchParams.get('datetime')).toBe('2026-11-16T14:00:00Z/..');
    expect(u.searchParams.get('_is-minutely_obs-value')).toBe('false');
    expect(u.searchParams.get('properties')).toBe(FIELDS.join(','));
    const s = new URL(seriesUrl('1101300', new Date('2026-11-15T14:00:00Z')));
    expect(s.searchParams.get('msc_id-value')).toBe('1101300');
    expect(s.searchParams.get('sortby')).toBe('date_tm-value');
    expect(networkId('eccc-swob:BC_WMB_1221')).toBe('BC_WMB_1221');
  });

  it('asks again without the field list when ECCC refuses one of its names', async () => {
    const asked: string[] = [];
    const fake = (async (u: string) => {
      asked.push(u);
      return asked.length === 1 ? new Response('{"code":"InvalidParameterValue"}', { status: 400 }) : new Response(JSON.stringify(fixture('latest-cell-124-50-2026-11-17.json')));
    }) as unknown as typeof fetch;
    const list = await fetchLatest([-124, 50, -123, 51], new Date(), fake);
    expect(asked).toHaveLength(2);
    expect(new URL(asked[1]!).searchParams.has('properties')).toBe(false);
    expect(list.length).toBeGreaterThan(0);
  });

  it('writes shouted names in title case, and leaves mixed case alone', () => {
    expect(titleCase('WHISTLER - NESTERS')).toBe('Whistler - Nesters');
    expect(titleCase('PEMBERTON AIRPORT (WINDS)')).toBe('Pemberton Airport (Winds)');
    expect(titleCase('VANCOUVER HARBOUR CS')).toBe('Vancouver Harbour CS');
    expect(titleCase('Vancouver Harbour')).toBe('Vancouver Harbour');
  });
});
