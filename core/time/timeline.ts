// The time line across models (M6). Each hour comes from one model run: the
// chosen model, then the next models in the chain where it ends. A model
// whose run is missing is skipped and named, so the fallback is visible. The
// cursor's steps are the joined steps; seams are where one model hands over.

export interface ModelRun {
  /** The model's id (as the registry names it). */
  model: string;
  run: Date;
  /** Valid times the model offers as steps (amounts end at their valid time). */
  times: Date[];
}

export interface Segment { model: string; run: Date; steps: Date[] }

export interface Timeline {
  segments: Segment[];
  steps: Date[];
  /** Times where a later model takes over (the first step of each later segment). */
  seams: { time: Date; from: string; to: string }[];
  /**
   * Models asked for but missing where another took their place (before or
   * between the ones used), in order: shown so the fallback is visible. A
   * missing model at the end only makes the line end sooner.
   */
  missing: string[];
}

/**
 * `order`: the models to use, first choice first. Each contributes the steps
 * after the previous one's last step. The first model's first time (its
 * analysis, with no amount yet) is skipped.
 */
export function buildTimeline(order: readonly string[], runs: Readonly<Record<string, ModelRun | null | undefined>>): Timeline {
  const segments: Segment[] = [];
  const missing: string[] = [];
  let last = -Infinity;
  for (const m of order) {
    const r = runs[m];
    if (!r || !r.times.length) { missing.push(m); continue; }
    const first = segments.length === 0;
    const steps = r.times.filter((t, i) => (first ? i > 0 : true) && t.getTime() > last);
    if (!steps.length) continue;
    segments.push({ model: m, run: r.run, steps });
    last = steps[steps.length - 1]!.getTime();
  }
  const seams = segments.slice(1).map((s, k) => ({ time: s.steps[0]!, from: segments[k]!.model, to: s.model }));
  const lastUsed = segments.length ? order.lastIndexOf(segments[segments.length - 1]!.model) : -1;
  const replaced = missing.filter((m) => order.indexOf(m) < lastUsed);
  return { segments, steps: segments.flatMap((s) => s.steps), seams, missing: replaced };
}

/** The segment holding time t (a step of it, or between its first and last steps). */
export function segmentAt(tl: Timeline, t: Date): Segment | null {
  const x = t.getTime();
  for (const s of tl.segments) {
    if (x >= s.steps[0]!.getTime() && x <= s.steps[s.steps.length - 1]!.getTime()) return s;
  }
  return null;
}

/**
 * The order of models for a choice. A model in the chain starts the chain
 * there (HRDPS, then RDPS, then GDPS: each takes over where the one before
 * ends, as the HRDPS card says). A model outside the chain stands alone and
 * the cursor stops at its end; if it is missing, the chain stands in.
 */
export function orderFor(choice: string, chain: readonly string[], available: (m: string) => boolean): string[] {
  const at = chain.indexOf(choice);
  if (at >= 0) return chain.slice(at);
  if (available(choice)) return [choice];
  // Missing: name it first (so the fallback shows), then the chain.
  return [choice, ...chain];
}
