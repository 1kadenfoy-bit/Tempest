// The forecast behind every weather layer (Data section): each model's newest
// run, the time line joining the models (the chosen one, then the chain), and
// the pin's series along it, live or from a saved area. Moved out of
// app/main.ts; it reads and sets the shared state in app/state.ts.
import { S, app, $ } from '../state';
import type { LayerSlots } from '../../layers/contract';
import { isAmount, PROFILE_RH_VARIABLES, PROFILE_VARIABLES, type PointSeries, type VariableName } from '../../core/vocabulary';
import { buildTimeline, orderFor, segmentAt } from '../../core/time/timeline';
import { areaContains, areaParts } from '../../core/offline/saved-area';
import { CHAIN, MODELS as REGISTRY, modelForMapModel, type ModelId } from '../../adapters/openmeteo-maps/models';
import { MODELS, fetchPointSeries } from '../../adapters/openmeteo-maps/point-series';
import { fetchRunMetadata, type RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import { fetchApiRun } from '../../adapters/openmeteo-api/point-series';
import { fetchObserved } from '../../adapters/eccc-geomet/hrdpa';
import * as precip from '../../layers/precipitation';
import { wind, WIND_NEEDS } from '../../layers/wind';
import { airQuality } from '../../layers/air-quality';
import { sampleNative } from '../../render/openmeteo-starter';
import { groundNear } from '../map/elevation';
import { loadSavedWeather, savedStep } from '../offline/saved-areas';
import { SURFACE_VARIABLES } from './profile-source';
import { savedOnlyActive } from './connection';
import { newerRunPossible } from '../../core/time/run-schedule';
import { retryDelay } from '../../core/time/retry';

/** Layers read from the pressure-level profile (GDPS's separate profile files, its 3-hourly steps). */
export const usesProfile = (l: LayerSlots) => l.id === 'temperature' || l.id === 'wind';
/**
 * What the pin's series asks for beyond the profile, for every layer at once:
 * one request serves them all, so switching layers needs no new download.
 */
let pinExtraOnce: VariableName[] | null = null;
export const pinExtra = (): VariableName[] => (pinExtraOnce ??= [...new Set(S.layers.flatMap((l) => l.pinNeeds.filter((v) => !isAmount(v))))]);
/** What each layer's map nodes need beyond the levels' heights: only that, since the API's limits count variables. */
export const nodeNeeds = (l: LayerSlots, feels = false): VariableName[] =>
  l.id === 'wind' ? WIND_NEEDS.filter((v) => !v.startsWith('temperature_'))
  : l.id === 'temperature' ? [...PROFILE_VARIABLES.filter((v) => v.startsWith('temperature_')), ...(feels ? SURFACE_VARIABLES : [])]
  : [...PROFILE_VARIABLES.filter((v) => v.startsWith('temperature_')), ...PROFILE_RH_VARIABLES];
/** The model chosen for a layer, remembered: a chain model starts the chain there; HRDPS by default. */
export const modelChoice = (l: LayerSlots): string => S.prefs.layerModels[l.id] ?? 'hrdps';
/** Models that carry what a layer needs (temperature needs the height profile). */
/** In the menu's order (v8 04): HRDPS, RDPS; then ECMWF IFS, GDPS. */
export const MENU_ORDER: ModelId[] = ['hrdps', 'rdps', 'ecmwf', 'gdps'];
export const modelsFor = (l: LayerSlots): ModelId[] => MENU_ORDER.filter((m) => !usesProfile(l) || REGISTRY[m].profile);

/** The run covering time t on the time line; for temperature, GDPS's profile run (its own steps). */
export function runAt(t: Date, forProfile = usesProfile(S.active)): RunMetadata | null {
  const seg = segmentAt(S.timeline, t);
  if (!seg) return null;
  const m = seg.model as ModelId;
  return (forProfile ? S.profileRuns[m] : undefined) ?? S.runs[m] ?? null;
}

/** Hours of the week's past to show before the run (the strip starts two days back). */
export const PAST_HOURS = 48;
/** The time the map shows for cursor time t: before the forecast starts, its first hour. */
export function mapTime(t: Date): Date {
  const first = S.timeline.steps[0];
  return first && t < first ? first : t;
}

/** Join the models for the active layer into one time line, and set the cursor's steps to it. */
export function rebuildTimeline() {
  const layer = S.active;
  const offered = modelsFor(layer);
  const forProfile = usesProfile(layer);
  const runFor = (m: ModelId) => (forProfile ? S.profileRuns[m] ?? S.runs[m] : S.runs[m]);
  const choice = offered.includes(modelChoice(layer) as ModelId) ? modelChoice(layer) : 'hrdps';
  const chain = CHAIN.filter((m) => offered.includes(m));
  const order = orderFor(choice, chain, (m) => !!runFor(m as ModelId));
  const modelRuns = Object.fromEntries(order.map((m) => {
    const r = runFor(m as ModelId);
    return [m, r ? { model: m, run: r.referenceTime, times: r.validTimes } : null];
  }));
  S.timeline = buildTimeline(order, modelRuns);
  S.run = S.timeline.segments[0] ? S.runs[S.timeline.segments[0].model as ModelId] ?? null : null;
  // The week's past, hour by hour, before the forecast's first step: the pin
  // has it (earlier runs, observed precipitation), the map does not.
  const firstStep = S.timeline.steps[0];
  S.pastSteps = firstStep && !S.usingSaved ? Array.from({ length: PAST_HOURS }, (_, k) => new Date(firstStep.getTime() - (PAST_HOURS - k) * 3_600_000)) : [];
  // An observed layer (radar): the one cursor steps through its frames instead.
  if (S.active.frames) { app.setFrameSteps(); return; }
  // Air quality: its source's own hours.
  if (S.active.id === airQuality.id) { S.cursor.setSteps(S.air.steps(), S.cursor.time ?? new Date()); S.scrubber.setTimeline({ seams: [] }); return; }
  S.cursor.setSteps([...S.pastSteps, ...S.timeline.steps], S.cursor.time ?? new Date());
  S.scrubber.setTimeline({
    seams: S.timeline.seams.map((x) => ({ time: x.time, label: REGISTRY[x.to as ModelId]?.label ?? x.to })),
  });
}
export async function loadPinGround() {
  const p = S.pin?.get();
  // Wind reads it: the layer on the map, or a strip in the forecast summary window.
  if (!p || (S.active.id !== 'wind' && !app.summaryWants(wind))) return;
  const models = [...new Set(S.timeline.segments.map((x) => x.model as ModelId))];
  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${models.join(',')}`;
  if (key === S.pinGround.key) return;
  S.pinGround.key = key;
  const got = await Promise.all(models.map(async (m) => [m, await groundNear(p.lng, p.lat, REGISTRY[m].gridKm).catch(() => null)] as const));
  if (key !== S.pinGround.key) return;
  S.pinGround.values = Object.fromEntries(got.flatMap(([m, g]) => (g === null ? [] : [[m, g] as const])));
  app.renderReadout();
  S.scrubber.refresh();
  app.refreshSummary();
}

/**
 * Fetch the past two days' observed 6-hour totals at the pin (once per place
 * and 6 hours). The last few places are kept, so moving the pin back asks
 * nothing.
 */
let observedFor = '';
const observedKept = new Map<string, Awaited<ReturnType<typeof fetchObserved>>>();
export async function loadObserved() {
  const p = S.pin?.get();
  if (!p || S.usingSaved) return;
  const now = new Date();
  const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}|${Math.floor(now.getTime() / 21_600_000)}`;
  if (key === observedFor) return;
  observedFor = key;
  const kept = observedKept.get(key);
  if (kept) {
    S.observed = kept.length ? kept : undefined;
    S.scrubber.refresh();
    app.scheduleDetails();
    app.refreshSummary();
    return;
  }
  try {
    const got = await fetchObserved(p.lat, p.lng, new Date(now.getTime() - PAST_HOURS * 3_600_000), now);
    observedKept.set(key, got);
    if (observedKept.size > 16) observedKept.delete(observedKept.keys().next().value!);
    if (key !== observedFor) return;
    S.observed = got.length ? got : undefined;
    S.scrubber.refresh();
    app.scheduleDetails();
    app.refreshSummary();
  } catch (err) {
    observedFor = '';
    console.warn('no observed precipitation', err);
  }
}
/**
 * The runs a saved area holds, by model, for use without signal: the area
 * the pin is in (else the newest saved), its first model and any later ones.
 */
export function savedRuns(): Partial<Record<ModelId, RunMetadata>> {
  const p = S.pin?.get();
  const inPin = p ? S.savedAreas.filter((a) => areaContains(a, p.lng, p.lat)) : [];
  const a = [...(inPin.length ? inPin : S.savedAreas)].sort((x, y) => y.savedAt.localeCompare(x.savedAt))[0];
  if (!a) return {};
  const out: Partial<Record<ModelId, RunMetadata>> = {};
  for (const part of areaParts(a)) {
    const w = part.weather;
    const spec = modelForMapModel(w.model);
    if (!spec || out[spec.id]) continue;
    const ref = new Date(w.run);
    out[spec.id] = { model: w.model, completed: true, referenceTime: ref, lastModified: new Date(a.savedAt), validTimes: [ref, ...w.validTimes.map((t) => new Date(t))], variables: [] };
  }
  return out;
}

/**
 * The run to show: the map files' newest, unless the point API still serves
 * an older one; then that older run (its map files stay online), so the map
 * and the pin always show the same run.
 */
export async function sharedRun(latest: RunMetadata): Promise<RunMetadata> {
  const api = await Promise.race([
    fetchApiRun(latest.model).catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), 4000)),
  ]);
  if (!api || api.getTime() >= latest.referenceTime.getTime()) return latest;
  const shift = latest.referenceTime.getTime() - api.getTime();
  return { ...latest, referenceTime: api, validTimes: latest.validTimes.map((t) => new Date(t.getTime() - shift)) };
}

/**
 * Each map-file model's newest run as last read, so it is asked again only
 * once a newer run could be there (core/time/run-schedule.ts; Data rule 1).
 * Without signal it is always asked: the answer (none) is what sends the app
 * to its saved areas.
 */
const latestRead = new Map<string, RunMetadata>();
async function latestRun(mapModel: string): Promise<RunMetadata> {
  const had = latestRead.get(mapModel);
  if (had?.completed && navigator.onLine && !newerRunPossible(mapModel, had.referenceTime, new Date())) return had;
  const got = await fetchRunMetadata(mapModel);
  latestRead.set(mapModel, got);
  return got;
}
/**
 * HRDPS's shared run (sharedRun), asked again only when the map files have a
 * newer run, or while the point API still serves an older one than they do.
 */
let sharedRead: RunMetadata | null = null;
async function sharedRunFor(latest: RunMetadata): Promise<RunMetadata> {
  // The point API already serves this run: nothing newer to learn from it.
  if (sharedRead?.referenceTime.getTime() === latest.referenceTime.getTime()) return latest;
  sharedRead = await sharedRun(latest);
  return sharedRead;
}

/** Every model's newest run, in parallel. HRDPS follows the point API's run (see sharedRun). */
export async function fetchAllRuns() {
  const ids = Object.keys(REGISTRY) as ModelId[];
  const got = await Promise.all(ids.map(async (m) => {
    const spec = REGISTRY[m];
    try {
      const latest = await latestRun(spec.mapModel);
      const surface = m === 'hrdps' ? await sharedRunFor(latest) : latest;
      const prof = spec.profileMapModel ? await latestRun(spec.profileMapModel).catch(() => null) : null;
      return [m, surface, prof] as const;
    } catch {
      return [m, null, null] as const;
    }
  }));
  const surface: Partial<Record<ModelId, RunMetadata>> = {};
  const profile: Partial<Record<ModelId, RunMetadata>> = {};
  for (const [m, a, b] of got) { if (a) surface[m] = a; if (b) profile[m] = b; }
  return { surface, profile };
}

export const runsKey = (r: Partial<Record<ModelId, RunMetadata>>) => Object.entries(r).map(([k, v]) => `${k}:${v!.referenceTime.toISOString()}`).sort().join('|');

export async function loadRun() {
  // "Saved data only": no network at all while a saved area exists.
  const savedOnly = savedOnlyActive();
  const next = savedOnly ? { surface: {}, profile: {} } : await fetchAllRuns().catch(() => ({ surface: {}, profile: {} }));
  if (Object.keys(next.surface).length) {
    const changed = S.usingSaved || runsKey(next.surface) !== runsKey(S.runs) || runsKey(next.profile) !== runsKey(S.profileRuns);
    S.usingSaved = false;
    S.runs = next.surface;
    S.profileRuns = next.profile;
    if (changed) {
      rebuildTimeline();
      void app.updateFills();
      void loadSeries();
      void app.loadSummarySeries();
    }
    app.renderRunAge();
    document.body.dataset.run = 'ready';
    return;
  }
  // No signal (or saved data only): a saved area's runs.
  const savedSet = savedRuns();
  const saved = savedSet.hrdps ?? Object.values(savedSet)[0];
  if (saved) {
    const changed = !S.usingSaved || runsKey(savedSet) !== runsKey(S.runs);
    S.runs = savedSet;
    S.profileRuns = {};
    S.usingSaved = true;
    if (changed) {
      rebuildTimeline();
      void app.updateFills();
      void loadSeries();
      void app.loadSummarySeries();
    }
    app.renderRunAge();
    document.body.dataset.run = 'saved';
    return;
  }
  document.body.dataset.run = 'error';
  if (S.active.frames) { app.renderRunAge(); return; }
  $('run-age').textContent = 'Weather unavailable · tap to retry';
  S.scrubber.setStatus('Could not reach the weather data');
}
export let seriesSeq = 0;
/**
 * Asking again for parts of the pin's series that did not come (service busy,
 * connection dropped): soon at first, then less often, and after six tries
 * (about 3 minutes) not at all (core/time/retry.ts). `stopped` then says so
 * on screen until something changes: another place, layer or run starts
 * afresh, and so do the app coming back to the screen and the connection
 * coming back.
 */
export let seriesRetry = { timer: 0, key: '', tries: 0, stopped: false };
/** Shown while the pin's forecast is no longer asked for. */
export const STOPPED_STATUS = 'The forecast service is not answering · move the pin to try again';
export function retrySeries(key: string): boolean {
  if (seriesRetry.key !== key) seriesRetry = { timer: 0, key, tries: 0, stopped: false };
  clearTimeout(seriesRetry.timer);
  const backoff = retryDelay(seriesRetry.tries++);
  if (backoff === null) { seriesRetry.stopped = true; return false; }
  // When the service gave a time, then.
  const delay = Math.max(backoff, S.profiles.apiRetryAt - Date.now() + 500);
  seriesRetry.timer = window.setTimeout(() => void loadSeries(), delay);
  return true;
}
/** After the tries ran out: start again (the app is back on screen, or the connection is). */
function resumeSeries() {
  if (!seriesRetry.stopped) return;
  seriesRetry = { timer: 0, key: '', tries: 0, stopped: false };
  void loadSeries();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeSeries(); });
addEventListener('online', resumeSeries);

/** One model's part of the pin's series, for the active layer. */
export async function modelSeries(layer: LayerSlots, m: ModelId, first: boolean, lat: number, lng: number, onPartial?: (s: PointSeries) => void, onLater?: (s: PointSeries) => void): Promise<PointSeries> {
  const spec = REGISTRY[m];
  const r = (usesProfile(layer) ? S.profileRuns[m] : undefined) ?? S.runs[m]!;
  const amounts = layer.pinNeeds.some(isAmount);
  const past = first && !S.usingSaved ? PAST_HOURS : 0;
  const extra = pinExtra();
  if (m === 'hrdps' && !S.usingSaved) {
    // One request for every layer: profile, wind, surface values and the
    // amounts, past hours included. Its amounts are the map files' own
    // numbers (the same model cell; checked hour by hour Nov 17), so the map,
    // the pin and saved areas still agree.
    try {
      return await S.profiles.pinSeries(r, lat, lng, onPartial, { amounts: true, pastHours: past, extra, noFiles: true });
    } catch (err) {
      console.warn('point API unavailable for the pin; reading the map files', err);
    }
  }
  if (m === 'hrdps' && amounts) {
    // Without the point API (or offline): amounts from the map files or the
    // saved area; the profile joins when it comes, which can take minutes
    // read from the files hour by hour.
    const own = (S.usingSaved ? await savedSeries(r, lat, lng) : null) ?? (S.usingSaved ? null : await fetchPointSeries(r, precip.needs, lat, lng));
    if (!own) throw new Error('the pin is outside the saved areas');
    const profP = S.profiles.pinSeries(r, lat, lng, undefined, { amounts: past > 0, pastHours: past, extra }).catch((err) => { console.warn('no profile for the pin', err); return null; });
    const quick = await Promise.race([profP, new Promise<null>((res) => setTimeout(() => res(null), 5000))]);
    if (quick) return overlay(quick, own);
    void profP.then((prof) => { if (prof) onLater?.(overlay(prof, own)); });
    return own;
  }
  // Hour by hour from the map files (minutes) only when the service is out for long (its hourly or daily limit).
  if (m === 'hrdps') return S.profiles.pinSeries(r, lat, lng, onPartial, { amounts, profile: spec.profile, pastHours: past, extra, noFiles: !S.profiles.apiLongDown });
  // Longer models: the point API gives every hour in one request. Without it,
  // precipitation reads its amounts from the model's map files (the profile,
  // hour by hour over days, would be too slow; rain or snow then uses the
  // model's own split).
  try {
    // Never days of map files hour by hour (that takes many minutes): without
    // the service, profiles wait for it (the series asks again); amounts read their own files.
    return await S.profiles.pinSeries(r, lat, lng, onPartial, { amounts, profile: spec.profile, pastHours: past, noFiles: true, extra });
  } catch (err) {
    if (!amounts || S.usingSaved) throw err;
    return fetchPointSeries(S.runs[m]!, precip.needs, lat, lng);
  }
}

/** `base` with `top`'s values wherever `top` has that time (same place). */
export function overlay(base: PointSeries, top: PointSeries): PointSeries {
  const at = new Map(top.times.map((t, i) => [t.getTime(), i]));
  const values: PointSeries['values'] = { ...base.values };
  for (const [k, v] of Object.entries(top.values) as [keyof PointSeries['values'], number[]][]) {
    const old = base.values[k];
    values[k] = base.times.map((t, i) => { const j = at.get(t.getTime()); return j === undefined ? old?.[i] ?? NaN : v[j]!; });
  }
  return { ...base, values };
}

/**
 * The pin's series along the time line: the past hours (earlier runs), then
 * each model's hours up to its last step, hourly, so totals never skip
 * hours. Each stretch names its model and run.
 */
export function stitch(parts: (PointSeries | null)[]): PointSeries | null {
  const firstPart = parts[0];
  if (!firstPart || !S.timeline.segments.length) return firstPart ?? null;
  const times: Date[] = [];
  const pick: { part: PointSeries; i: number }[] = [];
  const segments: NonNullable<PointSeries['segments']> = [];
  let prev = -Infinity;
  S.timeline.segments.forEach((seg, k) => {
    const part = parts[k];
    if (!part) return;
    const end = seg.steps[seg.steps.length - 1]!.getTime();
    const start = k === 0 ? -Infinity : prev;
    const from = times.length;
    part.times.forEach((t, i) => {
      const x = t.getTime();
      if (x > start && x <= end) { times.push(t); pick.push({ part, i }); }
    });
    if (times.length > from) {
      const firstStep = seg.steps[0]!.getTime();
      const pastEnd = times.findIndex((t) => t.getTime() >= firstStep);
      if (k === 0 && pastEnd > 0) segments.push({ model: seg.model, run: seg.run, from: times[0]!, to: times[pastEnd - 1]!, kind: 'earlier' });
      segments.push({ model: seg.model, run: seg.run, from: times[k === 0 ? Math.max(0, pastEnd) : from]!, to: times[times.length - 1]!, kind: 'forecast' });
    }
    prev = end;
  });
  const keys = new Set<keyof PointSeries['values']>();
  for (const p of parts) if (p) for (const k of Object.keys(p.values) as (keyof PointSeries['values'])[]) keys.add(k);
  const values: PointSeries['values'] = {};
  for (const k of keys) values[k] = pick.map(({ part, i }) => part.values[k]?.[i] ?? NaN);
  return { ...firstPart, times, values, segments };
}

export async function loadSeries() {
  // Radar has no forecast at the pin, and air quality reads its own: drop any series still on its way.
  if (S.active.frames || S.active.id === airQuality.id) { ++seriesSeq; S.scrubber.setStatus(''); return; }
  const p = S.pin.get();
  if (!S.run || !p || !S.timeline.segments.length) return;
  void loadObserved();
  void loadPinGround();
  const layer = S.active;
  const tlKey = S.timeline.segments.map((x) => `${x.model}@${x.run.toISOString()}`).join(',');
  const key = `${layer.id}|${tlKey}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${S.usingSaved}`;
  const cached = S.store.get(key);
  const mine = ++seriesSeq;
  if (cached) {
    S.series = cached;
    document.body.dataset.seriesComplete = 'true';
  } else {
    document.body.dataset.seriesComplete = 'false';
    // Asking again for missing stretches: keep showing what is there meanwhile.
    if (!(seriesRetry.key === key && S.series)) {
      S.series = null;
      S.scrubber.setStatus('Loading the pin’s forecast…');
      app.renderReadout();
    }
    const segs = S.timeline.segments;
    const parts: (PointSeries | null)[] = segs.map(() => null);
    // The first model first, so the readout comes quickly; the rest join it.
    try {
      const update = (part: PointSeries) => {
        if (mine !== seriesSeq) return;
        parts[0] = part;
        S.series = stitch(parts);
        app.renderReadout();
        S.scrubber.refresh();
      };
      parts[0] = await modelSeries(layer, segs[0]!.model as ModelId, true, p.lat, p.lng, update, update);
    } catch (err) {
      if (mine !== seriesSeq) return;
      console.error(err);
      if (S.usingSaved) { S.scrubber.setStatus('The pin is outside the saved area'); return; }
      S.scrubber.setStatus(retrySeries(key) ? 'The forecast service is busy · trying again shortly' : STOPPED_STATUS);
      return;
    }
    if (mine !== seriesSeq) return;
    S.series = stitch(parts);
    S.scrubber.setStatus('');
    app.renderReadout();
    S.scrubber.refresh();
    document.body.dataset.series = 'ready';
    await Promise.all(segs.slice(1).map(async (seg, k) => {
      parts[k + 1] = await modelSeries(layer, seg.model as ModelId, false, p.lat, p.lng).catch((err) => { console.warn(`no ${seg.model} series for the pin`, err); return null; });
    }));
    if (mine !== seriesSeq) return;
    S.series = stitch(parts);
    // Kept only when whole: a stretch that did not come is asked for again
    // (parts already read come from memory), never remembered as missing.
    document.body.dataset.seriesComplete = String(parts.every(Boolean));
    if (parts.every(Boolean)) { if (S.series) S.store.put(key, S.series); clearTimeout(seriesRetry.timer); seriesRetry = { timer: 0, key: '', tries: 0, stopped: false }; }
    else if (!S.usingSaved) retrySeries(key);
  }
  S.scrubber.setStatus('');
  app.renderReadout();
  S.scrubber.refresh();
  document.body.dataset.series = 'ready';
}

/** The pin's series from a saved area's grids (same run), for use without signal. */
export async function savedSeries(r: RunMetadata, lat: number, lng: number): Promise<PointSeries | null> {
  for (const a of S.savedParts) {
    if (!areaContains(a, lng, lat) || new Date(a.weather.run).getTime() !== r.referenceTime.getTime()) continue;
    if (!precip.needs.every((v) => a.weather.files[v])) continue;
    const w = await loadSavedWeather(a).catch(() => null);
    if (!w) continue;
    // The nearest model cell, as online (and as Open-Meteo's point forecast).
    const values = Object.fromEntries(precip.needs.map((v) => [v, w.times.map((_, i) => sampleNative(savedStep(w, i), v, lat, lng))]));
    return {
      label: { source: a.weather.source, model: a.weather.model, run: new Date(a.weather.run), gridKm: MODELS[a.weather.model]?.gridKm ?? NaN, licence: '', attribution: '', fetchedAt: new Date(a.savedAt), offline: true },
      lat, lon: lng, times: w.times, stepHours: a.weather.stepHours, values,
    };
  }
  return null;
}

