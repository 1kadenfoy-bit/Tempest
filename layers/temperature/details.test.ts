// Traceability: every number on the temperature cards comes from the pin's
// series, read at the pin's height (M5 "done when").
import { describe, expect, it } from 'vitest';
import { PROFILE_LEVELS, type PointSeries } from '../../core/vocabulary';
import type { DetailContext } from '../contract';
import { temperature } from './index';

const H = 3_600_000;
const t0 = Date.parse('2026-11-16T08:00:00Z'); // midnight in BC (PST) — any hour works

/** 24 hours; 0 °C at 1,000 m plus a daily swing; lapse 6.5 °C/km; light wind. */
function series(): PointSeries {
  const times = Array.from({ length: 24 }, (_, i) => new Date(t0 + i * H));
  const swing = (i: number) => 4 * Math.sin(((i - 9) / 24) * 2 * Math.PI);
  const values: PointSeries['values'] = { temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [] };
  PROFILE_LEVELS.forEach((l, k) => {
    const z = k * 350;
    values[`geopotential_height_${l}hPa`] = times.map(() => z);
    values[`temperature_${l}hPa`] = times.map((_, i) => -0.0065 * (z - 1000) + swing(i));
    values[`relative_humidity_${l}hPa`] = times.map(() => 80);
  });
  times.forEach(() => { values.temperature_2m!.push(5); values.relative_humidity_2m!.push(80); values.wind_speed_10m!.push(2); });
  return { label: {} as PointSeries['label'], lat: 49.39, lon: -122.95, times, stepHours: 1, values };
}

describe('temperature details trace to the series', () => {
  const s = series();
  const ctx: DetailContext = {
    pin: { series: s, elevation: 1180 }, index: 12, cursor: s.times[12]!,
    start: new Date(t0 - 12 * H), end: new Date(t0 + 36 * H), now: s.times[12]!,
    bands: { valleyTop: 600, alpineBottom: 1400, approximate: true, region: 'South Coast' }, settings: {},
  };
  const cards = temperature.details(ctx);
  const atPin = (i: number) => -0.0065 * (1180 - 1000) + 4 * Math.sin(((i - 9) / 24) * 2 * Math.PI);

  it('headline is the temperature at the pin’s height at the cursor', () => {
    const h = cards[0]!;
    expect(h.kind).toBe('headline');
    if (h.kind === 'headline') expect(h.value).toBe(`${Math.round(atPin(12)) < 0 ? '−' : ''}${Math.abs(Math.round(atPin(12))) || 0} °C`);
  });

  it('TODAY low and high are the series’ extremes at the pin, with their hours', () => {
    const st = cards[1]!;
    if (st.kind !== 'stats') throw new Error('no stats');
    const temps = s.times.map((_, i) => atPin(i));
    const lo = temps.indexOf(Math.min(...temps));
    const hi = temps.indexOf(Math.max(...temps));
    const fmt = (v: number) => Math.round(v);
    expect(st.stats[0]!.value).toContain(String(Math.abs(fmt(temps[lo]!))));
    expect(st.stats[1]!.value).toContain(String(Math.abs(fmt(temps[hi]!))));
    expect(lo).toBe(3); // the swing's lowest hour
    expect(hi).toBe(15); // and its highest
  });

  it('freezing level is where the cursor hour’s profile crosses 0 °C', () => {
    const st = cards[1]!;
    if (st.kind !== 'stats') throw new Error('no stats');
    const expected = 1000 + atPin(12) / 0.0065 + 180; // 0 °C height for that hour
    expect(Number(st.stats[2]!.value.replace(',', ''))).toBeCloseTo(Math.round(expected / 10) * 10, -1);
  });

  it('BY ELEVATION puts the pin on its own profile', () => {
    const be = cards.find((c) => c.kind === 'value-elevation');
    if (!be || be.kind !== 'value-elevation') throw new Error('no profile card');
    expect(be.you.elevation).toBe(1180);
    expect(be.you.value).toBeCloseTo(atPin(12), 5);
  });
});
