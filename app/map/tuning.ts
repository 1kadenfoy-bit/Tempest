// Temporary design controls (Maps section): numbers Kaden can move with the tuning panel
// (app/map/tuner.ts) to judge the map's look on his phone. Once the look is settled these
// become fixed values and the panel goes away.
export interface Tuning {
  /** Background haze and fog in 3D, 0 (clear) to 1 (thick). */
  haze: number;
  /** How strong the hillshade relief is, 1 = as built. */
  relief: number;
  /** How strong the warm-to-cool tint of lit and shaded slopes is, 1 = as built. */
  tint: number;
  /** How dark the cast shadows of mountains are, 1 = as built, 0 = none. */
  cast: number;
  /** Bloom: the glow on bright things, 0 (none) to 1. */
  bloom: number;
}

export const DEFAULT_TUNING: Tuning = { haze: 0.85, relief: 1.2, tint: 0.55, cast: 0.65, bloom: 0.65 };

type Listener = (t: Tuning) => void;

class TuningStore {
  private state: Tuning = { ...DEFAULT_TUNING };
  private listeners = new Set<Listener>();
  get(): Tuning { return this.state; }
  set(change: Partial<Tuning>): void {
    this.state = { ...this.state, ...change };
    for (const fn of this.listeners) fn(this.state);
  }
  reset(): void { this.set({ ...DEFAULT_TUNING }); }
  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const tuning = new TuningStore();
