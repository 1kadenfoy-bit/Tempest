// The one time cursor for the whole app. It always sits on a real model step,
// so readouts never show blended values. Pure state with listeners; no UI.

export type CursorListener = (c: TimeCursor) => void;

export class TimeCursor {
  private listeners = new Set<CursorListener>();
  private steps: Date[] = [];
  private i = -1;

  /** Model steps the cursor can stop on (the chosen model's range). */
  setSteps(steps: Date[], keepNear?: Date): void {
    this.steps = steps;
    const target = keepNear ?? this.time ?? new Date();
    this.i = steps.length ? nearestIndex(steps, target) : -1;
    this.emit();
  }

  get index(): number { return this.i; }
  get count(): number { return this.steps.length; }
  get time(): Date | undefined { return this.steps[this.i]; }
  get first(): Date | undefined { return this.steps[0]; }
  get last(): Date | undefined { return this.steps[this.steps.length - 1]; }
  get allSteps(): readonly Date[] { return this.steps; }

  /** Move to the step nearest t, stopping at the model's first and last hour. */
  setTime(t: Date): void {
    if (!this.steps.length) return;
    this.setIndex(nearestIndex(this.steps, t));
  }

  setIndex(i: number): void {
    const next = Math.min(this.steps.length - 1, Math.max(0, Math.round(i)));
    if (next === this.i) return;
    this.i = next;
    this.emit();
  }

  /** Move by n steps; returns false at either end. */
  stepBy(n: number): boolean {
    const before = this.i;
    this.setIndex(this.i + n);
    return this.i !== before;
  }

  now(now = new Date()): void {
    this.setTime(now);
  }

  subscribe(fn: CursorListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this);
  }
}

export function nearestIndex(steps: readonly Date[], t: Date): number {
  let best = 0;
  let gap = Infinity;
  steps.forEach((s, i) => {
    const g = Math.abs(s.getTime() - t.getTime());
    if (g < gap) { gap = g; best = i; }
  });
  return best;
}
