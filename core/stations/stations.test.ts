import { afterEach, describe, expect, it } from 'vitest';
import { cellsFor, distanceKm, inBox, isStale, markerKind, markerLabel, newest, timeline, type StationObservation } from './stations';
import { formatAgo, setUnitSystem } from '../units/format';

const obs = (time: string, o: Partial<StationObservation> = {}): StationObservation => ({
  time: new Date(time), airTemp: null, windSpeed: null, windDir: null, gust: null, precip1h: null, snowDepth: null, ...o,
});

afterEach(() => setUnitSystem('metric'));

describe('station marker labels', () => {
  const o = obs('2026-11-17T13:00:00Z', { airTemp: -0.9, windSpeed: 9.4, windDir: 79, gust: 13.3, precip1h: 0.4 });

  it('matches the condition layer', () => {
    expect(markerKind('temperature')).toBe('temp');
    expect(markerKind('wind')).toBe('wind');
    expect(markerKind('precipitation')).toBe('precip');
    expect(markerKind('avalanche')).toBeNull();
    expect(markerLabel(o, 'radar')).toBeNull();
  });

  it('temperature: air temperature, whole degrees with a real minus', () => {
    expect(markerLabel(o, 'temperature')).toEqual({ text: '−1°', arrow: null, spoken: 'air −1°' });
    setUnitSystem('imperial');
    expect(markerLabel(o, 'temperature')!.text).toBe('30°');
  });

  it('wind: speed, and an arrow pointing where the wind goes', () => {
    expect(markerLabel(o, 'wind')).toEqual({ text: '9', arrow: 259, spoken: 'wind 9 km/h from E' });
    setUnitSystem('imperial');
    expect(markerLabel(o, 'wind')!.text).toBe('6');
    // Calm: no arrow.
    expect(markerLabel(obs('2026-11-17T13:00:00Z', { windSpeed: 0, windDir: 274 }), 'wind')!.arrow).toBeNull();
  });

  it('precipitation: the past hour, in the unit setting', () => {
    expect(markerLabel(o, 'precipitation')!.text).toBe('0.4 mm');
    setUnitSystem('imperial');
    expect(markerLabel(o, 'precipitation')!.text).toBe('0.02 in');
  });

  it('nothing when the station did not measure it', () => {
    const bare = obs('2026-11-17T13:00:00Z', { airTemp: 4 });
    expect(markerLabel(bare, 'wind')).toBeNull();
    expect(markerLabel(bare, 'precipitation')).toBeNull();
    expect(markerLabel(null, 'temperature')).toBeNull();
  });
});

describe('station readings', () => {
  it('newest reading with a value; stale after two hours', () => {
    const list = [obs('2026-11-17T12:00:00Z', { airTemp: 1 }), obs('2026-11-17T14:00:00Z'), obs('2026-11-17T13:00:00Z', { airTemp: 2 })];
    expect(newest(list)!.airTemp).toBe(2);
    const now = new Date('2026-11-17T14:10:00Z');
    expect(isStale(newest(list), now)).toBe(false);
    expect(isStale(obs('2026-11-16T17:00:00Z', { airTemp: -1.8 }), now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });

  it('timeline: oldest first, one per time', () => {
    const t = timeline([obs('2026-11-17T13:00:00Z', { airTemp: 2 }), obs('2026-11-17T12:00:00Z'), obs('2026-11-17T13:00:00Z', { airTemp: 3 })]);
    expect(t.map((o) => o.time.getUTCHours())).toEqual([12, 13]);
    expect(t[1]!.airTemp).toBe(3);
  });

  it('age text', () => {
    const now = new Date('2026-11-17T14:10:00Z');
    expect(formatAgo(new Date('2026-11-17T14:09:30Z'), now)).toBe('just now');
    expect(formatAgo(new Date('2026-11-17T13:45:00Z'), now)).toBe('25 min ago');
    expect(formatAgo(new Date('2026-11-17T13:00:00Z'), now)).toBe('1 h ago');
    expect(formatAgo(new Date('2026-11-16T17:00:00Z'), now)).toBe('21 h ago');
    expect(formatAgo(new Date('2026-11-14T14:00:00Z'), now)).toBe('3 d ago');
  });
});

describe('where to ask', () => {
  it('whole-degree cells covering the view', () => {
    expect(cellsFor([-123.4, 49.2, -122.8, 49.6])).toEqual([[-124, 49, -123, 50], [-123, 49, -122, 50]]);
    expect(cellsFor([-123.2, 49.9, -123.1, 50.1])).toEqual([[-124, 49, -123, 50], [-124, 50, -123, 51]]);
  });

  it('distance and box', () => {
    // Mt. Strachan to Mount Seymour: about 18 km.
    expect(distanceKm({ lat: 49.41003, lon: -123.19636 }, { lat: 49.3895, lon: -122.948 })).toBeCloseTo(18.1, 0);
    expect(inBox({ lat: 49.4, lon: -123.2 }, [-124, 49, -123, 50])).toBe(true);
    expect(inBox({ lat: 50.4, lon: -123.2 }, [-124, 49, -123, 50])).toBe(false);
  });
});
