import { describe, expect, it } from 'vitest';
import { kucheraRatio, snowLine, wetBulb, type MoistProfile } from './wet-bulb';

const moist = (temps: number[], rh: number[]): MoistProfile => ({
  gh: Float32Array.from([0, 500, 1000, 1500, 2000]), temp: Float32Array.from(temps), rh: Float32Array.from(rh),
});

describe('wet-bulb and snow', () => {
  it('matches Stull’s worked example', () => {
    // Stull (2011): 20 °C at 50% gives 13.7 °C.
    expect(wetBulb(20, 50)).toBeCloseTo(13.7, 1);
    // Saturated air: wet-bulb is the air temperature.
    expect(wetBulb(5, 100)).toBeCloseTo(5, 0);
  });
  it('dry air lowers the snow line below the freezing level', () => {
    const t = [6, 3, 0, -3, -6];
    const wet = snowLine(moist(t, [100, 100, 100, 100, 100]))!;
    const dry = snowLine(moist(t, [60, 60, 60, 60, 60]))!;
    expect(wet).toBeGreaterThan(800);
    expect(wet).toBeLessThan(1000); // a little under the 0 °C level, at 0.5 °C
    expect(dry).toBeLessThan(wet - 200);
  });
  it('snow to sea level has no snow line', () => {
    expect(snowLine(moist([-1, -3, -5, -7, -9], [90, 90, 90, 90, 90]))).toBeNull();
  });
  it('Kuchera: 12:1 at −2 °C, drier and lighter when colder, wetter when warmer', () => {
    const at = (tmax: number) => kucheraRatio(moist([tmax, tmax - 2, tmax - 4, tmax - 6, tmax - 8], [90, 90, 90, 90, 90]), 0);
    expect(at(-1.99)).toBeCloseTo(12, 1);
    expect(at(-10)).toBeCloseTo(20, 0);
    expect(at(0)).toBeCloseTo(8, 0);
  });
});
