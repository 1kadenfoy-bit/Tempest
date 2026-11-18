import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_PLACES, fieldAt, gridFor, gridUrl, parseGrid, parsePoint, pointUrl, stepsFor } from './cams';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/** The repacked recorded answer, unpacked into Open-Meteo's own shape for a grid's places (null where not recorded). */
export function answerFor(lats: number[], lons: number[], from: string, to: string) {
  const rec = fx('cams-manning-2026-08.json') as { requested: [number, number][]; time: string[]; pm2_5: (number | null)[][] };
  const i0 = rec.time.findIndex((t) => t >= `${from}T00:00`), i1 = rec.time.findLastIndex((t) => t <= `${to}T23:00`);
  const time = rec.time.slice(i0, i1 + 1);
  const out = [];
  for (const a of lats) for (const o of lons) {
    const k = rec.requested.findIndex(([x, y]) => Math.abs(x - a) < 1e-6 && Math.abs(y - o) < 1e-6);
    out.push({ latitude: a, longitude: o, hourly: { time, pm2_5: k < 0 ? time.map(() => null) : rec.pm2_5[k]!.slice(i0, i1 + 1) } });
  }
  return out;
}

describe('CAMS via Open-Meteo (recorded August 2026 answers around Manning Park)', () => {
  it('asks for CAMS’s own 0.4° cell centres, wider apart for a wide view', () => {
    const g = gridFor([-121.5, 48.7, -120.1, 49.5])!;
    expect(g.spacing).toBeCloseTo(0.4);
    expect(g.lats).toEqual([48.4, 48.8, 49.2, 49.6]);
    expect(g.lons[0]).toBeCloseTo(-121.6);
    const wide = gridFor([-130, 48, -114, 58])!;
    expect(wide.lats.length * wide.lons.length).toBeLessThanOrEqual(MAX_PLACES);
    expect(wide.spacing).toBeGreaterThan(0.4);
    const u = new URL(gridUrl(g, new Date('2026-08-08T00:00:00Z'), new Date('2026-08-14T00:00:00Z')));
    expect(u.searchParams.get('latitude')!.split(',')).toHaveLength(g.lats.length * g.lons.length);
    expect(u.searchParams.get('domains')).toBe('cams_global');
    expect(u.searchParams.get('start_date')).toBe('2026-08-08');
    expect(new URL(pointUrl(49.07, -120.8, new Date(), new Date())).searchParams.get('latitude')).toBe('49.2');
  });

  it('turns a many-place answer into hourly fields, rows south to north', () => {
    const g = gridFor([-121.5, 48.7, -120.1, 49.5])!;
    const b = parseGrid(answerFor(g.lats, g.lons, '2026-08-09', '2026-08-11'), g);
    expect(b.times).toHaveLength(72);
    const i = b.times.findIndex((t) => t.toISOString() === '2026-08-10T00:00:00.000Z');
    const f = fieldAt(b, i)!;
    expect(f.nx).toBe(g.lons.length);
    expect(f.bbox[1]).toBeCloseTo(48.2);
    // Aug 10, 00Z: heavy smoke over the Manning area (CAMS cell 49.2, -120.8: 83.6 µg/m³).
    const k = g.lats.indexOf(49.2) * g.lons.length + g.lons.findIndex((o) => Math.abs(o + 120.8) < 1e-6);
    expect(f.values.pm2_5![k]).toBeCloseTo(83.6, 1);
    expect(() => parseGrid([], g)).toThrow();
  });

  it('reads the pin’s series and steps to the last hour with a value', () => {
    const s = parsePoint(fx('cams-two-points-2026-08-10.json'), 49.07, -120.8);
    expect(s.times[0]!.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(s.values.pm2_5![0]).toBeCloseTo(83.6);
    const now = new Date('2026-08-10T00:30:00Z');
    const steps = stepsFor({ times: s.times, values: s.values.pm2_5! }, now);
    expect(steps[0]!.toISOString()).toBe('2026-08-08T00:00:00.000Z');
    expect(steps.at(-1)!.toISOString()).toBe('2026-08-10T23:00:00.000Z');
  });
});
