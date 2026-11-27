// Frame timing for the ?perf tour: how often the screen was drawn while a
// step ran, the slowest 1% of frames and the longest freeze.
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface FrameStats {
  /** Seconds the step ran. */
  seconds: number;
  /** Average frames a second. */
  fps: number;
  /** The slowest 1% of frames, as frames a second. */
  low1: number;
  /** The longest gap between two frames, in ms. */
  worstMs: number;
  /** How many times the map itself was drawn. */
  mapDraws: number;
  /** Long tasks (over 50 ms of busy code), where the browser reports them (not Safari). */
  longTasks: number | null;
  longTaskMs: number | null;
}

const longTaskSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');

export class FrameRecorder {
  private gaps: number[] = [];
  private last = 0;
  private raf = 0;
  private t0 = 0;
  private draws = 0;
  private tasks = 0;
  private taskMs = 0;
  private obs: PerformanceObserver | null = null;
  private onRender = () => { this.draws++; };

  constructor(private map: MapLibreMap) {}

  start(): void {
    this.gaps = [];
    this.draws = 0;
    this.tasks = 0;
    this.taskMs = 0;
    this.t0 = performance.now();
    this.last = this.t0;
    this.map.on('render', this.onRender);
    if (longTaskSupported) {
      this.obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) { this.tasks++; this.taskMs += e.duration; } });
      this.obs.observe({ type: 'longtask', buffered: false });
    }
    const tick = (t: number) => {
      this.gaps.push(t - this.last);
      this.last = t;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): FrameStats {
    cancelAnimationFrame(this.raf);
    this.map.off('render', this.onRender);
    this.obs?.disconnect();
    const seconds = (performance.now() - this.t0) / 1000;
    // The first gap runs from start() to the first frame: not a frame of its own.
    const gaps = this.gaps.slice(1).sort((a, b) => a - b);
    const p99 = gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.99))]! : 0;
    return {
      seconds: round(seconds, 1),
      fps: round(gaps.length / Math.max(0.001, gaps.reduce((s, g) => s + g, 0) / 1000), 1),
      low1: p99 ? round(1000 / p99, 1) : 0,
      worstMs: Math.round(gaps[gaps.length - 1] ?? 0),
      mapDraws: this.draws,
      longTasks: longTaskSupported ? this.tasks : null,
      longTaskMs: longTaskSupported ? Math.round(this.taskMs) : null,
    };
  }
}

export const round = (x: number, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; };

/** Resolves after the next frame has been drawn (two animation frames). */
export const nextPaint = () => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame((t) => r(t))));

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
