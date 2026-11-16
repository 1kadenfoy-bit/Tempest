// Ported from the Windy plugin's tests (docs/reference/windy-plugin), in °C.
import { describe, expect, it } from 'vitest';
import { computeField, freezingLevel, isothermSegments, joinSegments, latticeAxis, sampleProfile, smoothLine, type NodeGrid, type Profile } from './toposcale';
import { dewPoint, feelsLike, humidex, windChill } from './feels-like';

// Simple atmosphere: 6.5 °C/km lapse rate, 0 °C at 1000 m (+ an offset per node).
const LEVEL_HEIGHTS = [100, 500, 1000, 1500, 3000, 5500];
const profile = (offset = 0): Profile => ({
  gh: Float32Array.from(LEVEL_HEIGHTS),
  temp: Float32Array.from(LEVEL_HEIGHTS, (z) => -0.0065 * (z - 1000) + offset),
});

describe('terrain correction (TopoSCALE)', () => {
  it('reads temperature at the given elevation, between levels', () => {
    const p = profile();
    expect(sampleProfile(p.gh, p.temp, 1000)).toBeCloseTo(0, 3);
    expect(sampleProfile(p.gh, p.temp, 2000)).toBeCloseTo(-6.5, 3);
  });

  it('extrapolates below the lowest level instead of clamping', () => {
    const p = profile();
    expect(sampleProfile(p.gh, p.temp, 0)).toBeCloseTo(6.5, 3);
  });

  it('keeps an inversion: a valley under warm air aloft reads colder than the slope above', () => {
    const p: Profile = { gh: Float32Array.from([100, 500, 1000, 1500]), temp: Float32Array.from([-8, -2, 1, -2]) };
    expect(sampleProfile(p.gh, p.temp, 200)).toBeLessThan(sampleProfile(p.gh, p.temp, 900));
  });

  it('terrain detail comes from the elevation data, not from interpolating temperatures', () => {
    // All four nodes share one profile, so any difference must come from elevation alone.
    const grid: NodeGrid = { lats: [49, 50], lons: [-123, -122], profiles: [profile(), profile(), profile(), profile()] };
    const temp = computeField(grid, [49.5], [-122.9, -122.8], [670, 2180]); // valley floor and summit
    expect(temp[0]! - temp[1]!).toBeCloseTo(0.0065 * (2180 - 670), 3);
  });

  it('interpolates profiles bilinearly between nodes', () => {
    const grid: NodeGrid = { lats: [49, 50], lons: [-123, -122], profiles: [profile(0), profile(0), profile(4), profile(4)] };
    expect(computeField(grid, [49.5], [-122.5], [1000])[0]).toBeCloseTo(2, 3);
  });

  it('lattice has at most 5 nodes, covers the range, and is stable under small pans', () => {
    for (const [min, max] of [[49.1, 50.3], [-123.4, -122.1], [50, 50.02]] as const) {
      const axis = latticeAxis(min, max, 0.02);
      expect(axis.length).toBeGreaterThanOrEqual(2);
      expect(axis.length).toBeLessThanOrEqual(5);
      expect(axis[0]).toBeLessThanOrEqual(min);
      expect(axis[axis.length - 1]).toBeGreaterThanOrEqual(max);
    }
    expect(latticeAxis(49.1, 50.3, 0.02)).toEqual(latticeAxis(49.15, 50.35, 0.02));
  });

  it('a coarser lattice reuses the finer lattice’s nodes', () => {
    const fine = latticeAxis(49.2, 49.5, 0.0225);
    const coarse = latticeAxis(49.0, 50.2, 0.0225);
    const step = fine[1]! - fine[0]!;
    // Every coarse node lies on the fine lattice, so its cached forecast is reused.
    expect(coarse.every((v) => Math.abs(v / step - Math.round(v / step)) < 1e-6)).toBe(true);
  });

  it('freezing level and the 0 °C line', () => {
    expect(freezingLevel(profile())!).toBeCloseTo(1000, 3);
    expect(freezingLevel(profile(-20))).toBeNull();
    // 2 × 2 field with a crossing between the columns.
    const segs = isothermSegments([2, -2, 2, -2], 2, 2);
    expect(segs.length).toBe(4);
    expect(segs[0]).toBeGreaterThan(0.5);
    expect(segs[0]).toBeLessThan(1.5);
  });

  it('joins segments into one line', () => {
    // A 3 × 2 field with the crossing running down the middle column pair.
    const segs = isothermSegments([2, 1, -1, 2, 1, -1, 2, 1, -1], 3, 3);
    const lines = joinSegments(segs);
    expect(lines.length).toBe(1);
    expect(lines[0]!.length).toBe(6); // three points
  });
});

describe('drawing the line', () => {
  it('straightens a staircase and keeps the ends', () => {
    const stairs = [0, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 4, 3, 4, 4];
    const out = smoothLine(stairs, 1);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([4, 4]);
    // Every point stays near the diagonal.
    for (let i = 0; i < out.length; i += 2) expect(Math.abs(out[i]! - out[i + 1]!)).toBeLessThan(1.01);
  });
});

it('keeps a closed loop as a loop', () => {
  const ring = [0, 0, 4, 0, 4, 4, 0, 4, 0, 0];
  const out = smoothLine(ring, 0.5);
  expect(out.length).toBeGreaterThan(8);
  const xs = out.filter((_, i) => i % 2 === 0);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2);
});

describe('feels-like (ECCC)', () => {
  it('wind chill matches the ECCC table', () => {
    expect(Math.round(windChill(-20, 30))).toBe(-33);
    expect(Math.round(windChill(-20, 5))).toBe(-24); // docs/03 check
    expect(Math.round(windChill(-10, 20))).toBe(-18);
  });

  it('humidex matches the documented check', () => {
    expect(Math.round(humidex(30, 15))).toBe(34);
  });

  it('dew point from humidity', () => {
    expect(dewPoint(20, 100)).toBeCloseTo(20, 1);
    expect(dewPoint(30, 40)).toBeCloseTo(14.9, 0);
  });

  it('picks the index that applies', () => {
    expect(feelsLike(-5, 20, -8).kind).toBe('wind chill');
    expect(feelsLike(-5, 2, -8)).toEqual({ value: -5, kind: 'air' });
    expect(feelsLike(5, 30, 0)).toEqual({ value: 5, kind: 'air' });
    expect(feelsLike(30, 10, 20).kind).toBe('humidex');
  });
});
