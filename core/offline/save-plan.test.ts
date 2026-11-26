import { describe, expect, it } from 'vitest';
import { BYTES_PER_VALUE, ageWords, estimateSave, layerTimeRange, modelsFor, planSegments, type PlanContext, type PlanRun } from './save-plan';
import type { SaveRequest, SaveShape } from './save-request';

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 22, 6);
const hours = (from: number, n: number) => Array.from({ length: n }, (_, i) => new Date(T0 + (from + i) * H));
const run = (model: string, n: number, ageHours = 2): PlanRun => ({ model, referenceTime: new Date(T0 - ageHours * H), validTimes: hours(0, n) });
const shape: SaveShape = { outline: [[-123.3, 49.3], [-123.0, 49.3], [-123.0, 49.5]], bbox: [-123.3, 49.3, -123.0, 49.5] };

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  now: new Date(T0),
  runs: { hrdps: run('hrdps', 48), rdps: run('rdps', 84), gdps: run('gdps', 240) },
  chain: ['hrdps', 'rdps', 'gdps'],
  layers: {
    precipitation: { id: 'precipitation', needs: ['precipitation', 'temperature_1000hPa'] },
    temperature: { id: 'temperature', needs: ['temperature_2m', 'temperature_1000hPa'] },
    radar: { id: 'radar', needs: [], own: { from: new Date(T0 - 2 * H), to: new Date(T0), bytes: 5e5, note: 'Radar stops at now', age: '10 min old' } },
    avalanche: { id: 'avalanche', needs: [], own: { from: null, to: null, bytes: 0, note: 'Nothing kept' } },
  },
  cells: (m) => (m === 'hrdps' ? 1000 : 100),
  mapBytes: async () => 4e6,
  ...over,
});
const req = (layers: SaveRequest['layers'], fromH = 0, toH = 24): SaveRequest => ({ shape, layers, from: new Date(T0 + fromH * H), to: new Date(T0 + toH * H) });

describe('which models a choice means', () => {
  it('auto is the chain, in order, for the runs that exist', () => {
    expect(modelsFor('auto', ctx()).map((r) => r.model)).toEqual(['hrdps', 'rdps', 'gdps']);
    expect(modelsFor('auto', ctx({ runs: { rdps: run('rdps', 84) } })).map((r) => r.model)).toEqual(['rdps']);
    expect(modelsFor('rdps', ctx()).map((r) => r.model)).toEqual(['rdps']);
    expect(modelsFor('ecmwf', ctx())).toEqual([]);
  });
});

describe('the hours each model supplies', () => {
  it('a chain hands over where each model ends', () => {
    const segs = planSegments(modelsFor('auto', ctx()), new Date(T0), new Date(T0 + 100 * H));
    expect(segs.map((s) => [s.run.model, s.times.length])).toEqual([['hrdps', 48], ['rdps', 36], ['gdps', 17]]);
  });
  it('one model gives only the hours inside the span', () => {
    const segs = planSegments([run('hrdps', 48)], new Date(T0 + 10 * H), new Date(T0 + 20 * H));
    expect(segs[0]!.times).toHaveLength(11);
  });
  it('earlier hours the app does not keep are left out', () => {
    const segs = planSegments([run('hrdps', 48)], new Date(T0), new Date(T0 + 5 * H), { earliestKept: () => new Date(T0 + 3 * H) });
    expect(segs[0]!.times[0]!.getTime()).toBe(T0 + 3 * H);
  });
});

describe('layer time range', () => {
  it('runs from the first step to the model end, with its age', () => {
    const r = layerTimeRange('precipitation', 'hrdps', ctx())!;
    expect(r.earliest.getTime()).toBe(T0);
    expect(r.latest.getTime()).toBe(T0 + 47 * H);
    expect(r.age).toBe('2 h old');
  });
  it('auto reaches to the end of the whole chain', () => {
    expect(layerTimeRange('precipitation', 'auto', ctx())!.latest.getTime()).toBe(T0 + 239 * H);
  });
  it('a layer with its own source uses its data span and age', () => {
    const r = layerTimeRange('radar', 'auto', ctx())!;
    expect(r.latest.getTime()).toBe(T0);
    expect(r.age).toBe('10 min old');
  });
  it('is null when nothing exists', () => {
    expect(layerTimeRange('avalanche', 'auto', ctx())).toBeNull();
    expect(layerTimeRange('precipitation', 'ecmwf', ctx())).toBeNull();
    expect(layerTimeRange('nope', 'auto', ctx())).toBeNull();
  });
});

describe('age words', () => {
  it('says new, hours and days', () => {
    expect(ageWords(new Date(T0), new Date(T0 + 10 * 60_000))).toBe('new');
    expect(ageWords(new Date(T0 - 5 * H), new Date(T0))).toBe('5 h old');
    expect(ageWords(new Date(T0 - 72 * H), new Date(T0))).toBe('3 d old');
  });
});

describe('estimate', () => {
  it('one weather layer: values times cells times hours, plus the map', async () => {
    const e = await estimateSave(req([{ layer: 'precipitation', model: 'hrdps' }]), ctx());
    const expected = 2 * BYTES_PER_VALUE * 1000 * 25;
    expect(e.layers[0]!.bytes).toBe(expected);
    expect(e.mapBytes).toBe(4e6);
    expect(e.totalBytes).toBe(4e6 + expected);
  });
  it('values two layers share are counted once in the total', async () => {
    const both = await estimateSave(req([{ layer: 'precipitation', model: 'hrdps' }, { layer: 'temperature', model: 'hrdps' }]), ctx());
    const each = both.layers.map((l) => l.bytes);
    expect(each[0]! + each[1]!).toBeGreaterThan(both.totalBytes - both.mapBytes);
    expect(both.totalBytes - both.mapBytes).toBe(3 * BYTES_PER_VALUE * 1000 * 25);
  });
  it('a model that ends early covers part of the span, and says so', async () => {
    const e = await estimateSave(req([{ layer: 'precipitation', model: 'hrdps' }], 0, 100), ctx());
    expect(e.layers[0]!.covers!.to.getTime()).toBe(T0 + 47 * H);
    expect(e.layers[0]!.note).toMatch(/only part/);
  });
  it('a span past the forecast covers nothing', async () => {
    const e = await estimateSave(req([{ layer: 'precipitation', model: 'hrdps' }], 60, 70), ctx());
    expect(e.layers[0]).toMatchObject({ bytes: 0, covers: null });
    expect(e.layers[0]!.note).toBeTruthy();
  });
  it('radar saves what exists and keeps its own note; a layer with no data saves nothing', async () => {
    const e = await estimateSave(req([{ layer: 'radar', model: 'auto' }, { layer: 'avalanche', model: 'auto' }], -1, 24), ctx());
    expect(e.layers[0]).toMatchObject({ bytes: 5e5, note: 'Radar stops at now' });
    expect(e.layers[0]!.covers!.to.getTime()).toBe(T0);
    expect(e.layers[1]).toMatchObject({ bytes: 0, covers: null });
    expect(e.totalBytes).toBe(4e6 + 5e5);
  });
  it('auto costs less per hour once a coarser model takes over', async () => {
    const e = await estimateSave(req([{ layer: 'precipitation', model: 'auto' }], 0, 60), ctx());
    const fine = 2 * BYTES_PER_VALUE * 1000 * 48, coarse = 2 * BYTES_PER_VALUE * 100 * 13;
    expect(e.layers[0]!.bytes).toBe(fine + coarse);
  });
});
