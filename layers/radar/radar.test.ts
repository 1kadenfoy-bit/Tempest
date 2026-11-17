import { afterEach, describe, expect, it } from 'vitest';
import { setUnitSystem } from '../../core/units/format';
import { pointText, radarDetails, radarLayer, radarReadout, radarSummary } from './index';
import type { DetailContext, ImageLegend } from '../contract';

afterEach(() => setUnitSystem('metric'));

const legend: ImageLegend = { kind: 'classes', groups: [{ label: 'Snow', colors: ['#111111', '#222222'] }] };
const frames = [new Date('2026-11-17T13:00:00Z'), new Date('2026-11-17T13:06:00Z'), new Date('2026-11-17T13:12:00Z')];
const base = { covered: true, detected: true, rate: null, unit: null, kind: null } as const;

describe('radar layer', () => {
  it('says what the frame shows at the pin, as the source gives it', () => {
    expect(pointText({ ...base, kind: 'Light rain' })).toBe('Light rain');
    expect(pointText({ ...base, rate: 0.93, unit: 'mm/h' })).toBe('0.9 mm/h rain');
    expect(pointText({ ...base, rate: 0.69, unit: 'cm/h' })).toBe('0.7 cm/h snow');
    expect(pointText({ ...base, detected: false })).toBe('Nothing seen');
    expect(pointText({ ...base, covered: false, detected: false })).toBe('Outside radar range');
    expect(pointText('offline')).toBe('Radar needs a connection');
    expect(pointText('error')).toBe('Radar not reachable');
    expect(pointText(null)).toBe('…');
    setUnitSystem('imperial');
    expect(pointText({ ...base, rate: 2.54, unit: 'cm/h' })).toBe('1.00 in/h snow');
  });

  it('names the frame and its age', () => {
    const r = radarReadout({ series: null, elevation: 0, radar: { frames, time: frames[1]!, point: { ...base, kind: 'Light snow' } } }, new Date('2026-11-17T13:24:00Z'));
    expect(r).toEqual({ value: 'Light snow', note: 'radar · 18 min ago' });
  });

  it('sums up the frames, and warns that radar misses mountain weather', () => {
    const pin = { series: null, elevation: 0, radar: { frames, time: frames[2]!, point: { ...base, covered: false, detected: false } } };
    expect(radarSummary(pin)).toMatchObject({ kind: 'whole', lines: ['3 frames · every 6 min'] });
    const ctx = { pin, cursor: frames[2]!, now: new Date('2026-11-17T13:20:00Z') } as unknown as DetailContext;
    const cards = radarDetails(ctx);
    expect(cards[0]).toMatchObject({ kind: 'headline', value: 'Outside radar range' });
    expect(cards.map((c) => c.kind)).toEqual(['headline', 'stats', 'status', 'status']);
  });

  it('is online only and steps through its own frames', () => {
    const l = radarLayer(() => legend, () => 'type');
    expect(l.saveNeeds).toEqual([]);
    expect(l.frames).toEqual({ windowHours: 3, loopHours: 1, stepMinutes: 6 });
    expect(l.settings.map((s) => s.key)).toEqual(['shown', 'coverage']);
  });
});
