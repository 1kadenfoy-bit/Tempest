import { describe, expect, it } from 'vitest';
import { SAVED_AREA_VERSION, areaContains, areaParts, isExpired, lastHour, parseSavedAreas, estimateSaveBytes, tilesInBox, totalBytes, weatherFiles, type SavedArea } from './saved-area';

const area: SavedArea = {
  version: SAVED_AREA_VERSION, id: 'a1', bbox: [-123.3, 49.3, -122.8, 49.6], savedAt: '2026-11-16T03:00:00Z',
  weather: { source: 'openmeteo-maps', model: 'cmc_gem_hrdps', run: '2026-11-16T00:00:00Z', validTimes: [], stepHours: 1, files: {}, ranges: [], nx: 1, ny: 1 },
  basemap: { file: 'b.pmtiles', minzoom: 0, maxzoom: 15 }, cached: [], bytes: { weather: 1, basemap: 2, terrain: 3, other: 4 },
};

describe('saved areas', () => {
  it('keeps only records this app can read', () => {
    expect(parseSavedAreas([area, { version: 99, bbox: [] }, null, 'x'])).toEqual([area]);
    expect(parseSavedAreas({})).toEqual([]);
  });
  it('still reads records from before the traced outline (versions 1 and 2) and keeps the new fields', () => {
    const old = { ...area, version: 1 };
    const v2 = { ...area, version: 2 };
    const v3 = { ...area, shape: [[-123, 49.3], [-122.9, 49.3], [-122.9, 49.4]] as [number, number][], layerModels: [{ layer: 'precipitation', model: 'auto' }], span: { from: '2026-11-22T06:00:00Z', to: '2026-11-23T06:00:00Z' } };
    expect(SAVED_AREA_VERSION).toBe(3);
    expect(parseSavedAreas([old, v2, v3]).map((a) => a.version)).toEqual([1, 2, 3]);
    expect(parseSavedAreas([v3])[0]!.shape).toHaveLength(3);
  });
  it('adds up sizes and answers containment', () => {
    expect(totalBytes(area)).toBe(10);
    expect(areaContains(area, -123, 49.4)).toBe(true);
    expect(areaContains(area, -122, 49.4)).toBe(false);
  });
  it('estimates a save from the measured densities', () => {
    // Measured in M3: 49.5 MB for this box; 9.1 MB for a screen around Mt Seymour.
    const e = estimateSaveBytes([-123.5, 49.25, -122.5, 50.25], 48);
    // Terrain measured at 23.6 MB and 3.6 MB.
    const small = estimateSaveBytes([-123.03, 49.33, -122.87, 49.45], 48);
    expect(e.terrain / 1e6).toBeGreaterThan(18);
    expect(e.terrain / 1e6).toBeLessThan(30);
    expect(small.terrain / 1e6).toBeGreaterThan(2.5);
    expect(small.terrain / 1e6).toBeLessThan(6);
    expect(estimateSaveBytes([-123.5, 49.25, -122.5, 50.25], 24).weather).toBeCloseTo(0.325e6);
    // Same cells per variable: 31 variables cost 15.5 times 2.
    expect(estimateSaveBytes([-123.5, 49.25, -122.5, 50.25], 48, 31).weather).toBeCloseTo(0.65e6 * 15.5);
  });
  it('lists terrain tiles over the zooms', () => {
    const t = tilesInBox([-123.2, 49.3, -123, 49.4], 0, 2);
    expect(t).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 1]]);
  });
});

describe('saved areas with more than one model', () => {
  const two: SavedArea = {
    ...area,
    weather: { ...area.weather, validTimes: ['2026-11-16T01:00:00Z', '2026-11-18T00:00:00Z'], files: { precipitation: 'a1-p.bin' } },
    more: [{ ...area.weather, model: 'cmc_gem_rdps_10km', run: '2026-11-16T00:00:00Z', validTimes: ['2026-11-18T01:00:00Z', '2026-11-19T00:00:00Z'], files: { precipitation: 'a1-r-p.bin' } }],
  };
  it('reads each run as its own part', () => {
    const parts = areaParts(two);
    expect(parts.map((p) => [p.id, p.weather.model])).toEqual([['a1', 'cmc_gem_hrdps'], ['a1~1', 'cmc_gem_rdps_10km']]);
    expect(weatherFiles(two)).toEqual(['a1-p.bin', 'a1-r-p.bin']);
  });
  it('expires when its last hour, in any model, has passed', () => {
    expect(lastHour(two)?.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(isExpired(two, new Date('2026-11-18T12:00:00Z'))).toBe(false);
    expect(isExpired(two, new Date('2026-11-19T01:00:00Z'))).toBe(true);
  });
  it('costs a sixteenth per hour for the coarser model', () => {
    const fine = estimateSaveBytes([-123.5, 49.25, -122.5, 50.25], 48).weather;
    expect(estimateSaveBytes([-123.5, 49.25, -122.5, 50.25], 64, 2, 16).weather).toBeCloseTo(fine * (49 / 48));
  });
});
