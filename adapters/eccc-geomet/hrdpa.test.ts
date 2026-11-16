import { describe, expect, it } from 'vitest';
import { featureInfoUrl, fetchObserved, parseFeatureInfo, periodEnds } from './hrdpa';

describe('HRDPA adapter', () => {
  it('asks GeoMet for one point at a period end', () => {
    const u = new URL(featureInfoUrl('HRDPA_2.5km_Precip-Accum6h', 49.39, -122.95, new Date('2026-11-16T12:00:00Z')));
    expect(u.searchParams.get('request')).toBe('GetFeatureInfo');
    expect(u.searchParams.get('time')).toBe('2026-11-16T12:00:00Z');
    expect(u.searchParams.get('info_format')).toBe('application/json');
  });
  it('reads the value, and nothing from an empty answer', () => {
    expect(parseFeatureInfo({ features: [{ properties: { value: 0.3853 } }] })).toBeCloseTo(0.3853);
    expect(parseFeatureInfo({ features: [] })).toBeNull();
  });
  it('lists 6-hour period ends', () => {
    expect(periodEnds(new Date('2026-11-15T01:00:00Z'), new Date('2026-11-15T18:30:00Z')).map((d) => d.getUTCHours())).toEqual([6, 12, 18]);
  });
  it('uses the final analysis, else the preliminary one', async () => {
    const fake = (async (url: string) => {
      const u = new URL(url);
      const final = u.searchParams.get('layers')!.startsWith('HRDPA_');
      const late = u.searchParams.get('time') === '2026-11-16T18:00:00Z';
      const body = final && late ? { features: [] } : { features: [{ properties: { value: final ? 1 : 0.9 } }] };
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    const obs = await fetchObserved(49, -123, new Date('2026-11-16T12:00:00Z'), new Date('2026-11-16T18:00:00Z'), fake);
    expect(obs.map((o) => [o.mm, o.prelim])).toEqual([[1, false], [0.9, true]]);
  });
});
