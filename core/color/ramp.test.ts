import { describe, expect, it } from 'vitest';
import tokens from '../../design/tokens.json';
import { lookupStrip, rampColor, rampPosition, type Ramp } from './ramp';

const p = tokens.data.precipitation;
const rain: Ramp = { valueStops: p.valueStops as [number, number][], colors: p.rain.dark, cutoff: p.cutoff };

describe('colour ramps', () => {
  it('follows the value stops', () => {
    expect(rampPosition(rain, 0.5)).toBeCloseTo(0.18);
    expect(rampPosition(rain, 4)).toBeCloseTo(0.55 + 0.45 * 0.5);
  });
  it('saturates at the top stop', () => {
    expect(rampColor(rain, 6)).toEqual(rampColor(rain, 40));
    expect(rampColor(rain, 6)).toEqual([0x6c, 0xc4, 0xe6, 1]);
  });
  it('draws nothing under the cutoff', () => {
    expect(rampColor(rain, 0.05)[3]).toBe(0);
    expect(rampColor(rain, 0.1)[3]).toBe(1);
  });
  it('can fade light amounts so the map shows through', () => {
    const a = { from: 0.4, full: 0.55 };
    expect(rampColor(rain, 0.1, a)[3]).toBeCloseTo(0.4);
    expect(rampColor(rain, 2, a)[3]).toBe(1);
    expect(rampColor(rain, 0.05, a)[3]).toBe(0);
  });
  it('gets lighter as values rise', () => {
    const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    const strip = lookupStrip(rain, 0.1, 6, 32);
    for (let i = 1; i < strip.length; i++) expect(lum(strip[i]!)).toBeGreaterThanOrEqual(lum(strip[i - 1]!));
  });
});
