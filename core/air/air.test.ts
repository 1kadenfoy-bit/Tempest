import { describe, expect, it } from 'vitest';
import { PM25_STOPS, aqhiShown, pm25Position, pm25Ramp } from './pm25';
import { rampColor } from '../color/ramp';
import { airIndex, airValue, aqhiForecastAt } from './state';
import { bcDate, directionTo, fireTitle, issuedDate, type Fire } from './fires';

describe('PM2.5 scale', () => {
  it('holds ECCC’s colour at each breakpoint and draws nothing under 1 µg/m³', () => {
    const r = pm25Ramp();
    for (const s of PM25_STOPS) {
      const [a, b, c] = rampColor(r, s.value);
      expect(`#${[a, b, c].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join('')}`).toBe(s.color);
    }
    expect(rampColor(r, 0.5)[3]).toBe(0);
    expect(pm25Position(1)).toBe(0);
    expect(pm25Position(500)).toBe(1);
    expect(pm25Position(15)).toBeCloseTo(1.5 / 12);
  });

  it('shows the AQHI as ECCC does', () => {
    expect(aqhiShown(1.41)).toEqual({ text: '1', risk: 'Low risk' });
    expect(aqhiShown(4)).toEqual({ text: '4', risk: 'Moderate risk' });
    expect(aqhiShown(10.4)).toEqual({ text: '10', risk: 'High risk' });
    expect(aqhiShown(12)).toEqual({ text: '10+', risk: 'Very high risk' });
  });
});

describe('air state helpers', () => {
  const t0 = new Date('2026-08-10T00:00:00Z');
  const t1 = new Date('2026-08-10T01:00:00Z');
  const series = { label: { source: 's', model: 'm', run: t0, gridKm: 10, licence: '', attribution: '', fetchedAt: t0, offline: false }, lat: 0, lon: 0, times: [t0, t1], stepHours: 1, values: { pm2_5_smoke: [12, NaN] } };
  it('reads the value for the cursor’s hour, nothing for a missing one', () => {
    expect(airValue(series, airIndex(series, t0))).toBe(12);
    expect(airValue(series, airIndex(series, t1))).toBeNull();
    expect(airIndex(series, new Date('2026-08-11T00:00:00Z'))).toBe(-1);
    expect(aqhiForecastAt({ station: '', stationId: '', km: 0, published: t0, hours: [{ time: t1, value: 3 }] }, t1)?.value).toBe(3);
  });
});

describe('fire helpers', () => {
  it('reads issued dates and BC days', () => {
    expect(issuedDate('2026-07-24Z')).toBe('2026-07-24');
    expect(issuedDate(null)).toBeNull();
    // 06:00 UTC on Aug 10 is still Aug 9 in BC.
    expect(bcDate(new Date('2026-08-10T06:00:00Z'))).toBe('2026-08-09');
  });
  it('names a fire and a direction', () => {
    const f = { id: 'K61186', name: 'K61186', place: 'Pasayten River' } as Fire;
    expect(fireTitle(f)).toBe('Pasayten River');
    expect(fireTitle({ ...f, name: 'Lytton Creek' })).toBe('Lytton Creek');
    expect(directionTo({ lat: 49, lon: -121 }, { lat: 48.9, lon: -120.9 })).toBe('SE');
  });
});
