// The calculations behind "Save for offline" (docs/plans/offline-save.md): which
// hours each layer can fill, from which model, and how many bytes that takes.
// Pure logic, no browser and no providers: the app hands it the current runs
// and a few measuring functions (cells in a box, map bytes), so it runs in unit
// tests. The browser side is app/offline/engine.ts.
import type { LayerChoice, LayerEstimate, LayerTimeRange, SaveEstimate, SaveRequest, SaveShape } from './save-request';
import { runAgeHours } from '../time/run-age';

const HOUR = 3_600_000;
/** Bytes one value takes in a saved region file. */
export const BYTES_PER_VALUE = 4;

/** A model run as the plan sees it. */
export interface PlanRun {
  model: string;
  referenceTime: Date;
  /** Every step the run holds, in order. */
  validTimes: Date[];
}

/** A layer the card can tick. */
export interface PlanLayer {
  id: string;
  /** Weather values a model-driven layer keeps (precipitation, the profile…). Empty for a layer with its own source. */
  needs: readonly string[];
  /**
   * A layer with its own source (radar, avalanche, air quality): how far its
   * data reaches and what it takes. `from`/`to` null: nothing can be saved.
   */
  own?: { from: Date | null; to: Date | null; bytes: number; note?: string; age?: string };
}

export interface PlanContext {
  now: Date;
  /** The current run of each model, by id. */
  runs: Record<string, PlanRun>;
  /** The chain "auto" follows: the best model first, then those that carry on past its end. */
  chain: readonly string[];
  layers: Record<string, PlanLayer>;
  /** Model cells covering a box. */
  cells(model: string, bbox: SaveShape['bbox']): number;
  /** Bytes of the map pieces cut to the outline, and the terrain. */
  mapBytes(shape: SaveShape): Promise<number>;
  /** The earliest past hour the app keeps for a model (default: the run's first step). */
  earliestKept?(model: string): Date | null;
}

/** The models a choice stands for, best first: "auto" is the chain. */
export function modelsFor(choice: LayerChoice['model'], ctx: PlanContext): PlanRun[] {
  const ids = choice === 'auto' ? ctx.chain : [choice];
  return ids.flatMap((m) => (ctx.runs[m] ? [ctx.runs[m]!] : []));
}

/** One model's share of the hours saved. */
export interface PlanSegment { run: PlanRun; times: Date[] }

/**
 * The hours of [from, to] each model supplies. With several models (the chain)
 * each covers the hours after the one before it ends, as a save has always done.
 */
export function planSegments(models: readonly PlanRun[], from: Date, to: Date, ctx?: Pick<PlanContext, 'earliestKept'>): PlanSegment[] {
  let after = -Infinity;
  const out: PlanSegment[] = [];
  for (const run of models) {
    const floor = ctx?.earliestKept?.(run.model)?.getTime() ?? -Infinity;
    const times = run.validTimes.filter((t) => t.getTime() >= from.getTime() && t.getTime() <= to.getTime() && t.getTime() > after && t.getTime() >= floor);
    after = Math.max(after, run.validTimes[run.validTimes.length - 1]?.getTime() ?? after);
    if (times.length) out.push({ run, times });
  }
  return out;
}

/** "2 h old", "3 d old" (the status line's words); "new" for a run that has just arrived. */
export function ageWords(referenceTime: Date, now: Date): string {
  const h = runAgeHours(referenceTime, now);
  return h >= 48 ? `${Math.floor(h / 24)} d old` : h < 1 ? 'new' : `${h} h old`;
}

/**
 * How far a layer can reach on the scrubber: from the earliest kept past to its
 * model's end ("auto": to the end of the chain), with its age.
 */
export function layerTimeRange(layerId: string, model: LayerChoice['model'], ctx: PlanContext): LayerTimeRange | null {
  const layer = ctx.layers[layerId];
  if (!layer) return null;
  if (layer.own) {
    if (!layer.own.from || !layer.own.to) return null;
    return { layer: layerId, model, earliest: layer.own.from, latest: layer.own.to, ...(layer.own.age ? { age: layer.own.age } : {}) };
  }
  const runs = modelsFor(model, ctx);
  if (!runs.length) return null;
  const firsts = runs.map((r) => ctx.earliestKept?.(r.model)?.getTime() ?? r.validTimes[0]?.getTime() ?? Infinity);
  const lasts = runs.map((r) => r.validTimes[r.validTimes.length - 1]?.getTime() ?? -Infinity);
  const first = Math.min(...firsts), last = Math.max(...lasts);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  // The age is the best model's: the first run in the choice.
  return { layer: layerId, model, earliest: new Date(first), latest: new Date(last), age: ageWords(runs[0]!.referenceTime, ctx.now) };
}

function overlap(a: { from: Date; to: Date }, from: Date, to: Date): { from: Date; to: Date } | null {
  const f = Math.max(a.from.getTime(), from.getTime()), t = Math.min(a.to.getTime(), to.getTime());
  return f <= t ? { from: new Date(f), to: new Date(t) } : null;
}

/**
 * Size of a save before it starts: bytes per layer and for the map. Layers that
 * share values (the temperature profile is in two layers) are counted once in
 * the total; each row still shows what it would take on its own.
 */
export async function estimateSave(req: SaveRequest, ctx: PlanContext): Promise<SaveEstimate> {
  const mapBytes = await ctx.mapBytes(req.shape);
  const layers: LayerEstimate[] = [];
  /** model:variable → bytes, so a value two layers need is counted once. */
  const shared = new Map<string, number>();
  let ownBytes = 0;
  for (const choice of req.layers) {
    const layer = ctx.layers[choice.layer];
    if (!layer) { layers.push({ layer: choice.layer, bytes: 0, covers: null, note: 'Not a layer that can be saved' }); continue; }
    if (layer.own) {
      const covers = layer.own.from && layer.own.to ? overlap({ from: layer.own.from, to: layer.own.to }, req.from, req.to) : null;
      const bytes = covers ? layer.own.bytes : 0;
      ownBytes += bytes;
      layers.push({ layer: choice.layer, bytes, covers, ...(covers ? (layer.own.note ? { note: layer.own.note } : {}) : { note: layer.own.note ?? 'Nothing to save in that time span' }) });
      continue;
    }
    const segments = planSegments(modelsFor(choice.model, ctx), req.from, req.to, ctx);
    if (!segments.length) { layers.push({ layer: choice.layer, bytes: 0, covers: null, note: 'The forecast does not reach that time span' }); continue; }
    let bytes = 0;
    for (const seg of segments) {
      const per = BYTES_PER_VALUE * ctx.cells(seg.run.model, req.shape.bbox) * seg.times.length;
      for (const v of layer.needs) {
        bytes += per;
        shared.set(`${seg.run.model}:${v}`, Math.max(shared.get(`${seg.run.model}:${v}`) ?? 0, per));
      }
    }
    const covers = { from: segments[0]!.times[0]!, to: segments[segments.length - 1]!.times[segments[segments.length - 1]!.times.length - 1]! };
    const short = covers.to.getTime() < req.to.getTime() - HOUR || covers.from.getTime() > req.from.getTime() + HOUR;
    layers.push({ layer: choice.layer, bytes, covers, ...(short ? { note: 'The model covers only part of that time span' } : {}) });
  }
  let weather = 0;
  for (const b of shared.values()) weather += b;
  return { mapBytes, layers, totalBytes: mapBytes + weather + ownBytes };
}
