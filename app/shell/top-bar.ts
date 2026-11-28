// The top bar (Interface section): the layer name and its menu, the model or
// source button and its menus, the run's age, and the legend row. Moved out
// of app/main.ts; it reads the shared state in app/state.ts.
import { S, app, $ } from '../state';
import { formatMinutesAgo } from '../../core/units/format';
import { formatRunAge, runAgeHours } from '../../core/time/run-age';
import { segmentAt } from '../../core/time/timeline';
import { MODELS as REGISTRY, type ModelId } from '../../adapters/openmeteo-maps/models';
import { MODELS } from '../../adapters/openmeteo-maps/point-series';
import { avalanche } from '../../layers/avalanche';
import { airQuality } from '../../layers/air-quality';
import { savedOnlyActive } from '../data/connection';
import { mapSettings, type MapSettings } from '../map/map-settings';
import { setupNotifications } from '../notify/centre';
import { mapTime, modelsFor } from '../data/forecast';
import { RADAR_REFRESH_MS, radarError, radarFetchedAt, radarFrames, radarOffline } from '../radar/frames';
import { ATES_ICON } from '../avalanche/ates';
import { icons } from './icons';
import { layerMenuBody } from './layer-menu';
import { modelInfoBody, modelMenuBody, sourceMenuBody } from './model-menu';
import { closePanel, isOpenFrom, openPanel } from './panel';
import { savePrefs } from './prefs';


/** A second legend line some layers add (the avalanche layer's terrain ratings); set once the layer's map wiring exists. */
export const atesThumb = document.createElement('button');
/** The avalanche layer's sources, listed in its source menu. Only Avalanche Canada so far. */
export const AVALANCHE_SOURCES = [{ id: 'avalanche-canada', label: 'Avalanche Canada', short: 'AvCan', detail: 'Forecasts · reports · terrain' }] as const;
export let extraLegend: (doc: Document) => HTMLElement | null = () => null;
export function renderLegend() {
  const more = S.active.id === 'avalanche' ? extraLegend(document) : null;
  $('legend-row').replaceChildren(S.active.legend(document), ...(more ? [more] : []));
}

/** "2 h old", or "new" for a run that has just arrived. */
function ageText(hours: number): string {
  return hours >= 48 ? `${Math.floor(hours / 24)} d old` : hours < 1 ? 'new' : `${hours} h old`;
}
/** When the next update is due, in the top bar's words: "in ≈ 2 h", "any minute now", "late ≈ 1 h". */
export function nextText(dueMs: number, now = Date.now()): string {
  const min = Math.round((dueMs - now) / 60_000);
  if (min >= 90) return `in ${Math.round(min / 60)} h`;
  if (min >= 2) return `in ${min} min`;
  if (min >= -5) return 'any minute now';
  return `late ≈ ${Math.max(1, Math.round(-min / 60))} h`;
}

/** Point the shell's slots at the active layer. */
export function showLayer() {
  $('layer-name').textContent = S.active.title;
  renderLegend();
  syncAtesThumb();
  const weekDay = S.active.weekDay;
  S.scrubber.setLayer({
    chartLabel: S.active.chartLabel,
    drawChart: (ctx, w, h, start, end) => S.active.drawChart(ctx, w, h, app.pinData(), start, end),
    summary: (start, c, end) => S.active.summary(app.pinData(), start, c, end, app.settingsFor(S.active)),
    ...(weekDay ? { weekDay: (a: Date, b: Date) => weekDay(app.pinData(), a, b) } : {}),
    frames: S.active.frames,
  });
  // The source button is always shown, even where there is one source (radar names ECCC).
  $('model-pill').hidden = false;
  if (S.active.frames) $('model-pill-label').textContent = autoOn(S.active.id) ? 'Auto' : 'ECCC';
  // An issued layer names its source instead of a model.
  if (S.active.id === 'avalanche') $('model-pill-label').textContent = autoOn('avalanche') ? 'Auto' : AVALANCHE_SOURCES[0]!.short;
  if (S.active.id === airQuality.id) $('model-pill-label').textContent = autoOn(airQuality.id) ? 'Auto' : S.air.short();
  document.body.dataset.layer = S.active.id;
}
export function renderRunAge() {
  if (S.active.frames) {
    // Radar: the newest frame's age (stale past 30 minutes), or why there is none.
    const el = $('run-age');
    const newest = radarFrames[radarFrames.length - 1];
    el.textContent = radarOffline() ? 'Radar · needs a connection'
      : newest ? `${formatMinutesAgo(newest, new Date()).replace(' ago', ' old')} · next ${nextText(radarFetchedAt + RADAR_REFRESH_MS)}`
      : radarError ? 'Radar not reachable · tap to retry' : 'Finding the radar frames…';
    el.dataset.stale = String(!newest || radarOffline() || Date.now() - newest.getTime() > 30 * 60_000);
    return;
  } else if (S.active.id === 'avalanche') {
    $('model-pill-label').textContent = autoOn('avalanche') ? 'Auto' : AVALANCHE_SOURCES[0]!.short;
    if (!S.pin?.get()) return;
    // Avalanche: the pin's bulletin and its age, not a model run.
    const pinNow = S.pin!.get()!;
    const a = S.avy.ageLine(pinNow.lng, pinNow.lat);
    // The source button names Avalanche Canada, so the line keeps the age.
    $('run-age').textContent = a.text.replace(`${AVALANCHE_SOURCES[0]!.label} · issued `, 'Issued ');
    $('run-age').dataset.stale = String(a.stale);
    return;
  }
  if (S.active.id === airQuality.id) {
    const a = S.air.ageLine();
    $('model-pill-label').textContent = autoOn(airQuality.id) ? 'Auto' : S.air.short();
    $('run-age').textContent = a.text;
    $('run-age').dataset.stale = String(a.stale);
    return;
  }
  // The run of the model under the cursor; a missing model is named (visible fallback).
  const seg = S.cursor.time ? segmentAt(S.timeline, mapTime(S.cursor.time)) : S.timeline.segments[0];
  const r = seg ? S.runs[seg.model as ModelId] ?? S.run : S.run;
  if (!r) return;
  const el = $('run-age');
  // No connection, saved data only, or a saved copy: nothing can update, so no next update is promised.
  const offline = S.usingSaved || !navigator.onLine || savedOnlyActive();
  const missing = S.timeline.missing.map((m) => REGISTRY[m as ModelId]?.label ?? m);
  const model = (seg?.model ?? r.model) as ModelId;
  // How old the data is, and when the next run should arrive (one cycle after this one did).
  const due = r.lastModified.getTime() + (24 / REGISTRY[model].runsPerDay) * 3_600_000;
  // Just the age and the next update; the source button beside it says which data. A saved copy has no next update; a missing model is still named.
  el.textContent = `${ageText(runAgeHours(r.referenceTime, new Date()))} · ${offline ? 'offline' : `next ${nextText(due)}`}` + (missing.length ? ` · ${missing.join(', ')} unavailable` : '');
  // Stale is shown, never hidden: a run over 12 h old turns the warning colour.
  el.dataset.stale = String(runAgeHours(r.referenceTime, new Date()) >= 12 || missing.length > 0);
  const name = seg ? REGISTRY[seg.model as ModelId]?.label ?? seg.model : MODELS[r.model]?.label ?? r.model;
  $('model-pill-label').textContent = choiceOf(S.active.id) === AUTO ? 'Auto' : name;
  // The model under the cursor, for tests (Auto does not name it on screen), and the run the age is of.
  document.body.dataset.modelInView = String(seg?.model ?? r.model);
  document.body.dataset.ageRun = `${seg?.model ?? r.model}@${r.referenceTime.toISOString()}`;
}
export function syncAtesThumb() {
  atesThumb.style.display = S.active.id === 'avalanche' ? '' : 'none';
  atesThumb.setAttribute('aria-pressed', String(app.settingsFor(avalanche).ates === true));
}
// Model menu (04-ModelMenu) and model info (05-ModelInfo): grows from the model button.
export const modelBtn = () => $('model-pill');
/** The menu's first choice: the best model for each time, high resolution first (the same hand-over chain the app already uses). */
const AUTO = 'auto';
/** What is chosen for a layer: nothing chosen yet means Auto. */
const choiceOf = (layerId: string): string => S.prefs.layerModels[layerId] ?? AUTO;
/** Auto is on until a source or model is picked by hand. */
const autoOn = (layerId: string): boolean => choiceOf(layerId) === AUTO;
/** Remember a hand-picked source, or (null) go back to Auto. */
function rememberSource(layerId: string, id: string | null): void {
  if (id === null) S.prefs.layerModels = Object.fromEntries(Object.entries(S.prefs.layerModels).filter(([k]) => k !== layerId)); else S.prefs.layerModels[layerId] = id;
  savePrefs(S.prefs);
}
/** Auto, the source menu's first row, for any layer: every source with good data for the area, the best for each time. */
const autoRow = (layerId: string, onPick: () => void) => ({ current: autoOn(layerId), onPick });
export function modelAge(m: ModelId): string | null {
  const r = S.runs[m];
  return r ? formatRunAge(r.referenceTime, new Date()).split(' · ')[1] ?? null : null;
}
export function modelFacts(m: ModelId) {
  const r = S.runs[m];
  if (!r) return { latest: 'unavailable', next: '–' };
  const spec = REGISTRY[m];
  const hour = r.referenceTime.toISOString().slice(11, 13);
  const age = Math.round((Date.now() - r.referenceTime.getTime()) / 3_600_000);
  // The next run should arrive one cycle after this one did.
  const due = r.lastModified.getTime() + (24 / spec.runsPerDay) * 3_600_000;
  const left = Math.round((due - Date.now()) / 3_600_000);
  return { latest: `${hour}Z · ${age} h`, next: left >= 0 ? `≈ ${Math.max(1, left)} h` : `late ≈ ${-left} h` };
}
export function openModelInfo(spec: (typeof REGISTRY)[ModelId]) {
  openPanel({ origin: modelBtn(), icon: icons.info, title: spec.label, caption: spec.fullName, body: modelInfoBody(spec, modelFacts(spec.id)) });
}

/** Wires the buttons once the map, the pin and the safety layers exist (after the 3D switches, so the thumb buttons keep their order). */
export function setupTopBar(): void {
setupNotifications($('alert-badge'));
// The map panel's remembered choices go back on the map. Phones that only had the old Hillshade and Contours switches carry those over once.
{
  const saved: Record<string, string | boolean> = { ...S.prefs.mapSettings };
  if (!Object.keys(saved).length) {
    if (S.prefs.contours === false) saved.contours = false;
  }
  if (!S.prefs.hillshade || !S.prefs.contours) { S.prefs.hillshade = true; S.prefs.contours = true; savePrefs(S.prefs); }
  // Plain is gone (Kaden, Nov 22): a saved Plain is Terrain now.
  if (saved.ground === 'plain') saved.ground = 'shaded';
  // Trail names and peak heights are always on (Kaden, Nov 20).
  mapSettings.set({ ...(saved as Partial<MapSettings>), trailNames: true, peakHeights: true });
}
extraLegend = (doc) => S.avy.atesLegend(doc);
// The terrain ratings' quick switch: a round button with the thumb buttons,
// shown only while the avalanche layer is (no v8 design; the compass's shape).
// The same setting as the layer settings' switch.
atesThumb.className = 'thumb';
atesThumb.id = 'ates-toggle';
atesThumb.setAttribute('aria-label', 'Terrain complexity (ATES)');
atesThumb.innerHTML = ATES_ICON;
document.querySelector<HTMLElement>('.thumbs')!.prepend(atesThumb);
atesThumb.addEventListener('click', () => app.setLayerSetting(avalanche, 'ates', app.settingsFor(avalanche).ates !== true));
syncAtesThumb();
// Layer menu (03-LayerMenu): grows from the layer name; built layers only.
const layerBtn = $('layer-button');
layerBtn.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#run-age') && S.active.frames && radarError) { void app.loadRadarFrames(true); return; }
  if ((e.target as HTMLElement).closest('#run-age') && S.active.id === 'avalanche' && S.avy.needsRetry()) { S.avy.retry(); return; }
  if ((e.target as HTMLElement).closest('#run-age') && S.active.id === airQuality.id && S.air.needsRetry()) { S.air.retry(); return; }
  if ((e.target as HTMLElement).closest('#run-age') && document.body.dataset.run === 'error') { void app.loadRun(); return; }
  if (isOpenFrom(layerBtn)) { closePanel(); return; }
  openPanel({
    origin: layerBtn,
    icon: icons.chevronUp,
    iconAfterTitle: true,
    // The layer button sits inside the top bar with the source button: the window grows from the whole bar.
    shape: layerBtn.closest<HTMLElement>('.topbar-main') ?? layerBtn,
    title: 'Condition layer',
    caption: 'One condition layer at a time',
    body: layerMenuBody(S.layers, S.active.id, (l) => { closePanel(); app.setActive(l); }),
  });
});

// The status line follows the connection coming and going.
window.addEventListener('online', () => renderRunAge());
window.addEventListener('offline', () => renderRunAge());
// App settings (the gear at the top right): grows from its own button.
const settingsBtn = $('settings-button');
settingsBtn.addEventListener('click', () => {
  if (isOpenFrom(settingsBtn)) { closePanel(); return; }
  S.settings.open(settingsBtn);
});

modelBtn().addEventListener('click', () => {
  if (isOpenFrom(modelBtn())) { closePanel(); return; }
  const layer = S.active;
  if (layer.id === 'avalanche') {
    // Issued data: the source menu, with Avalanche Canada as the one source.
    const at = S.pin?.get();
    const line = at ? S.avy.ageLine(at.lng, at.lat).text : '';
    const rows = AVALANCHE_SOURCES.map((src, i) => ({ ...src, current: i === 0 && !autoOn('avalanche'), age: line.startsWith(`${src.label} · issued `) ? line.slice(src.label.length + 10).replace(' · expired', ', expired') : 'as issued' }));
    openPanel({ origin: modelBtn(), icon: '<span class="panel-letter">S</span>', title: 'Source', caption: `For this layer · ${layer.title}`, body: sourceMenuBody(rows, (id) => { closePanel(); rememberSource(layer.id, id); showLayer(); renderRunAge(); }, autoRow(layer.id, () => { closePanel(); rememberSource(layer.id, null); showLayer(); renderRunAge(); })) });
    return;
  }
  if (layer.id === airQuality.id) {
    openPanel({ origin: modelBtn(), icon: '<span class="panel-letter">S</span>', title: 'Source', caption: `For this layer · ${layer.title}`, body: sourceMenuBody(S.air.sourceRows().map((r) => ({ ...r, current: r.current && !autoOn(layer.id) })), (id) => {
      closePanel();
      rememberSource(layer.id, id);
      S.air.changed();
      showLayer();
      renderRunAge();
      void app.updateFills();
    }, autoRow(layer.id, () => {
      closePanel();
      rememberSource(layer.id, null);
      S.air.changed();
      showLayer();
      renderRunAge();
      void app.updateFills();
    })) });
    return;
  }
  if (layer.frames) {
    // Observed data: one source, listed so the button always has a menu.
    const newest = radarFrames[radarFrames.length - 1];
    openPanel({ origin: modelBtn(), icon: '<span class="panel-letter">S</span>', title: 'Source', caption: `For this layer · ${layer.title}`, body: sourceMenuBody([
      { id: 'eccc-radar', label: 'ECCC radar', detail: 'Observed rain and snow · new picture every 6 min', age: newest ? formatMinutesAgo(newest, new Date()) : 'not loaded', current: !autoOn(layer.id) },
    ], (id) => { closePanel(); rememberSource(layer.id, id); showLayer(); }, autoRow(layer.id, () => { closePanel(); rememberSource(layer.id, null); showLayer(); })) });
    return;
  }
  const choice = choiceOf(layer.id);
  const rows = modelsFor(layer).map((m) => ({ spec: REGISTRY[m], age: modelAge(m), current: m === choice }));
  openPanel({
    origin: modelBtn(),
    icon: '<span class="panel-letter">M</span>',
    title: 'Model',
    caption: `For this layer · ${layer.title}`,
    body: modelMenuBody(rows, choice === AUTO, (spec) => {
      closePanel();
      S.prefs.layerModels[layer.id] = spec ? spec.id : AUTO;
      savePrefs(S.prefs);
      app.rebuildTimeline();
      renderRunAge();
      S.series = null;
      document.body.dataset.series = '';
      app.renderReadout();
      void app.updateFills();
      void app.loadSeries();
    }, openModelInfo),
  });
});
}
