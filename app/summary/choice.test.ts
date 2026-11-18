import { describe, expect, it } from 'vitest';
import type { VariableName } from '../../core/vocabulary';
import { DEFAULT_SUMMARY, includedLayers, isIncluded, needsSeries, setIncluded, summaryCandidates, unionNeeds } from './choice';

const layer = (id: string, pinNeeds: VariableName[] = [], frames?: { windowHours: number; loopHours: number; stepMinutes: number }) => ({ id, pinNeeds, frames });
// The app's layers in menu order, plus a layer added later (it must appear, off).
const LAYERS = [
  layer('precipitation', ['precipitation', 'snowfall_water_equivalent', 'temperature_850hPa']),
  layer('temperature', ['temperature_850hPa', 'temperature_2m']),
  layer('wind', ['wind_speed_10m', 'temperature_850hPa']),
  layer('radar', [], { windowHours: 3, loopHours: 1, stepMinutes: 6 }),
  layer('avalanche'),
  layer('air-quality', ['temperature_2m']),
];

describe('the forecast summary window’s layers', () => {
  it('lists every layer whose chart works on the forecast’s time line, in the app’s order', () => {
    expect(summaryCandidates(LAYERS).map((l) => l.id)).toEqual(['precipitation', 'temperature', 'wind', 'avalanche', 'air-quality']);
  });

  it('shows precipitation, temperature and wind until changed; the rest start off', () => {
    expect(DEFAULT_SUMMARY).toEqual(['precipitation', 'temperature', 'wind']);
    expect(includedLayers(LAYERS, undefined).map((l) => l.id)).toEqual(['precipitation', 'temperature', 'wind']);
    expect(includedLayers(LAYERS, {}).map((l) => l.id)).toEqual(['precipitation', 'temperature', 'wind']);
    expect(isIncluded('avalanche', null)).toBe(false);
    expect(isIncluded('air-quality', null)).toBe(false);
  });

  it('remembers a layer switched on or off, and leaves the others at their default', () => {
    let choice = setIncluded(undefined, 'avalanche', true);
    choice = setIncluded(choice, 'wind', false);
    expect(choice).toEqual({ avalanche: true, wind: false });
    expect(includedLayers(LAYERS, choice).map((l) => l.id)).toEqual(['precipitation', 'temperature', 'avalanche']);
    // A layer added later keeps its default (off) until chosen.
    expect(isIncluded('air-quality', choice)).toBe(false);
    // Switching does not change the object it came from.
    const before = { wind: true };
    setIncluded(before, 'wind', false);
    expect(before).toEqual({ wind: true });
  });

  it('never shows radar, even if a choice says so', () => {
    expect(includedLayers(LAYERS, { radar: true }).map((l) => l.id)).not.toContain('radar');
  });

  it('can show no strip at all', () => {
    const none = { precipitation: false, temperature: false, wind: false };
    expect(includedLayers(LAYERS, none)).toEqual([]);
    expect(needsSeries([])).toBe(false);
  });
});

describe('what the strips need at the pin', () => {
  it('asks once for the union of every strip’s variables', () => {
    const shown = includedLayers(LAYERS, undefined);
    const u = unionNeeds(shown);
    expect(u.variables.sort()).toEqual(['precipitation', 'snowfall_water_equivalent', 'temperature_2m', 'temperature_850hPa', 'wind_speed_10m'].sort());
    // No variable asked for twice.
    expect(new Set(u.variables).size).toBe(u.variables.length);
    expect(u.amounts).toBe(true);
  });

  it('asks for amounts only when a strip needs them', () => {
    expect(unionNeeds([LAYERS[1]!, LAYERS[2]!]).amounts).toBe(false);
  });

  it('needs no series for an issued layer alone (avalanche)', () => {
    expect(needsSeries([LAYERS[4]!])).toBe(false);
    expect(needsSeries([LAYERS[4]!, LAYERS[1]!])).toBe(true);
  });
});
