// The top bar (Interface section): the layer name and its menu, the model or
// source button and its menus, the run's age, and the legend row. Moved out
// of app/main.ts; it reads the shared state in app/state.ts.
import { S, app, $ } from '../state';
import { formatCursorTime, formatMinutesAgo } from '../../core/units/format';
import { formatRunAge, runAgeHours } from '../../core/time/run-age';
import { segmentAt } from '../../core/time/timeline';
import { MODELS as REGISTRY, type ModelId } from '../../adapters/openmeteo-maps/models';
import { MODELS } from '../../adapters/openmeteo-maps/point-series';
import { avalanche } from '../../layers/avalanche';
import { airQuality } from '../../layers/air-quality';
import { mapTime, modelChoice, modelsFor } from '../data/forecast';
import { radarError, radarFrames, radarOffline } from '../radar/frames';
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
  // An observed layer has no model to choose.
  $('model-pill').hidden = Boolean(S.active.frames);
  // An issued layer names its source instead of a model.
  if (S.active.id === 'avalanche') $('model-pill-label').textContent = AVALANCHE_SOURCES[0]!.short;
  if (S.active.id === airQuality.id) $('model-pill-label').textContent = S.air.short();
  document.body.dataset.layer = S.active.id;
}
export function renderRunAge() {
  if (S.active.frames) {
    // Radar: the newest frame's age (stale past 30 minutes), or why there is none.
    const el = $('run-age');
    const newest = radarFrames[radarFrames.length - 1];
    el.textContent = radarOffline() ? 'Radar · needs a connection'
      : newest ? `ECCC radar · newest ${formatMinutesAgo(newest, new Date())}`
      : radarError ? 'Radar not reachable · tap to retry' : 'Finding the radar frames…';
    el.dataset.stale = String(!newest || radarOffline() || Date.now() - newest.getTime() > 30 * 60_000);
    return;
  } else if (S.active.id === 'avalanche') {
    $('model-pill-label').textContent = AVALANCHE_SOURCES[0]!.short;
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
    $('model-pill-label').textContent = S.air.short();
    $('run-age').textContent = a.text;
    $('run-age').dataset.stale = String(a.stale);
    return;
  }
  // The run of the model under the cursor; a missing model is named (visible fallback).
  const seg = S.cursor.time ? segmentAt(S.timeline, mapTime(S.cursor.time)) : S.timeline.segments[0];
  const r = seg ? S.runs[seg.model as ModelId] ?? S.run : S.run;
  if (!r) return;
  const el = $('run-age');
  const missing = S.timeline.missing.map((m) => REGISTRY[m as ModelId]?.label ?? m);
  el.textContent = formatRunAge(r.referenceTime, new Date()) + (S.usingSaved ? ' · saved' : '') + (missing.length ? ` · ${missing.join(', ')} unavailable` : '')
    // Before the forecast the map holds its first hour; the pin has the past.
    + (S.cursor.time && S.timeline.steps[0] && S.cursor.time < S.timeline.steps[0] ? ` · map from ${formatCursorTime(S.timeline.steps[0])}` : '');
  // Stale is shown, never hidden: a run over 12 h old turns the warning colour.
  el.dataset.stale = String(runAgeHours(r.referenceTime, new Date()) >= 12 || missing.length > 0);
  $('model-pill-label').textContent = seg ? REGISTRY[seg.model as ModelId]?.label ?? seg.model : MODELS[r.model]?.label ?? r.model;
}
export function syncAtesThumb() {
  atesThumb.style.display = S.active.id === 'avalanche' ? '' : 'none';
  atesThumb.setAttribute('aria-pressed', String(app.settingsFor(avalanche).ates === true));
}
// Model menu (04-ModelMenu) and model info (05-ModelInfo): grows from the model button.
export const modelBtn = () => $('model-pill');
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
    title: 'Condition layer',
    caption: 'One condition layer at a time',
    body: layerMenuBody(S.layers, S.active.id, (l) => { closePanel(); app.setActive(l); }),
  });
});

modelBtn().addEventListener('click', () => {
  if (isOpenFrom(modelBtn())) { closePanel(); return; }
  const layer = S.active;
  if (layer.id === 'avalanche') {
    // Issued data: the source menu, with Avalanche Canada as the one source.
    const at = S.pin?.get();
    const line = at ? S.avy.ageLine(at.lng, at.lat).text : '';
    const rows = AVALANCHE_SOURCES.map((src, i) => ({ ...src, current: i === 0, age: line.startsWith(`${src.label} · issued `) ? line.slice(src.label.length + 10).replace(' · expired', ', expired') : 'as issued' }));
    openPanel({ origin: modelBtn(), icon: '<span class="panel-letter">S</span>', title: 'Source', caption: `For this layer · ${layer.title}`, body: sourceMenuBody(rows, () => closePanel()) });
    return;
  }
  if (layer.id === airQuality.id) {
    openPanel({ origin: modelBtn(), icon: '<span class="panel-letter">S</span>', title: 'Source', caption: `For this layer · ${layer.title}`, body: sourceMenuBody(S.air.sourceRows(), (id) => {
      closePanel();
      S.prefs.layerModels[layer.id] = id;
      savePrefs(S.prefs);
      S.air.changed();
      showLayer();
      renderRunAge();
      void app.updateFills();
    }) });
    return;
  }
  const choice = modelChoice(layer);
  const rows = modelsFor(layer).map((m) => ({ spec: REGISTRY[m], age: modelAge(m), current: m === choice }));
  openPanel({
    origin: modelBtn(),
    icon: '<span class="panel-letter">M</span>',
    title: 'Model',
    caption: `For this layer · ${layer.title}`,
    body: modelMenuBody(rows, (spec) => {
      closePanel();
      S.prefs.layerModels[layer.id] = spec.id;
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
