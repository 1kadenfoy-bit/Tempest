import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readGeoTiff } from './geotiff';
import { LAYERS, boxFor, coverageUrl, expandDimension, fetchPointSeries, parseCapabilities, parsePoint, pointUrl, runFor, stepsFor, tiffToField } from './raqdps';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const buf = (name: string) => { const b = fx(name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

describe('RAQDPS adapter (recorded GeoMet answers, Nov 18, 2026)', () => {
  const caps = parseCapabilities(fx('caps-RAQDPS.Sfc_PM2.5-WildfireSmokePlume-2026-11-18.xml').toString('utf8'), LAYERS.pm2_5_smoke);

  it('reads the hours and runs from the capabilities', () => {
    expect(caps.times[0]!.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(caps.times.at(-1)!.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    expect(caps.times).toHaveLength(73);
    expect(caps.runs.map((r) => r.toISOString().slice(0, 13))).toEqual(['2026-11-16T00', '2026-11-16T12', '2026-11-17T00', '2026-11-17T12', '2026-11-18T00']);
  });

  it('expands a list or a range', () => {
    expect(expandDimension('2026-11-18T00:00:00Z/2026-11-18T03:00:00Z/PT1H')).toHaveLength(4);
    expect(expandDimension('2026-11-18T00:00:00Z,2026-11-18T12:00:00Z')).toHaveLength(2);
  });

  it('steps from two days back to the newest run’s end, each from the newest run that had started', () => {
    const now = new Date('2026-11-18T06:40:00Z');
    const s = stepsFor(caps, now);
    expect(s[0]!.toISOString()).toBe('2026-11-16T06:00:00.000Z');
    expect(s.at(-1)!.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    expect(runFor(caps, new Date('2026-11-17T05:00:00Z'))!.toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(runFor(caps, new Date('2026-11-20T05:00:00Z'))!.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(runFor(caps, new Date('2026-11-15T05:00:00Z'))).toBeNull();
  });

  it('snaps the view to whole degrees at the model’s spacing, coarser for wide views', () => {
    const b = boxFor([-121.3, 48.9, -120.2, 49.6], [-140, 47, -113, 61])!;
    expect(b.bbox).toEqual([-122, 48, -120, 50]);
    expect(b.nx).toBe(22);
    const wide = boxFor([-139, 48, -114, 60], [-140, 47, -113, 61])!;
    expect(wide.nx * wide.ny).toBeLessThanOrEqual(160 * 120 * 1.05);
    const u = new URL(coverageUrl(LAYERS.pm2_5, b, new Date('2026-11-18T12:00:00Z'), new Date('2026-11-18T00:00:00Z')));
    expect(u.searchParams.getAll('subset')).toEqual(['lat(48,50)', 'long(-122,-120)']);
    expect(u.searchParams.get('scalesize')).toBe('long(22),lat(22)');
    expect(u.searchParams.get('format')).toBe('image/tiff');
    expect(u.searchParams.get('time')).toBe('2026-11-18T12:00:00Z');
    expect(u.searchParams.get('dim_reference_time')).toBe('2026-11-18T00:00:00Z');
  });

  it('reads GeoMet’s GeoTIFF: 32-bit floats, top-left tie point', () => {
    const r = readGeoTiff(buf('wcs-RAQDPS.SFC_PM2.5-manning-2026-11-18T12.tif'));
    expect([r.width, r.height]).toEqual([56, 33]);
    expect(r.west).toBeCloseTo(-123, 2);
    expect(r.north).toBeCloseTo(51, 2);
    expect(r.dx).toBeCloseTo(0.0893, 3);
  });

  it('turns the answer into µg/m³ on a grid, rows south to north', () => {
    const f = tiffToField(buf('wcs-RAQDPS.SFC_PM2.5-manning-2026-11-18T12.tif'), 'pm2_5', new Date('2026-11-18T12:00:00Z'), new Date('2026-11-18T00:00:00Z'));
    expect(f.bbox[0]).toBeCloseTo(-123, 2);
    expect(f.bbox[1]).toBeCloseTo(48, 1);
    const v = [...f.values.pm2_5!];
    // November: a clean day, mostly a few µg/m³ of all particles (78 at the most, likely a valley inversion).
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBeLessThan(150);
    expect(Math.max(...v)).toBeGreaterThan(0.1);
    const smoke = tiffToField(buf('wcs-RAQDPS.Sfc_PM2.5-WildfireSmokePlume-manning-2026-11-18T12.tif'), 'pm2_5_smoke', new Date(), new Date());
    expect(Math.max(...smoke.values.pm2_5_smoke!)).toBeLessThan(Math.max(...v));
  });

  it('refuses what it cannot read', () => {
    expect(() => readGeoTiff(new TextEncoder().encode('<xml/>').buffer)).toThrow();
  });

  it('reads a point answer with its hour and run', () => {
    const got = parsePoint(JSON.parse(fx('gfi-RAQDPS.SFC_PM2.5-manning-2026-11-18T12.json').toString('utf8')))!;
    expect(got.value).toBeGreaterThan(0);
    expect(got.value).toBeLessThan(60);
    expect(got.time!.toISOString()).toBe('2026-11-18T12:00:00.000Z');
    expect(got.run!.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(parsePoint({ features: [] })).toBeNull();
    const u = new URL(pointUrl(LAYERS.pm2_5, 49.07, -120.8, new Date('2026-11-18T12:00:00Z'), new Date('2026-11-18T00:00:00Z')));
    expect(u.searchParams.get('request')).toBe('GetFeatureInfo');
  });

  it('builds the pin’s series hour by hour, naming earlier runs', async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      const u = new URL(url);
      asked.push(u.searchParams.get('dim_reference_time')!);
      return new Response(JSON.stringify({ features: [{ properties: { value: 2e-8, time: u.searchParams.get('time'), dim_reference_time: u.searchParams.get('dim_reference_time') } }] }));
    }) as typeof fetch;
    const steps = [new Date('2026-11-17T22:00:00Z'), new Date('2026-11-17T23:00:00Z'), new Date('2026-11-18T00:00:00Z'), new Date('2026-11-18T01:00:00Z')];
    const s = await fetchPointSeries('pm2_5_smoke', caps, steps, 49.07, -120.8, fake, 2);
    expect(s.values.pm2_5_smoke).toEqual([20, 20, 20, 20].map((x) => expect.closeTo(x, 5)));
    expect(s.segments!.map((x) => x.kind)).toEqual(['earlier', 'forecast']);
    expect(asked.filter((a) => a.startsWith('2026-11-17T12'))).toHaveLength(2);
  });
});
