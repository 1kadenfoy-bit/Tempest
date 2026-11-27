import { describe, expect, it } from 'vitest';
import { mercatorWind } from './wind-field';
import type { WindProfile } from '../../core/wind/wind';
import type { NodeData } from '../data/profile-source';
import type { Mosaic } from './elevation';

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;

/** Four nodes, each with the same steady wind blowing from the west at 30 km/h at every height. */
function steadyWest(): { grid: NodeData; profiles: WindProfile[] } {
  const lats = [49, 50], lons = [-124, -123];
  const p = (): WindProfile => ({ gh: new Float32Array([1000, 3000]), u: new Float32Array([30, 30]), v: new Float32Array([0, 0]), u10: 30, v10: 0, speed10: 30, gust10: 40 });
  return { grid: { lats, lons, profiles: [], values: [] } as unknown as NodeData, profiles: [p(), p(), p(), p()] };
}

describe('mercatorWind', () => {
  it('gives the forecast wind on map positions, with its mean speed and direction', () => {
    const { grid, profiles } = steadyWest();
    const m: Mosaic = { merc: [mercX(-124.5), mercY(50.5), mercX(-122.5), mercY(48.5)], width: 8, height: 8, data: new Float32Array(64).fill(500), key: 't' };
    const ground = new Float32Array(64).fill(400);
    const w = mercatorWind(grid, profiles, m, ground, [-124.5, 48.5, -122.5, 50.5], 8)!;
    expect(w.cols).toBe(8);
    // Cells off the model's nodes take their neighbour's wind: nothing is left unknown.
    expect(Array.from(w.u).every(Number.isFinite)).toBe(true);
    expect(w.u[3 * 8 + 3]).toBeCloseTo(30);
    expect(w.v[3 * 8 + 3]).toBeCloseTo(0);
    expect(w.meanKmh).toBeCloseTo(30);
    expect(w.meanFromDeg).toBeCloseTo(270);
    // North edge first: y grows southwards.
    expect(w.y0).toBeLessThan(w.y1);
  });

  it('gives nothing when no cell is on the model grid', () => {
    const { grid, profiles } = steadyWest();
    const m: Mosaic = { merc: [mercX(-110), mercY(41), mercX(-109), mercY(40)], width: 4, height: 4, data: new Float32Array(16), key: 't' };
    expect(mercatorWind(grid, profiles, m, new Float32Array(16), [-110, 40, -109, 41], 4)).toBeNull();
  });
});
