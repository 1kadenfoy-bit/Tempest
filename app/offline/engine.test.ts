import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import type { SavedArea } from '../../core/offline/saved-area';
import type { SaveRequest, SaveShape } from '../../core/offline/save-request';

const saved: SavedArea[] = [];
vi.mock('./saved-areas', () => ({
  listSavedAreas: async () => [...saved],
  saveArea: vi.fn(),
  deleteArea: async (a: SavedArea) => { saved.splice(saved.findIndex((x) => x.id === a.id), 1); },
}));
const { configureSaveEngine, estimateSave, layerTimeRange, listSaved, deleteSaved, startSave } = await import('./engine');

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 22, 6);
const run = (model: string, n: number): RunMetadata => ({ model, referenceTime: new Date(T0 - 2 * H), validTimes: Array.from({ length: n }, (_, i) => new Date(T0 + i * H)) }) as unknown as RunMetadata;
const shape: SaveShape = { outline: [[-123.3, 49.3], [-123, 49.3], [-123, 49.5]], bbox: [-123.3, 49.3, -123, 49.5] };
const req = (over: Partial<SaveRequest> = {}): SaveRequest => ({ shape, layers: [{ layer: 'precipitation', model: 'auto' }], from: new Date(T0), to: new Date(T0 + 24 * H), ...over });

let lastOpts: Record<string, unknown> = {};
const fakeSave = vi.fn(async (opts: Record<string, unknown>) => {
  lastOpts = opts;
  (opts.onProgress as (p: unknown) => void)({ done: 1, total: 2, label: 'Weather' });
  (opts.onProgress as (p: unknown) => void)({ done: 2, total: 2, label: 'Base map' });
  const a = { id: 'a1', bbox: shape.bbox } as unknown as SavedArea;
  saved.unshift(a);
  return a;
});
const changed = vi.fn();

beforeEach(() => {
  saved.length = 0;
  fakeSave.mockClear();
  changed.mockClear();
  configureSaveEngine({
    runs: () => ({ hrdps: run('cmc_gem_hrdps', 48), rdps: run('cmc_gem_rdps_10km', 84) }),
    chain: ['hrdps', 'rdps'],
    layers: () => [
      { id: 'precipitation', needs: ['precipitation', 'temperature_1000hPa'] },
      { id: 'radar', needs: [], own: { from: new Date(T0 - H), to: new Date(T0), bytes: 1e5 } },
    ],
    cells: (m) => (m === 'hrdps' ? 1000 : 100),
    tilesForShape: () => [[0, 0, 0], [1, 0, 0]],
    storedBytes: async (t) => t.length * 1e5,
    basemap: {} as never,
    style: () => ({}) as never,
    now: () => new Date(T0),
    afterChange: changed,
    save: fakeSave as never,
  });
});

describe('the saving engine', () => {
  it('gives each layer a time range with its age', () => {
    const r = layerTimeRange('precipitation', 'hrdps')!;
    expect(r.latest.getTime()).toBe(T0 + 47 * H);
    expect(r.age).toBe('2 h old');
    expect(layerTimeRange('precipitation', 'auto')!.latest.getTime()).toBe(T0 + 83 * H);
  });
  it('estimates the map from the outline tiles and the weather from the cells', async () => {
    const e = await estimateSave(req({ layers: [{ layer: 'precipitation', model: 'hrdps' }] }));
    expect(e.layers[0]!.bytes).toBe(2 * 4 * 1000 * 25);
    expect(e.mapBytes).toBeGreaterThan(2e5);
    expect(e.totalBytes).toBe(e.mapBytes + e.layers[0]!.bytes);
  });
  it('runs a save in the background: progress, then the saved area id', async () => {
    const job = startSave(req());
    const seen: string[] = [];
    job.onProgress((p) => seen.push(p.label));
    expect(await job.done).toBe('a1');
    expect(fakeSave).toHaveBeenCalledOnce();
    expect(seen.length).toBeLessThanOrEqual(2);
    expect(changed).toHaveBeenCalled();
    // "auto" saves the whole chain; the outline, span and model choices go in the record.
    expect((lastOpts.runs as RunMetadata[]).map((r) => r.model)).toEqual(['cmc_gem_hrdps', 'cmc_gem_rdps_10km']);
    expect(lastOpts.shape).toEqual(shape.outline);
    expect(lastOpts.layerModels).toEqual([{ layer: 'precipitation', model: 'auto' }]);
    expect((lastOpts.span as { from: Date }).from.getTime()).toBe(T0);
    expect((lastOpts.variables as string[])).toEqual(['precipitation']);
    expect((lastOpts.plainVariables as string[])).toEqual(['temperature_1000hPa']);
  });
  it('one named model saves just that model', async () => {
    await startSave(req({ layers: [{ layer: 'precipitation', model: 'rdps' }] })).done;
    expect((lastOpts.runs as RunMetadata[]).map((r) => r.model)).toEqual(['cmc_gem_rdps_10km']);
  });
  it('refuses, in plain words, nothing chosen or a span past the forecast', async () => {
    await expect(startSave(req({ layers: [] })).done).rejects.toThrow('Choose a layer to save');
    await expect(startSave(req({ from: new Date(T0 + 200 * H), to: new Date(T0 + 210 * H) })).done).rejects.toThrow('does not reach');
  });
  it('cancel stops the save through the signal', async () => {
    fakeSave.mockImplementationOnce(async (opts: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 5));
      if ((opts.signal as AbortSignal).aborted) throw new Error('The save was cancelled');
      return {} as SavedArea;
    });
    const job = startSave(req());
    job.cancel();
    await expect(job.done).rejects.toThrow('cancelled');
  });
  it('lists and deletes saved areas', async () => {
    await startSave(req()).done;
    expect((await listSaved()).map((a) => a.id)).toEqual(['a1']);
    expect(await deleteSaved('a1')).toBe(true);
    expect(await deleteSaved('a1')).toBe(false);
    expect(await listSaved()).toEqual([]);
  });
});
