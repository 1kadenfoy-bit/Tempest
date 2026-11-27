// The ?perf test mode (Performance section, docs/plans/performance.md).
//
//   ?perf        records the load, then runs the tour by itself and shows the results card
//   ?perf=load   records the load only (the build machine's download runs)
//   &off=a,b     switches features off before the tour (app/perf/switches.ts)
//   &idle=70     a longer quiet step at the end
//
// It is loaded only when the address has ?perf (app/main.ts), so the app is
// unchanged for everyone else. It reads the app's shared state; it never
// changes a setting the app keeps (the tour puts back what it changes).
import type { AppState } from '../state';
import { watchFetches, watchLoad, type FetchRecord, type LoadMarks } from './marks';

export interface PerfState {
  mode: string;
  marks: LoadMarks;
  fetches: FetchRecord[];
  /** Features switched off for this run (?perf&off=...), with the map layers each touched. */
  off?: Record<string, number>;
  /** Set by the tour as it runs. */
  tour?: unknown;
}

declare global {
  interface Window { tempestPerf?: PerfState }
}

export function startPerf(S: AppState): PerfState {
  const mode = new URLSearchParams(location.search).get('perf') || 'tour';
  const fetches = watchFetches();
  const state: PerfState = { mode, marks: {}, fetches };
  const off = new URLSearchParams(location.search).get('off');
  state.marks = watchLoad(() => S.map, async () => {
    if (off) state.off = (await import('./switches')).applyOff(S.map, off);
    if (mode !== 'load') void import('./tour').then((m) => m.runTour(S, state));
  });
  window.tempestPerf = state;
  return state;
}
