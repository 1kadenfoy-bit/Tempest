import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    computeField,
    feelsLike,
    freezingLevel,
    isothermSegments,
    latticeAxis,
    profileAtTime,
    sampleProfile,
} from '../src/toposcale.ts';

import type { NodeGrid, Profile, ProfileSeries } from '../src/toposcale.ts';

// Simple atmosphere: 6.5 K/km lapse rate, 0 °C at 1000 m (+ an offset per node).
const LEVEL_HEIGHTS = [100, 500, 1000, 1500, 3000, 5500];
const profile = (offsetK = 0, wind = 10): Profile => ({
    gh: Float32Array.from(LEVEL_HEIGHTS),
    temp: Float32Array.from(LEVEL_HEIGHTS, z => 273.15 - 0.0065 * (z - 1000) + offsetK),
    wind: Float32Array.from(LEVEL_HEIGHTS, () => wind),
});

test('reads temperature at the given elevation, between levels', () => {
    const p = profile();
    assert.ok(Math.abs(sampleProfile(p.gh, p.temp, p.wind, 1000).temp - 273.15) < 1e-3);
    assert.ok(Math.abs(sampleProfile(p.gh, p.temp, p.wind, 2000).temp - (273.15 - 6.5)) < 1e-3);
});

test('extrapolates below the lowest level instead of clamping', () => {
    const p = profile();
    assert.ok(Math.abs(sampleProfile(p.gh, p.temp, p.wind, 0).temp - (273.15 + 6.5)) < 1e-3);
});

test('terrain detail comes from the DEM, not from interpolating temperatures', () => {
    // All four nodes share one profile, so any temperature difference must come from elevation alone.
    const grid: NodeGrid = { lats: [49, 50], lons: [-123, -122], profiles: [profile(), profile(), profile(), profile()] };
    const rowLats = Float64Array.from([49.5]);
    const colLons = Float64Array.from([-122.9, -122.8]);
    const elevation = Float32Array.from([670, 2180]); // valley floor and summit, side by side
    const { temp } = computeField(grid, rowLats, colLons, elevation);
    assert.ok(Math.abs(temp[0] - temp[1] - 0.0065 * (2180 - 670)) < 1e-3);
});

test('interpolates profiles bilinearly between nodes', () => {
    const grid: NodeGrid = { lats: [49, 50], lons: [-123, -122], profiles: [profile(0), profile(0), profile(4), profile(4)] };
    const { temp } = computeField(grid, Float64Array.from([49.5]), Float64Array.from([-122.5]), Float32Array.from([1000]));
    assert.ok(Math.abs(temp[0] - (273.15 + 2)) < 1e-3);
});

test('time interpolation, and no data outside the model range', () => {
    const a = profile(0);
    const b = profile(6);
    const s: ProfileSeries = {
        ts: [0, 3 * 3600e3],
        levels: [1000, 950, 900, 850, 700, 500],
        gh: Float32Array.from([...a.gh, ...b.gh]),
        temp: Float32Array.from([...a.temp, ...b.temp]),
        wind: Float32Array.from([...a.wind, ...b.wind]),
    };
    const mid = profileAtTime(s, 1.5 * 3600e3)!;
    assert.ok(Math.abs(mid.temp[2] - (273.15 + 3)) < 1e-3);
    assert.equal(profileAtTime(s, 4 * 3600e3), null);
});

test('lattice has at most 5 nodes, covers the range, and is stable under small pans', () => {
    for (const [min, max] of [[49.1, 50.3], [-123.4, -122.1], [50, 50.02]]) {
        const axis = latticeAxis(min, max, 0.02);
        assert.ok(axis.length >= 2 && axis.length <= 5, `${axis.length} nodes`);
        assert.ok(axis[0] <= min && axis[axis.length - 1] >= max);
    }
    assert.deepEqual(latticeAxis(49.1, 50.3, 0.02), latticeAxis(49.15, 50.35, 0.02));
});

test('wind chill matches Environment Canada reference values', () => {
    // ECCC table: -20 °C with 30 km/h wind -> -33 (rounded).
    assert.equal(Math.round(feelsLike(253.15, 30 / 3.6) - 273.15), -33);
    // Above 10 °C, or in calm air, feels-like is the air temperature.
    assert.equal(feelsLike(288.15, 20), 288.15);
    assert.equal(feelsLike(263.15, 1), 263.15);
});

test('freezing level and 0 °C contour', () => {
    assert.ok(Math.abs(freezingLevel(profile())! - 1000) < 1e-3);
    // 2x2 field with a crossing between the columns.
    const segs = isothermSegments(Float32Array.from([275, 271, 275, 271]), 2, 2);
    assert.equal(segs.length, 4);
    assert.ok(segs[0] > 0.5 && segs[0] < 1.5);
});
