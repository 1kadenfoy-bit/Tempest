import { describe, expect, it } from 'vitest';
import { SAVED_AREA_VERSION, areaContains, parseSavedAreas, estimateSaveBytes, tilesInBox, totalBytes, type SavedArea } from './saved-area';

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
  });
  it('lists terrain tiles over the zooms', () => {
    const t = tilesInBox([-123.2, 49.3, -123, 49.4], 0, 2);
    expect(t).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 1]]);
  });
});
