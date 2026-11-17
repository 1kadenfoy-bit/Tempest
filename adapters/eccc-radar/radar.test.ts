// Contract tests against real GeoMet answers saved on Nov 17, 2026 (fixtures/).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  COVERAGE, PRODUCTS, TYPE_NEAR_KM, capabilitiesUrl, classWords, durationMs, expandTimes, featureInfoUrl, parseFeatureInfo,
  parseTimes, radarAt, source, tileUrl,
} from './radar';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const text = (name: string) => fixture(name).toString('utf8');
const json = (name: string) => JSON.parse(text(name)) as unknown;

/** A tiny PNG reader (8-bit RGBA, not interlaced: what GeoMet's legends are), for checking colours. */
function readPng(buf: Buffer) {
  let p = 8;
  let width = 0, height = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); expect([data[8], data[9], data[12]]).toEqual([8, 6, 0]); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= 4 ? px[y * stride + x - 4]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4]! : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  return (x: number, y: number) => '#' + [0, 1, 2].map((k) => px[y * stride + x * 4 + k]!.toString(16).padStart(2, '0')).join('');
}

describe('ECCC radar adapter', () => {
  it('declares an online-only source with its licence', () => {
    expect(source.offline).toBe(false);
    expect(source.licence).toContain('Open Government Licence');
    expect(source.terms).toMatch(/prohibited/);
  });

  it('reads the time dimension from real GetCapabilities answers', () => {
    const rain = parseTimes(text('caps-RADAR_1KM_RRAI-2026-11-17.xml'), 'RADAR_1KM_RRAI');
    expect(rain).toHaveLength(31);
    expect(rain[0]!.toISOString()).toBe('2026-11-17T10:54:00.000Z');
    expect(rain[30]!.toISOString()).toBe('2026-11-17T13:54:00.000Z');
    expect(rain[1]!.getTime() - rain[0]!.getTime()).toBe(6 * 60_000);
    const type = parseTimes(text('caps-Radar_1km_SfcPrecipType-2026-11-17.xml'), 'Radar_1km_SfcPrecipType');
    expect(type.at(-1)!.toISOString()).toBe('2026-11-17T13:48:00.000Z');
    expect(parseTimes(text('caps-RADAR_1KM_RSNO-2026-11-17.xml'), 'RADAR_1KM_RSNO')).toHaveLength(31);
    expect(parseTimes(text('caps-RADAR_COVERAGE_RRAI.INV-2026-11-17.xml'), COVERAGE.layer)).toHaveLength(31);
    // A layer the answer does not hold.
    expect(parseTimes(text('caps-RADAR_1KM_RRAI-2026-11-17.xml'), 'RADAR_1KM_RSNO')).toEqual([]);
  });

  it('expands time lists and durations', () => {
    expect(durationMs('PT6M')).toBe(360_000);
    expect(durationMs('PT1H')).toBe(3_600_000);
    expect(durationMs('P1D')).toBe(86_400_000);
    expect(expandTimes('2026-11-17T10:00:00Z/2026-11-17T10:20:00Z/PT10M').map((d) => d.toISOString().slice(11, 16))).toEqual(['10:00', '10:10', '10:20']);
    expect(expandTimes('2026-11-17T10:06:00Z, 2026-11-17T10:00:00Z')).toHaveLength(2);
    expect(expandTimes('nonsense')).toEqual([]);
  });

  it('asks GeoMet for capabilities, tiles and points', () => {
    expect(capabilitiesUrl('RADAR_1KM_RRAI')).toBe('https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI');
    const t = tileUrl('RADAR_1KM_RRAI', 'Radar-Rain_14colors', new Date('2026-11-17T13:54:00Z'));
    expect(t.endsWith('&bbox={bbox-epsg-3857}')).toBe(true);
    const q = new URL(t.replace('{bbox-epsg-3857}', '0,0,1,1')).searchParams;
    expect(q.get('time')).toBe('2026-11-17T13:54:00Z');
    expect(q.get('crs')).toBe('EPSG:3857');
    expect(q.get('width')).toBe('512');
    const f = new URL(featureInfoUrl('RADAR_1KM_RRAI', 49.38, -123.28, new Date('2026-11-17T13:54:00Z'))).searchParams;
    expect(f.get('info_format')).toBe('application/json');
    expect(f.get('bbox')).toBe('49.37000,-123.29000,49.39000,-123.27000');
  });

  it('reads point answers: rain, nothing seen, outside radar range', () => {
    expect(parseFeatureInfo(json('fi-rrai-rain-2026-11-17.json'))).toMatchObject({ value: expect.closeTo(0.929, 3), cls: '0.1 - 1.0 (mm/h)' });
    expect(parseFeatureInfo(json('fi-rrai-none-2026-11-17.json'))).toMatchObject({ value: 0, cls: 'Undetected' });
    expect(parseFeatureInfo(json('fi-rrai-outside-2026-11-17.json'))).toBeNull();
    expect(classWords('LightRain')).toBe('Light rain');
    expect(classWords('Light Rain')).toBe('Light rain');
    expect(classWords('ModerateHeavyFreezingRain')).toBe('Moderate heavy freezing rain');
  });

  const answer = (map: Record<string, string>): typeof fetch => (async (url: string | URL | Request) => {
    const layer = new URL(String(url)).searchParams.get('layers')!;
    return new Response(text(map[layer]!), { status: 200 });
  }) as typeof fetch;
  const t = new Date('2026-11-17T13:48:00Z');

  it('gives the rate at the pin, or says it is outside radar range', async () => {
    expect(await radarAt('rain', 49.38, -123.28, t, answer({ RADAR_1KM_RRAI: 'fi-rrai-rain-2026-11-17.json' }))).toMatchObject({ covered: true, detected: true, rate: expect.closeTo(0.929, 3), unit: 'mm/h' });
    expect(await radarAt('snow', 49.38, -123.28, t, answer({ RADAR_1KM_RSNO: 'fi-rsno-2026-11-17.json' }))).toMatchObject({ covered: true, detected: true, rate: expect.closeTo(0.694, 3), unit: 'cm/h' });
    expect(await radarAt('rain', 58.5, -128, t, answer({ RADAR_1KM_RRAI: 'fi-rrai-outside-2026-11-17.json' }))).toMatchObject({ covered: false, detected: false });
  });

  it('names the type only when ECCC’s answer is at the pin (it answers with the nearest rain, up to 20 km away)', async () => {
    const near = await radarAt('type', 49.38, -123.28, t, answer({ RADAR_1KM_RRAI: 'fi-rrai-rain-2026-11-17.json', Radar_1km_SfcPrecipType: 'fi-type-near-2026-11-17.json' }));
    expect(near).toEqual({ covered: true, detected: true, rate: null, unit: null, kind: 'Light rain' });
    // Nothing at the pin's own pixel: the far answer is not used.
    const none = await radarAt('type', 49.38, -123.02, t, answer({ RADAR_1KM_RRAI: 'fi-rrai-none-2026-11-17.json', Radar_1km_SfcPrecipType: 'fi-type-far-2026-11-17.json' }));
    expect(none).toMatchObject({ covered: true, detected: false, kind: null });
    expect(TYPE_NEAR_KM).toBeLessThan(5);
  });

  it('copies ECCC’s legend colours exactly (checked against its GetLegendGraphic images)', () => {
    for (const shown of ['rain', 'snow'] as const) {
      const legend = PRODUCTS[shown].legend;
      if (legend.kind !== 'ramp') throw new Error('ramp expected');
      const at = readPng(fixture(`legend-${PRODUCTS[shown].layer}-2026-11-17.png`));
      // Key colours every 26 px up the bar from its foot (y 392), at x 20.
      expect(legend.colors.map((_, k) => at(20, 392 - 26 * k))).toEqual(legend.colors);
    }
    const type = PRODUCTS.type.legend;
    if (type.kind !== 'classes') throw new Error('classes expected');
    const at = readPng(fixture('legend-Radar_1km_SfcPrecipType-2026-11-17.png'));
    // Twelve blocks, top to bottom: freezing (heavy, light), hail, rain, mixed, snow (heavy to light).
    const blocks = [12, 49, 87, 126, 164, 203, 241, 280, 318, 357, 395, 434].map((y) => at(25, y + 15));
    const byGroup = (label: string) => type.groups.find((g) => g.label === label)!.colors;
    expect([...byGroup('Freezing')].reverse()).toEqual(blocks.slice(0, 2));
    expect(byGroup('Hail')).toEqual(blocks.slice(2, 3));
    expect([...byGroup('Rain')].reverse()).toEqual(blocks.slice(3, 6));
    expect([...byGroup('Mixed')].reverse()).toEqual(blocks.slice(6, 9));
    expect([...byGroup('Snow')].reverse()).toEqual(blocks.slice(9, 12));
  });
});
