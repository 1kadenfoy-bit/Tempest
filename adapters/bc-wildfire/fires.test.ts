import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centreName, parsePerimeters, parsePoints, perimetersUrl, pointsUrl } from './fires';
import { burningAt, firesAt, firesNear } from '../../core/air/fires';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
const fires = parsePoints(fx('fire-points-manning-2026-11-18.json'));

describe('BC Wildfire adapter (recorded answers around Manning Park, Nov 18, 2026)', () => {
  it('asks only for fires still burning or out in the last days', () => {
    const u = new URL(pointsUrl('2026-11-15'));
    expect(u.searchParams.get('CQL_FILTER')).toBe("FIRE_STATUS<>'Out' OR FIRE_OUT_DATE>='2026-11-15'");
    expect(u.searchParams.get('propertyName')).toContain('FIRE_URL');
    expect(new URL(perimetersUrl(['K61186', "x'); DROP"])).searchParams.get('CQL_FILTER')).toBe("FIRE_NUMBER IN ('K61186','xDROP')");
  });

  it('reads every fire as issued', () => {
    expect(fires.length).toBe(405);
    const k = fires.find((f) => f.id === 'K61186')!;
    expect(k.place).toBe('Pasayten River');
    expect(k.ignition).toBe('2026-07-24');
    expect(k.out).toBe('2026-09-28');
    expect(k.status).toBe('Out');
    expect(k.sizeHa).toBe(500);
    expect(k.url).toMatch(/^https:\/\/wildfiresituation\.nrs\.gov\.bc\.ca\/incidents\?fireYear=2026&incidentNumber=K61186$/);
    expect(centreName(k.centre)).toBe('Kamloops');
    expect(centreName(9)).toBe('Fire centre 9');
  });

  it('shows the fires burning at the cursor’s time by their issued dates; now, by their status', () => {
    const now = new Date('2026-11-18T07:00:00Z');
    const aug10 = new Date('2026-08-10T07:00:00Z');
    const k = fires.find((f) => f.id === 'K61186')!;
    expect(burningAt(k, aug10, now)).toBe(true);
    expect(burningAt(k, new Date('2026-07-23T20:00:00Z'), now)).toBe(false);
    // Declared out on Sep 28: not burning that day.
    expect(burningAt(k, new Date('2026-09-28T20:00:00Z'), now)).toBe(false);
    expect(burningAt(k, now, now)).toBe(false);
    expect(firesAt(fires, aug10, now).length).toBeGreaterThan(5);
    const near = firesNear(fires, { lat: 49.07, lon: -120.8 }, aug10, now, 50);
    expect(near[0]!.km).toBeLessThanOrEqual(near.at(-1)!.km);
    expect(near.some((x) => x.fire.id === 'K61186')).toBe(true);
  });

  it('reads perimeters with their mapped date', () => {
    const p = parsePerimeters(fx('fire-perimeters-manning-2026-11-18.json'));
    expect(p).toHaveLength(14);
    const k = p.find((x) => x.properties.fire === 'K61186')!;
    expect(k.properties.mapped).toBe('2026-08-21');
    expect(k.geometry.type).toBe('MultiPolygon');
  });
});
