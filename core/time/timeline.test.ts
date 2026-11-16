import { describe, expect, it } from 'vitest';
import { buildTimeline, orderFor, segmentAt, type ModelRun } from './timeline';

const H = 3_600_000;
const t0 = Date.parse('2026-11-16T06:00:00Z');
const run = (model: string, startH: number, hours: number, step = 1): ModelRun => ({
  model, run: new Date(t0 + startH * H), times: Array.from({ length: hours / step + 1 }, (_, i) => new Date(t0 + (startH + i * step) * H)),
});

describe('timeline across models', () => {
  const runs = { hrdps: run('hrdps', 0, 48), rdps: run('rdps', 6, 84), gdps: run('gdps', 0, 240, 3) };

  it('HRDPS, then RDPS, then GDPS, each after the one before ends', () => {
    const tl = buildTimeline(['hrdps', 'rdps', 'gdps'], runs);
    expect(tl.segments.map((s) => s.model)).toEqual(['hrdps', 'rdps', 'gdps']);
    expect(tl.steps[0]!.getTime()).toBe(t0 + H); // the analysis hour has no amount
    // RDPS ends at hour 90; GDPS steps every 3 h, so its first step after is hour 93.
    expect(tl.seams.map((s) => (s.time.getTime() - t0) / H)).toEqual([49, 93]);
    expect(tl.steps[tl.steps.length - 1]!.getTime()).toBe(t0 + 240 * H);
    // Strictly increasing steps, no repeats at the seams.
    for (let i = 1; i < tl.steps.length; i++) expect(tl.steps[i]!.getTime()).toBeGreaterThan(tl.steps[i - 1]!.getTime());
  });

  it('choosing a chain model starts the chain there; the last one stops at its own end', () => {
    expect(orderFor('rdps', ['hrdps', 'rdps', 'gdps'], () => true)).toEqual(['rdps', 'gdps']);
    const tl = buildTimeline(orderFor('gdps', ['hrdps', 'rdps', 'gdps'], () => true), runs);
    expect(tl.segments.map((s) => s.model)).toEqual(['gdps']);
    expect(tl.steps[tl.steps.length - 1]!.getTime()).toBe(t0 + 240 * H);
  });

  it('a model outside the chain stands alone and stops at its end', () => {
    const tl = buildTimeline(orderFor('ecmwf', ['hrdps', 'rdps', 'gdps'], () => true), { ...runs, ecmwf: run('ecmwf', 0, 72) });
    expect(tl.segments.map((s) => s.model)).toEqual(['ecmwf']);
    expect(tl.steps[tl.steps.length - 1]!.getTime()).toBe(t0 + 72 * H);
  });

  it('a missing model falls back down the chain, and says so', () => {
    const tl = buildTimeline(orderFor('hrdps', ['hrdps', 'rdps', 'gdps'], (m) => m !== 'hrdps'), { ...runs, hrdps: null });
    expect(tl.missing).toEqual(['hrdps']);
    expect(tl.segments[0]!.model).toBe('rdps');
  });

  it('a missing model at the end only ends the line sooner', () => {
    const tl = buildTimeline(['hrdps', 'rdps', 'gdps'], { hrdps: runs.hrdps, rdps: null, gdps: null });
    expect(tl.missing).toEqual([]);
    expect(tl.segments.map((s) => s.model)).toEqual(['hrdps']);
  });

  it('finds the model at a time', () => {
    const tl = buildTimeline(['hrdps', 'rdps', 'gdps'], runs);
    expect(segmentAt(tl, new Date(t0 + 10 * H))!.model).toBe('hrdps');
    expect(segmentAt(tl, new Date(t0 + 60 * H))!.model).toBe('rdps');
    expect(segmentAt(tl, new Date(t0 + 100 * H))!.model).toBe('gdps');
    expect(segmentAt(tl, new Date(t0 + 300 * H))).toBeNull();
  });
});
