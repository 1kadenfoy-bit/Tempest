// Contract tests against real answers saved from api.weather.gc.ca on Nov 17, 2026.
import { describe, expect, it } from 'vitest';
import { alertsUrl, fetchAlerts, officialColour, parseAlerts, source, warningsPage } from './alerts';
import lethbridge from './fixtures/lethbridge-2026-11-17.json';
import calgary from './fixtures/calgary-2026-11-17.json';
import northShore from './fixtures/north-shore-2026-11-17.json';

describe('ECCC alerts adapter', () => {
  it('asks for the areas containing the point, without their shapes', () => {
    const u = new URL(alertsUrl(49.694, -112.84));
    expect(u.origin + u.pathname).toBe('https://api.weather.gc.ca/collections/weather-alerts/items');
    expect(u.searchParams.get('skipGeometry')).toBe('true');
    expect(u.searchParams.get('bbox')).toBe('-112.84010,49.69390,-112.83990,49.69410');
  });
  it('reads a colour-coded warning as issued', () => {
    const [a, ...rest] = parseAlerts(lethbridge);
    expect(rest).toEqual([]);
    expect(a).toEqual({
      id: '1810244521314087391202611160519_fea1-2010',
      alertId: '1810244521314087391202611160519',
      type: 'warning',
      title: 'snowfall warning',
      area: 'City of Lethbridge',
      colour: 'yellow',
      status: 'issued',
      issued: new Date('2026-11-16T21:19:54.045Z'),
      expires: new Date('2026-11-17T13:19:54.045Z'),
      province: 'AB',
      link: 'https://weather.gc.ca/warnings/index_e.html?prov=ab',
    });
    expect(officialColour(a!)).toBe('#FFFF00');
  });
  it('reads a statement, which has no colour level', () => {
    const [a] = parseAlerts(calgary);
    expect(a).toMatchObject({ type: 'statement', title: 'special weather statement', area: 'City of Calgary', colour: null });
    expect(officialColour(a!)).toBe('#DBDBDB');
  });
  it('reads an empty answer and junk as no alerts', () => {
    expect(parseAlerts(northShore)).toEqual([]);
    expect(parseAlerts(null)).toEqual([]);
    expect(parseAlerts({ features: [{ properties: { alert_name_en: 'x' } }] })).toEqual([]);
  });
  it('uses ECCC legend colours, and none where the legend has none', () => {
    expect(officialColour({ type: 'warning', colour: 'red' })).toBe('#DA3333');
    expect(officialColour({ type: 'advisory', colour: 'orange' })).toBe('#FF9500');
    expect(officialColour({ type: 'watch', colour: 'yellow' })).toBe('#FDFD7F');
    expect(officialColour({ type: 'warning', colour: null })).toBeNull();
    expect(officialColour({ type: 'something new', colour: 'red' })).toBeNull();
  });
  it('links to the province page', () => {
    expect(warningsPage('BC')).toBe('https://weather.gc.ca/warnings/index_e.html?prov=bc');
    expect(warningsPage('')).toBe('https://weather.gc.ca/warnings/index_e.html');
  });
  it('carries its licence and attribution', () => {
    expect(source.licence).toMatch(/Open Government Licence/);
    expect(source.attribution).toMatch(/Environment and Climate Change Canada/);
  });
  it('throws on an error answer, so the last answer can be kept', async () => {
    const fake = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchAlerts(49, -123, fake)).rejects.toThrow(/503/);
  });
});
