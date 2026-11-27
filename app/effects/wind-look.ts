// The 3D wind streaks' look (Effects section): numbers Kaden moves with the
// temporary Tune panel (app/map/tuner.ts) to judge the wind on his phone. The
// wind itself (direction and speed) comes from the forecast; these only change
// how it is drawn and how much the hills and gusts shape it. Once the look is
// settled they become fixed values and the sliders go away.
import type { WindShape } from '../effects-lab/synthetic-wind';

export interface WindLook extends WindShape {
  /** Streaks on screen. */
  count: number;
  /** Seconds of travel a streak spans (its length). */
  trailSeconds: number;
  /** Line width, CSS pixels at a moderate wind. */
  widthPx: number;
  /** 0 to 1. */
  brightness: number;
  /** Movement speed: 1 is the speed the forecast gives, at the map's own scale. */
  speedScale: number;
  /** Metres above the ground the streaks fly. */
  clearance: number;
}

/** Kaden's starting look (docs/wishes/effects.md, rule 3). */
export const DEFAULT_WIND_LOOK: WindLook = { count: 700, trailSeconds: 0.4, widthPx: 2, brightness: 0.9, speedScale: 1, clearance: 50, terrain: 0.2, gusty: 0.15, gust: 0.5, gustSize: 1 };

type Listener = (l: WindLook) => void;

class WindLookStore {
  private state: WindLook = { ...DEFAULT_WIND_LOOK };
  private listeners = new Set<Listener>();
  get(): WindLook { return this.state; }
  set(change: Partial<WindLook>): void {
    this.state = { ...this.state, ...change };
    for (const fn of this.listeners) fn(this.state);
  }
  reset(): void { this.set({ ...DEFAULT_WIND_LOOK }); }
  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const windLook = new WindLookStore();
