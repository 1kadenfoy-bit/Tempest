// The forecast summary window's data and wiring (Interface section): every
// chosen layer's chart for the pin, on the app's one time line. Opens with
// press-and-hold on the map (or a right click) and from the details. Loads only
// while open, through the same read path as the sheet. Moved out of
// app/main.ts; it reads the shared state in app/state.ts.
import { S, app, $ } from '../state';
import type { LayerSlots } from '../../layers/contract';
import type { PointSeries } from '../../core/vocabulary';
import { formatRunAge, runAgeHours } from '../../core/time/run-age';
import { MODELS as REGISTRY, type ModelId } from '../../adapters/openmeteo-maps/models';
import { precipitation } from '../../layers/precipitation';
import { avalanche } from '../../layers/avalanche';
import { airQuality } from '../../layers/air-quality';
import { nameNear } from '../shell/pin';
import { savePrefs } from '../shell/prefs';
import { loadObserved, modelSeries, stitch, STOPPED_STATUS } from '../data/forecast';
import { retryDelay } from '../../core/time/retry';
import { includedLayers, needsSeries, unionNeeds } from './choice';
import { setupLongPress } from './long-press';
import { setupSummaryWindow } from './summary-window';

let summaryWin: ReturnType<typeof setupSummaryWindow> | null = null;
let longPress: ReturnType<typeof setupLongPress> | null = null;
/** Redraw the window, when it exists (the pin and data code can run before it is set up). */
export function refreshSummary(): void { summaryWin?.refresh(); }
/** Open the window from a button (the details' "Forecast summary for this point"). */
export function openSummaryFrom(el: HTMLElement): void { summaryWin?.openFrom(el); }
/** True once for the click that ends a press-and-hold (it is not a tap). */
export function consumeLongPressClick(): boolean { return longPress?.consumeClick() ?? false; }

// ---- Forecast summary window (app/summary; no v8 design) -------------------
// Every chosen layer's chart for the pin, stacked on the app's one time line.
// Opens with press-and-hold on the map (or a right click) and from the details.
// Loads only while open, through the same read path as the sheet.
let summarySeries: PointSeries | null = null;
let summaryState: 'loading' | 'ready' | 'busy' | 'stopped' | 'outside' = 'loading';
let summaryFor = '';
let summarySeq = 0;
const summaryRetry = { timer: 0, tries: 0, key: '' };
const summaryShown = () => includedLayers(S.layers, S.prefs.summaryLayers);
export const summaryWants = (l: LayerSlots) => !!summaryWin?.isOpen() && summaryShown().includes(l);

/**
 * The pin's series for every strip at once: one request a model carrying what
 * they all need, read as the precipitation layer reads (surface runs, amounts
 * included). The HRDPS part is the very request the sheet makes, so it comes
 * from memory or the phone's cache, not the network.
 */
export async function loadSummarySeries() {
  if (!summaryWin?.isOpen()) return;
  const shown = summaryShown();
  if (shown.includes(avalanche)) S.avy.load();
  if (shown.includes(airQuality) && S.active.id !== airQuality.id) void S.air.forSummary();
  if (!needsSeries(shown)) { refreshSummary(); return; }
  const p = S.pin.get();
  if (!S.run || !p || !S.timeline.segments.length) return; // loadRun asks again once the run is in
  void loadObserved();
  void app.loadPinGround();
  const union: LayerSlots = { ...precipitation, id: 'summary', pinNeeds: unionNeeds(shown).variables };
  const tlKey = S.timeline.segments.map((x) => `${x.model}@${x.run.toISOString()}`).join(',');
  const key = `summary|${union.pinNeeds.join(',')}|${tlKey}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${S.usingSaved}`;
  const mine = ++summarySeq;
  clearTimeout(summaryRetry.timer);
  const cached = S.store.get(key);
  if (cached) { summarySeries = cached; summaryFor = key; summaryState = 'ready'; refreshSummary(); return; }
  if (summaryFor !== key) { summarySeries = null; summaryFor = key; summaryState = 'loading'; refreshSummary(); }
  const segs = S.timeline.segments;
  const parts: (PointSeries | null)[] = segs.map(() => null);
  const update = (part: PointSeries) => {
    if (mine !== summarySeq) return;
    parts[0] = part;
    summarySeries = stitch(parts);
    summaryState = 'ready';
    refreshSummary();
  };
  try {
    parts[0] = await modelSeries(union, segs[0]!.model as ModelId, true, p.lat, p.lng, update, update);
  } catch (err) {
    if (mine !== summarySeq) return;
    console.warn('no series for the forecast summary', err);
    summaryState = S.usingSaved ? 'outside' : retrySummary(key) ? 'busy' : 'stopped';
    refreshSummary();
    return;
  }
  if (mine !== summarySeq) return;
  summarySeries = stitch(parts);
  summaryState = 'ready';
  refreshSummary();
  await Promise.all(segs.slice(1).map(async (seg, k) => {
    parts[k + 1] = await modelSeries(union, seg.model as ModelId, false, p.lat, p.lng).catch((err) => { console.warn(`no ${seg.model} series for the summary`, err); return null; });
  }));
  if (mine !== summarySeq) return;
  summarySeries = stitch(parts);
  // Kept only when whole; a stretch that did not come is asked for again while the window is open.
  if (parts.every(Boolean)) { if (summarySeries) S.store.put(key, summarySeries); summaryRetry.tries = 0; }
  else if (!S.usingSaved) retrySummary(key);
  refreshSummary();
}
/**
 * Ask again for what did not come, backing off, and stop after a few tries
 * (core/time/retry.ts, Data rule 1); false once stopped. Another place, run
 * or choice of strips starts afresh.
 */
export function retrySummary(key: string): boolean {
  if (summaryRetry.key !== key) { summaryRetry.key = key; summaryRetry.tries = 0; }
  clearTimeout(summaryRetry.timer);
  const backoff = retryDelay(summaryRetry.tries++);
  if (backoff === null) return false;
  const delay = Math.max(backoff, S.profiles.apiRetryAt - Date.now() + 500);
  summaryRetry.timer = window.setTimeout(() => void loadSummarySeries(), delay);
  return true;
}

/** Sets up the window and press-and-hold once the map, pin and scrubber exist. */
export function setupSummary(): void {
summaryWin = setupSummaryWindow({
  cursor: S.cursor,
  layers: () => S.layers,
  choice: () => S.prefs.summaryLayers,
  setChoice: (c) => { S.prefs.summaryLayers = c; savePrefs(S.prefs); },
  windowHours: () => S.scrubber.chosenHours,
  setWindowHours: (h) => S.scrubber.setWindowHours(h),
  pinData: () => ({ series: summarySeries, elevation: S.pin.get()?.elevation ?? null, observed: S.observed, ground: S.pinGround.values }),
  index: () => { const t = S.cursor.time; return summarySeries && t ? summarySeries.times.findIndex((x) => x.getTime() === t.getTime()) : -1; },
  settingsFor: (l) => app.settingsFor(l),
  status: (l) => {
    if (!l.pinNeeds.length) return '';
    if (!S.run && document.body.dataset.run === 'error') return 'Could not reach the weather data';
    if (summaryState === 'outside') return 'The pin is outside the saved areas';
    if (!summarySeries) return summaryState === 'busy' ? 'The forecast service is busy · trying again shortly' : summaryState === 'stopped' ? STOPPED_STATUS : 'Loading the pin’s forecast…';
    const values = summarySeries.values;
    if (l.pinNeeds.some((v) => values[v]?.some(Number.isFinite))) return '';
    // Online, a part that has not come is still being asked for (the service busy: the map files, read hour by hour, are slow).
    return S.usingSaved ? `${l.title} is not saved for this area` : `${l.title} still coming · the forecast service is slow or busy`;
  },
  place: () => $('place-text').textContent ?? '',
  footer: () => {
    const now = new Date();
    const shown = summaryShown();
    const lines: { text: string; stale: boolean }[] = [];
    if (needsSeries(shown) && S.run) {
      const labels = [...new Set(S.timeline.segments.map((x) => REGISTRY[x.model as ModelId]?.label ?? x.model))];
      const later = labels.slice(1);
      lines.push({
        text: `${labels[0] ?? ''} · ${formatRunAge(S.run.referenceTime, now)}${S.usingSaved ? ' · saved' : ''}${later.length ? ` · then ${later.join(', ')}` : ''}`,
        stale: runAgeHours(S.run.referenceTime, now) >= 12 || S.timeline.missing.length > 0,
      });
    }
    const p = S.pin.get();
    if (p && shown.includes(avalanche)) lines.push(S.avy.ageLine(p.lng, p.lat));
    return lines;
  },
  note: () => (S.active.frames ? `Radar is on the map, so time moves only through its last ${S.active.frames.windowHours} hours. Choose another layer to move through the forecast.` : null),
  load: () => void loadSummarySeries(),
});
// Press-and-hold (or a right click): the pin moves there, as a tap moves it, and the window grows from it.
longPress = setupLongPress(S.map, (pt) => {
  const at = S.map.unproject([pt.x, pt.y]);
  const name = nameNear(S.map, pt);
  S.pin.set({ lng: at.lng, lat: at.lat, kind: 'dropped', name });
  app.rememberPin({ lng: at.lng, lat: at.lat, name });
  const r = S.map.getContainer().getBoundingClientRect();
  summaryWin?.openAt(r.left + pt.x, r.top + pt.y);
});
}
