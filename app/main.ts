// Tempest: the shell (map, top bar, pin, thumb buttons, sheet, panels) with
// one condition layer at a time filling its slots (layers/contract.ts). One
// time cursor drives the map, the chart, the summary and the readout together.
import './shell/shell.css';
import type { LngLatLike } from 'maplibre-gl';
import { MemoryStore } from '../core/store/memory-store';
import { TimeCursor } from '../core/time/cursor';
import { formatRunAge, runAgeHours } from '../core/time/run-age';
import { formatCursorTime, formatElevation, formatMinutesAgo } from '../core/units/format';
import type { PointSeries } from '../core/vocabulary';
import { MODELS, fetchPointSeries } from '../adapters/openmeteo-maps/point-series';
import { fetchRunMetadata, type RunMetadata } from '../adapters/openmeteo-maps/run-metadata';
import { CHAIN, MODELS as REGISTRY, modelForMapModel, type ModelId } from '../adapters/openmeteo-maps/models';
import { buildTimeline, orderFor, segmentAt, type Timeline } from '../core/time/timeline';
import * as precip from '../layers/precipitation';
import { precipitation } from '../layers/precipitation';
import { temperature, temperatureRenderStyle } from '../layers/temperature';
import { wind, windRenderStyle, WIND_NEEDS } from '../layers/wind';
import { avalanche, setAvalancheCursor } from '../layers/avalanche';
import { setAvalanchePin } from '../core/avalanche/danger';
import { setupAvalanche } from './avalanche/avalanche';
import { ATES_ICON } from './avalanche/ates';
import { TerrainWindLayer } from '../render/grid-gl/terrain-wind-layer';
import { FlowCanvas, type FlowMode } from '../render/flow/flow-canvas';
import { modelGround, nodeProfiles, packWind, screenWind, windComplete } from './map/wind-field';
import { groundNear } from './map/elevation';
import type { LayerSlots, PinData } from '../layers/contract';
import { fetchApiRun } from '../adapters/openmeteo-api/point-series';
import { PROFILE_LEVELS, PROFILE_VARIABLES, isAmount, type VariableName } from '../core/vocabulary';
import { latticeAxis } from '../core/temperature/toposcale';
import { TerrainTemperatureLayer } from '../render/grid-gl/terrain-temperature-layer';
import { MODEL_SPACING_DEG, ProfileSource } from './data/profile-source';
import { elevationMosaic, type Mosaic } from './map/elevation';
import { levelLine, type LineKind } from './map/freezing-line';
import { renderCard } from './shell/cards';
import { bandsAt } from '../core/elevation/bands';
import { dewPoint } from '../core/temperature/feels-like';
import { freezingLevel } from '../core/temperature/toposcale';
import type { DetailContext, ViewSample } from '../layers/contract';
import { PROFILE_RH_VARIABLES } from '../core/vocabulary';
import { SURFACE_VARIABLES, type NodeData } from './data/profile-source';
import { windowRange } from '../core/time/window';
import { layerMenuBody } from './shell/layer-menu';
import { fetchObserved } from '../adapters/eccc-geomet/hrdpa';
import { modelInfoBody, modelMenuBody, sourceMenuBody } from './shell/model-menu';
import { fetchGridField } from '../adapters/openmeteo-maps/grid-field';
import { gridRequest } from '../core/geo/grid-request';
import type { GridField } from '../core/vocabulary';
import { TypedRateLayer } from '../render/grid-gl/typed-rate-layer';
import { areaContains, areaOverlaps, areaParts, tilesInBox, type SavedArea } from '../core/offline/saved-area';
import { offlineGroup, progressText, savedAreasBody } from './offline/offline-panel';
import { openSaveMode } from './offline/save-mode';
import { deleteArea, listSavedAreas, loadSavedWeather, saveArea, savedStep } from './offline/saved-areas';
import { coveringRanges, regridNative, sampleNative } from '../render/openmeteo-starter';
import { readFile, storageState } from './offline/storage';
import { savedOnlyActive, setSavedAreaCount } from './data/connection';
import { loadBasemap } from './map/basemap-router';
import { maplibregl } from './map/maplibre';
import { applyBaseTheme, topoStyle } from './map/style';
import { addTerrain, applyTerrainTheme } from './map/terrain';
import { hasBuildingHeights, setupThreeD } from './map/three-d';
import { hydrateIcons, icons } from './shell/icons';
import { applyInsetOverride } from './shell/insets';
import { mapPanelBody } from './shell/map-panel';
import { closePanel, isOpenFrom, openPanel } from './shell/panel';
import { createPin, nameNear, pinLabel, type PinState } from './shell/pin';
import { loadPrefs, savePrefs } from './shell/prefs';
import { setupScrubber } from './shell/scrubber';
import { setupSheet } from './shell/sheet';
import { setupViewport } from './shell/viewport';
import { colorToken, type Theme } from './theme/tokens';
import { startAppSettings } from './settings/app-settings';
import { alertsAt } from './alerts/alerts';
import { setupSearch } from './search/search';
import { COVERAGE, PRODUCTS, fetchFrames, radarAt, source as radarSource, tileUrl as radarTileUrl } from '../adapters/eccc-radar/radar';
import { radarLayer, shownOf, type RadarShown } from '../layers/radar';
import type { RadarAtPin, RadarPoint } from '../layers/contract';
import { ImageFrames } from './map/image-frames';
import { setupStations } from './stations/stations';
import { includedLayers, needsSeries, unionNeeds } from './summary/choice';
import { setupLongPress } from './summary/long-press';
import { setupSummaryWindow } from './summary/summary-window';

const prefs = loadPrefs();
// App settings: units and theme apply before anything draws; the hooks redraw
// what CSS cannot reach (defined further down, called only on a change).
const appSettings = startAppSettings(prefs, {
  savePrefs: () => savePrefs(prefs),
  onUnits: () => redrawForUnits(),
  onTheme: (t) => recolourForTheme(t),
  onSavedOnly: (on) => setSavedOnly(on),
  basemapAttribution: () => String(basemap.source.attribution ?? ''),
});
applyInsetOverride(document, location.search);
setupViewport(document);
hydrateIcons(document);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// North Shore, the start region on every design screen.
const NORTH_SHORE: [number, number] = [-123.02, 49.38];

const basemap = await loadBasemap(document.baseURI);

// Saved areas: their base map files are read first, inside their boxes.
let savedAreas: SavedArea[] = [];
/** Each saved model run as an area of its own (HRDPS, then RDPS past its end): what the readers match runs against. */
let savedParts: SavedArea[] = [];
async function registerSavedAreas() {
  try {
    savedAreas = await listSavedAreas();
    savedParts = savedAreas.flatMap(areaParts);
    setSavedAreaCount(savedAreas.length);
    for (const a of savedAreas) {
      const file = await readFile(a.basemap.file);
      if (file) basemap.addSaved(a.id, file, a.bbox, a.basemap.minzoom, a.basemap.maxzoom);
    }
  } catch { savedAreas = []; savedParts = []; }
}
await registerSavedAreas();
const map = new maplibregl.Map({
  container: 'map',
  style: topoStyle(basemap.source, appSettings.theme()),
  center: prefs.lastPin ? [prefs.lastPin.lng, prefs.lastPin.lat] : NORTH_SHORE,
  zoom: 11,
  minZoom: 4,
  maxZoom: 16,
  maxBounds: [[-145, 44], [-108, 63]],
  attributionControl: false,
  pitchWithRotate: false,
  dragRotate: false,
});
map.touchZoomRotate.disableRotation();
map.touchPitch.disable();
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
(window as unknown as { tempestMap: typeof map }).tempestMap = map;

// Weather stations: an overlay over every layer (map panel), online only.
const stations = setupStations(map, {
  enabled: prefs.stations,
  layerId: prefs.layer,
  // Read only on a tap, after the pin exists (set up further down).
  pin: () => { const p = pin.get(); return p ? { lat: p.lat, lon: p.lng } : null; },
  savedOnly: () => savedOnlyActive(),
});

// Keep "centre" meaning the part of the map above the collapsed sheet. The
// pulled-up sheet covers the map without moving it.
const sheetEl = $('sheet');
let sheetCtl: ReturnType<typeof setupSheet> | null = null;
const fitPadding = () => {
  map.setPadding({ top: 0, bottom: sheetCtl?.collapsedHeight() ?? 320, left: 0, right: 0 });
};

// Terrain switches
const applyTerrainPrefs = () => {
  if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', prefs.hillshade ? 'visible' : 'none');
  if (map.getLayer('contour-lines')) map.setLayoutProperty('contour-lines', 'visibility', prefs.contours ? 'visible' : 'none');
};

// One time cursor for the whole app, and the scrubber that shows it.
const cursor = new TimeCursor();
const scrubber = setupScrubber(cursor, prefs.windowHours, (h) => { prefs.windowHours = h; savePrefs(prefs); scheduleDetails(); });
setInterval(() => { if (document.visibilityState === 'visible') scrubber.refresh(); }, 30_000);

// The condition layers that work, in menu order. One is shown at a time.
// Radar (no v8 design yet): ECCC's pictures in ECCC's colours; the layer gets its legend from here, never from the source.
const radarShown = (): RadarShown => shownOf(settingsFor(radar));
const radar: LayerSlots = radarLayer((s) => PRODUCTS[s].legend, () => radarShown());
const LAYERS: LayerSlots[] = [precipitation, temperature, wind, radar, avalanche];
/** Why a layer cannot be saved for offline use, when its source does not allow it. */
const onlineOnly = (l: LayerSlots): string | undefined =>
  l.id === radar.id && !radarSource.offline ? 'Its source does not allow saving'
  : l.id === 'avalanche' ? 'Kept on the phone automatically: the latest bulletins and reports'
  : undefined;

// ---- Radar frames: the times ECCC holds (last 3 h, every 6 min), and what the cursor's frame shows at the pin.
let radarFrames: Date[] = [];
let radarFor = '';
let radarFetchedAt = 0;
let radarError = false;
const RADAR_REFRESH_MS = 6 * 60_000;
/** Values at the pin by product, place and frame (each frame is final once issued). */
const radarPoints = new Map<string, RadarPoint | 'error'>();
let radarPinTimer = 0;
let radarRetried = '';
/** Radar is online only: no signal, or saved data only, means none. */
const radarOffline = () => usingSaved || savedOnlyActive() || !navigator.onLine;
const radarPointKey = (lat: number, lng: number, t: Date) => `${radarShown()}|${lat.toFixed(4)},${lng.toFixed(4)}|${t.toISOString()}`;
// ECCC's pictures sit over the terrain and under the labels; ECCC's colours, a little see-through so the map reads.
const radarImages = new ImageFrames(map, 'radar', { opacity: 0.85, keep: 12, attribution: 'Radar © Environment and Climate Change Canada', maxzoom: 10 });

function radarPinData(): RadarAtPin | undefined {
  if (!active.frames) return undefined;
  const t = cursor.time && radarFrames.length ? cursor.time : null;
  const p = pin?.get();
  if (radarOffline()) return { frames: radarFrames, time: t, point: 'offline' };
  if (!radarFrames.length) return { frames: [], time: null, point: radarError ? 'error' : null };
  return { frames: radarFrames, time: t, point: p && t ? radarPoints.get(radarPointKey(p.lat, p.lng, t)) ?? null : null };
}

/** The frames the cursor steps through while radar is shown: it stays on the newest unless moved back. */
function setFrameSteps() {
  const t = cursor.time;
  const onFrames = !!t && radarFrames.some((f) => f.getTime() === t.getTime());
  const atNewest = !t || !onFrames || (cursor.last && t.getTime() === cursor.last.getTime());
  cursor.setSteps(radarFrames, atNewest ? radarFrames[radarFrames.length - 1] : t);
  scrubber.setTimeline({ seams: [] });
}

/** Ask ECCC which frames it holds (once a frame, or now when `force`). */
async function loadRadarFrames(force = false) {
  if (!active.frames) return;
  const shown = radarShown();
  if (radarOffline()) { renderRunAge(); renderReadout(); scrubber.refresh(); void updateFills(); return; }
  if (!force && shown === radarFor && Date.now() - radarFetchedAt < RADAR_REFRESH_MS) return;
  if (shown !== radarFor) { radarFrames = []; setFrameSteps(); }
  try {
    const times = await fetchFrames(PRODUCTS[shown].layer);
    if (shown !== radarShown()) return;
    radarFrames = times;
    radarFor = shown;
    radarFetchedAt = Date.now();
    radarError = false;
  } catch (err) {
    console.warn('radar frames unavailable', err);
    radarError = true;
  }
  if (!active.frames) return;
  setFrameSteps();
  renderRunAge();
  renderReadout();
  scrubber.refresh();
  void updateFills();
  scheduleRadarPin();
  document.body.dataset.radar = radarFrames.length ? 'ready' : 'error';
}

/** The cursor's frame at the pin, once the cursor rests (not on every frame while playing). */
function scheduleRadarPin() {
  clearTimeout(radarPinTimer);
  if (active.frames) radarPinTimer = window.setTimeout(() => void loadRadarPin(), 800);
}
async function loadRadarPin() {
  const p = pin?.get();
  const t = cursor.time;
  if (!active.frames || !p || !t || radarOffline() || !radarFrames.some((f) => f.getTime() === t.getTime())) return;
  const key = radarPointKey(p.lat, p.lng, t);
  if (radarPoints.get(key) && radarPoints.get(key) !== 'error') return;
  const v = await radarAt(radarShown(), p.lat, p.lng, t).catch((err) => { console.warn('radar at the pin', err); return 'error' as const; });
  radarPoints.set(key, v);
  if (radarPoints.size > 300) radarPoints.delete(radarPoints.keys().next().value!);
  // A dropped answer is asked for once more, a few seconds later.
  if (v === 'error' && radarRetried !== key) { radarRetried = key; radarPinTimer = window.setTimeout(() => void loadRadarPin(), 3000); }
  renderReadout();
  scrubber.refresh();
}

/** Show the cursor's frame, with the next ones loading behind it (and the loop's start at the newest). */
function showRadarFrame() {
  const t = cursor.time;
  if (!t || !radarFrames.length || radarOffline()) { radarImages.show(null); radarImages.setCoverage(null); return; }
  const shown = radarShown();
  const prod = PRODUCTS[shown];
  radarImages.setSource(shown, (x) => radarTileUrl(prod.layer, prod.style, x));
  const i = radarFrames.findIndex((f) => f.getTime() === t.getTime());
  const newest = radarFrames[radarFrames.length - 1]!;
  const loopStart = radarFrames.find((f) => f.getTime() >= newest.getTime() - (active.frames?.loopHours ?? 1) * 3_600_000) ?? radarFrames[0]!;
  const ahead = i < 0 ? [] : [radarFrames[i + 1] ?? loopStart, radarFrames[i + 2]].filter((x): x is Date => !!x);
  radarImages.show(t, ahead);
  // ECCC's coverage at the newest frame: where its radars reach (grey beyond), so gaps never read as dry.
  radarImages.setCoverage(settingsFor(radar).coverage ? radarTileUrl(COVERAGE.layer, COVERAGE.style, newest) : null);
  document.body.dataset.fill = 'ready';
  document.body.dataset.radarFrame = t.toISOString();
}
/** Layers read from the pressure-level profile (GDPS's separate profile files, its 3-hourly steps). */
const usesProfile = (l: LayerSlots) => l.id === 'temperature' || l.id === 'wind';
/**
 * What the pin's series asks for beyond the profile, for every layer at once:
 * one request serves them all, so switching layers needs no new download.
 */
const PIN_EXTRA = [...new Set(LAYERS.flatMap((l) => l.pinNeeds.filter((v) => !isAmount(v))))];
/** What each layer's map nodes need beyond the levels' heights: only that, since the API's limits count variables. */
const nodeNeeds = (l: LayerSlots, feels = false): VariableName[] =>
  l.id === 'wind' ? WIND_NEEDS.filter((v) => !v.startsWith('temperature_'))
  : l.id === 'temperature' ? [...PROFILE_VARIABLES.filter((v) => v.startsWith('temperature_')), ...(feels ? SURFACE_VARIABLES : [])]
  : [...PROFILE_VARIABLES.filter((v) => v.startsWith('temperature_')), ...PROFILE_RH_VARIABLES];
let active: LayerSlots = LAYERS.find((l) => l.id === prefs.layer) ?? precipitation;

// The layer's data: each model's newest run, the time line joining them
// (chosen model, then the chain), and the pin's series along it.
const store = new MemoryStore<PointSeries>(32);
/** The newest run of each model (surface files), and of GDPS's separate profile files. */
let runs: Partial<Record<ModelId, RunMetadata>> = {};
let profileRuns: Partial<Record<ModelId, RunMetadata>> = {};
let timeline: Timeline = { segments: [], steps: [], seams: [], missing: [] };
/** The first model's run on the time line (saving, offline). */
let run: RunMetadata | null = null;

/** The model chosen for a layer, remembered: a chain model starts the chain there; HRDPS by default. */
const modelChoice = (l: LayerSlots): string => prefs.layerModels[l.id] ?? 'hrdps';
/** Models that carry what a layer needs (temperature needs the height profile). */
/** In the menu's order (v8 04): HRDPS, RDPS; then ECMWF IFS, GDPS. */
const MENU_ORDER: ModelId[] = ['hrdps', 'rdps', 'ecmwf', 'gdps'];
const modelsFor = (l: LayerSlots): ModelId[] => MENU_ORDER.filter((m) => !usesProfile(l) || REGISTRY[m].profile);

/** The run covering time t on the time line; for temperature, GDPS's profile run (its own steps). */
function runAt(t: Date, forProfile = usesProfile(active)): RunMetadata | null {
  const seg = segmentAt(timeline, t);
  if (!seg) return null;
  const m = seg.model as ModelId;
  return (forProfile ? profileRuns[m] : undefined) ?? runs[m] ?? null;
}

/** Hours of the week's past to show before the run (the strip starts two days back). */
const PAST_HOURS = 48;
/** The hours before the forecast the cursor can reach (pin only). */
let pastSteps: Date[] = [];
/** The time the map shows for cursor time t: before the forecast starts, its first hour. */
function mapTime(t: Date): Date {
  const first = timeline.steps[0];
  return first && t < first ? first : t;
}

/** Join the models for the active layer into one time line, and set the cursor's steps to it. */
function rebuildTimeline() {
  const layer = active;
  const offered = modelsFor(layer);
  const forProfile = usesProfile(layer);
  const runFor = (m: ModelId) => (forProfile ? profileRuns[m] ?? runs[m] : runs[m]);
  const choice = offered.includes(modelChoice(layer) as ModelId) ? modelChoice(layer) : 'hrdps';
  const chain = CHAIN.filter((m) => offered.includes(m));
  const order = orderFor(choice, chain, (m) => !!runFor(m as ModelId));
  const modelRuns = Object.fromEntries(order.map((m) => {
    const r = runFor(m as ModelId);
    return [m, r ? { model: m, run: r.referenceTime, times: r.validTimes } : null];
  }));
  timeline = buildTimeline(order, modelRuns);
  run = timeline.segments[0] ? runs[timeline.segments[0].model as ModelId] ?? null : null;
  // The week's past, hour by hour, before the forecast's first step: the pin
  // has it (earlier runs, observed precipitation), the map does not.
  const firstStep = timeline.steps[0];
  pastSteps = firstStep && !usingSaved ? Array.from({ length: PAST_HOURS }, (_, k) => new Date(firstStep.getTime() - (PAST_HOURS - k) * 3_600_000)) : [];
  // An observed layer (radar): the one cursor steps through its frames instead.
  if (active.frames) { setFrameSteps(); return; }
  cursor.setSteps([...pastSteps, ...timeline.steps], cursor.time ?? new Date());
  scrubber.setTimeline({
    seams: timeline.seams.map((x) => ({ time: x.time, label: REGISTRY[x.to as ModelId]?.label ?? x.to })),
  });
}
let series: PointSeries | null = null;
/** True when the run comes from a saved area (no signal). */
let usingSaved = false;

/** Observed precipitation at the pin for the week's past (HRDPA), online only. */
let observed: PinData['observed'] = undefined;
let observedFor = '';
const pinData = (): PinData => ({ series, elevation: pin?.get()?.elevation ?? null, observed, ground: pinGround.values, radar: radarPinData() });

/** The model's own ground near the pin, per model on the time line (wind reads the terrain against it). */
const pinGround: { key: string; values: Record<string, number> } = { key: '', values: {} };
async function loadPinGround() {
  const p = pin?.get();
  // Wind reads it: the layer on the map, or a strip in the forecast summary window.
  if (!p || (active.id !== 'wind' && !summaryWants(wind))) return;
  const models = [...new Set(timeline.segments.map((x) => x.model as ModelId))];
  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${models.join(',')}`;
  if (key === pinGround.key) return;
  pinGround.key = key;
  const got = await Promise.all(models.map(async (m) => [m, await groundNear(p.lng, p.lat, REGISTRY[m].gridKm).catch(() => null)] as const));
  if (key !== pinGround.key) return;
  pinGround.values = Object.fromEntries(got.flatMap(([m, g]) => (g === null ? [] : [[m, g] as const])));
  renderReadout();
  scrubber.refresh();
  summaryWin.refresh();
}

/** Fetch the past two days' observed 6-hour totals at the pin (once per place and 6 hours). */
async function loadObserved() {
  const p = pin?.get();
  if (!p || usingSaved) return;
  const now = new Date();
  const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}|${Math.floor(now.getTime() / 21_600_000)}`;
  if (key === observedFor) return;
  observedFor = key;
  try {
    const got = await fetchObserved(p.lat, p.lng, new Date(now.getTime() - PAST_HOURS * 3_600_000), now);
    if (key !== observedFor) return;
    observed = got.length ? got : undefined;
    scrubber.refresh();
    scheduleDetails();
    summaryWin.refresh();
  } catch (err) {
    observedFor = '';
    console.warn('no observed precipitation', err);
  }
}

/** A layer's settings: its defaults, overlaid with what was chosen (remembered between sessions). */
function settingsFor(l: LayerSlots): Record<string, string | boolean> {
  const saved = prefs.layerSettings[l.id] ?? {};
  return Object.fromEntries(l.settings.map((x) => [x.key, saved[x.key] ?? x.default]));
}
const profiles = new ProfileSource(() => savedParts, () => usingSaved);

/** A second legend line some layers add (the avalanche layer's terrain ratings); set once the layer's map wiring exists. */
const atesThumb = document.createElement('button');
/** The avalanche layer's sources, listed in its source menu. Only Avalanche Canada so far. */
const AVALANCHE_SOURCES = [{ id: 'avalanche-canada', label: 'Avalanche Canada', short: 'AvCan', detail: 'Forecasts · reports · terrain' }] as const;
let extraLegend: (doc: Document) => HTMLElement | null = () => null;
function renderLegend() {
  const more = active.id === 'avalanche' ? extraLegend(document) : null;
  $('legend-row').replaceChildren(active.legend(document), ...(more ? [more] : []));
}

/** Point the shell's slots at the active layer. */
function showLayer() {
  $('layer-name').textContent = active.title;
  renderLegend();
  syncAtesThumb();
  const weekDay = active.weekDay;
  scrubber.setLayer({
    chartLabel: active.chartLabel,
    drawChart: (ctx, w, h, start, end) => active.drawChart(ctx, w, h, pinData(), start, end),
    summary: (start, c, end) => active.summary(pinData(), start, c, end, settingsFor(active)),
    ...(weekDay ? { weekDay: (a: Date, b: Date) => weekDay(pinData(), a, b) } : {}),
    frames: active.frames,
  });
  // An observed layer has no model to choose.
  $('model-pill').hidden = Boolean(active.frames);
  // An issued layer names its source instead of a model.
  if (active.id === 'avalanche') $('model-pill-label').textContent = AVALANCHE_SOURCES[0]!.short;
  document.body.dataset.layer = active.id;
}
showLayer();

function renderRunAge() {
  if (active.frames) {
    // Radar: the newest frame's age (stale past 30 minutes), or why there is none.
    const el = $('run-age');
    const newest = radarFrames[radarFrames.length - 1];
    el.textContent = radarOffline() ? 'Radar · needs a connection'
      : newest ? `ECCC radar · newest ${formatMinutesAgo(newest, new Date())}`
      : radarError ? 'Radar not reachable · tap to retry' : 'Finding the radar frames…';
    el.dataset.stale = String(!newest || radarOffline() || Date.now() - newest.getTime() > 30 * 60_000);
    return;
  } else if (active.id === 'avalanche') {
    $('model-pill-label').textContent = AVALANCHE_SOURCES[0]!.short;
    if (!pin?.get()) return;
    // Avalanche: the pin's bulletin and its age, not a model run.
    const pinNow = pin!.get()!;
    const a = avy.ageLine(pinNow.lng, pinNow.lat);
    // The source button names Avalanche Canada, so the line keeps the age.
    $('run-age').textContent = a.text.replace(`${AVALANCHE_SOURCES[0]!.label} · issued `, 'Issued ');
    $('run-age').dataset.stale = String(a.stale);
    return;
  }
  // The run of the model under the cursor; a missing model is named (visible fallback).
  const seg = cursor.time ? segmentAt(timeline, mapTime(cursor.time)) : timeline.segments[0];
  const r = seg ? runs[seg.model as ModelId] ?? run : run;
  if (!r) return;
  const el = $('run-age');
  const missing = timeline.missing.map((m) => REGISTRY[m as ModelId]?.label ?? m);
  el.textContent = formatRunAge(r.referenceTime, new Date()) + (usingSaved ? ' · saved' : '') + (missing.length ? ` · ${missing.join(', ')} unavailable` : '')
    // Before the forecast the map holds its first hour; the pin has the past.
    + (cursor.time && timeline.steps[0] && cursor.time < timeline.steps[0] ? ` · map from ${formatCursorTime(timeline.steps[0])}` : '');
  // Stale is shown, never hidden: a run over 12 h old turns the warning colour.
  el.dataset.stale = String(runAgeHours(r.referenceTime, new Date()) >= 12 || missing.length > 0);
  $('model-pill-label').textContent = seg ? REGISTRY[seg.model as ModelId]?.label ?? seg.model : MODELS[r.model]?.label ?? r.model;
}

function renderReadout() {
  // The avalanche layer needs no model run: until the time line is built, it reads now.
  setAvalancheCursor(cursor.time ?? new Date());
  const i = seriesIndex();
  pin.setReadout(active.readout(pinData(), i, settingsFor(active)));
  scheduleDetails();
}

/** Index into the pin's series for the cursor's step. */
function seriesIndex(): number {
  const t = cursor.time;
  if (!series || !t) return -1;
  return series.times.findIndex((s) => s.getTime() === t.getTime());
}

// The map fill: the app's own renderer, fed grid fields for the view and
// the cursor's step. Fields come from the store first, then the adapter.
const BC_BOX: [number, number, number, number] = [-139.1, 48.2, -114, 60];
const precipLayer = new TypedRateLayer('precip-grid', precip.precipRenderStyle(settingsFor(precipitation).type as 'all' | 'rain' | 'snow'));
const tempLayer = new TerrainTemperatureLayer('temperature-grid', temperatureRenderStyle(), PROFILE_LEVELS.length);
const windLayer = new TerrainWindLayer('wind-grid', windRenderStyle(), PROFILE_LEVELS.length);
// Inside the map's canvas container, before the pin, so the pin stays on top.
const flow = new FlowCanvas(map.getCanvasContainer(), map.getContainer());
map.on('resize', () => flow.resized());
// A frame-rate readout for checking the flow on a phone: add ?fps to the address.
if (new URLSearchParams(location.search).has('fps')) {
  const meter = document.createElement('div');
  meter.className = 'fps-meter';
  document.body.append(meter);
  setInterval(() => {
    const f = flow.fps();
    meter.textContent = f ? `${Math.round(f)} fps · ${flow.workMs().toFixed(1)} ms a frame` : 'flow paused';
  }, 1000);
}
(window as unknown as { tempestFlow: FlowCanvas }).tempestFlow = flow;
// 3D terrain and buildings. The flow is drawn in screen space for a flat,
// north-up map, so it waits while the map is tilted or turned.
const buildingsOk = hasBuildingHeights(basemap.manifest.vector_layers);
function syncAtesThumb() {
  atesThumb.style.display = active.id === 'avalanche' ? '' : 'none';
  atesThumb.setAttribute('aria-pressed', String(settingsFor(avalanche).ates === true));
}
const threeD = setupThreeD(map, document.querySelector<HTMLElement>('.thumbs')!, () => appSettings.theme(), (flat) => flow.setShown(active.id === 'wind' && flat));
/** The flow's mode from the wind settings: animated, still arrows, or nothing. */
const flowMode = (): FlowMode => { const s = settingsFor(wind); return s.flow ? 'flow' : s.arrows ? 'arrows' : 'off'; };
let mosaic: Mosaic | null = null;
/** How far beyond each screen edge the temperature fill reaches, as a share of the screen. */
const PAN_MARGIN = 0.35;
const fieldStore = new MemoryStore<GridField>(48);
let fillTimer = 0;
let mapReady = false;
// The avalanche layer's regions, report pins and panels (online only).
const avy = setupAvalanche(map, {
  theme: () => appSettings.theme(),
  settings: () => settingsFor(avalanche),
  onData: () => { renderReadout(); renderRunAge(); scrubber.refresh(); summaryWin.refresh(); },
  onLegend: () => { if (active.id === 'avalanche') renderLegend(); },
});
extraLegend = (doc) => avy.atesLegend(doc);
// The terrain ratings' quick switch: a round button with the thumb buttons,
// shown only while the avalanche layer is (no v8 design; the compass's shape).
// The same setting as the layer settings' switch.
atesThumb.className = 'thumb';
atesThumb.id = 'ates-toggle';
atesThumb.setAttribute('aria-label', 'Terrain complexity (ATES)');
atesThumb.innerHTML = ATES_ICON;
document.querySelector<HTMLElement>('.thumbs')!.prepend(atesThumb);
atesThumb.addEventListener('click', () => setLayerSetting(avalanche, 'ates', settingsFor(avalanche).ates !== true));
syncAtesThumb();
let fillSeq = 0;

function fieldKey(r: RunMetadata, t: Date, gridKey: string) {
  return `${r.model}|${r.referenceTime.toISOString()}|${t.toISOString()}|${gridKey}`;
}

type Box = [number, number, number, number];
const covers = (a: Box, b: Box) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/** A saved area's field for this run and step, if it has one (and covers `need`, when given). */
async function savedField(r: RunMetadata, t: Date, need: Box | null, overlap: Box): Promise<{ field: GridField; key: string } | null> {
  for (const a of savedParts) {
    if (a.weather.model !== r.model || new Date(a.weather.run).getTime() !== r.referenceTime.getTime()) continue;
    if (need ? !covers(a.bbox, need) : !areaOverlaps(a, overlap)) continue;
    if (!precip.needs.every((v) => a.weather.files[v])) continue; // saved without precipitation
    const w = await loadSavedWeather(a).catch(() => null);
    if (!w) continue;
    const i = w.times.findIndex((x) => x.getTime() === t.getTime());
    if (i < 0) continue;
    // Resampled from the saved model cells exactly as live fields are.
    const box = savedStep(w, i);
    const values = Object.fromEntries(precip.needs.map((v) => [v, regridNative(box, v, a.bbox, a.weather.nx, a.weather.ny)]));
    const field: GridField = {
      label: { source: a.weather.source, model: a.weather.model, run: new Date(a.weather.run), gridKm: MODELS[a.weather.model]?.gridKm ?? NaN, licence: '', attribution: '', fetchedAt: new Date(a.savedAt), offline: true },
      validTime: t, stepHours: a.weather.stepHours, bbox: a.bbox, nx: a.weather.nx, ny: a.weather.ny, values,
    };
    return { field, key: `saved:${a.id}` };
  }
  return null;
}

/** The one read path: memory, then a saved area that covers the view, then the network, then any saved area in view. */
async function getField(r: RunMetadata, t: Date, req: NonNullable<ReturnType<typeof gridRequest>>): Promise<{ field: GridField; key: string }> {
  const key = fieldKey(r, t, req.key);
  const hit = fieldStore.get(key);
  if (hit) return { field: hit, key: req.key };
  const saved = await savedField(r, t, req.bbox, req.bbox);
  if (saved) return saved;
  // Saved data only (no signal, or the switch): never wait on the network.
  if (usingSaved) {
    const partial = await savedField(r, t, null, req.bbox);
    if (partial) return partial;
    throw new Error('not saved for this view');
  }
  try {
    const f = await fetchGridField(r, t, precip.needs, req);
    fieldStore.put(key, f);
    return { field: f, key: req.key };
  } catch (err) {
    const partial = await savedField(r, t, null, req.bbox);
    if (partial) return partial;
    throw err;
  }
}

/** The temperature fill: profiles at a lattice of nodes, terrain per pixel on the GPU. */
async function updateTemperature(r: RunMetadata, t: Date, mine: number, cachedOnly = false) {
  const view = marginView();
  if (!view) { tempLayer.setProfiles(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const set = settingsFor(temperature);
  const feels = set.map === 'feels';
  // Feels-like on the map needs each node's 10 m wind, 2 m air and humidity (dew point).
  const extra = nodeNeeds(temperature, feels);
  const [m, grid] = await Promise.all([elevationMosaic(view, map.getZoom(), mosaic), profiles.nodeGrid(r, lattice, t, extra, { cachedOnly })]);
  if (mine !== fillSeq || active.id !== 'temperature') return;
  // Mid-drag with nothing in memory: keep the picture; the release fetches.
  if (!grid && cachedOnly) return;
  if (m !== mosaic) { mosaic = m; tempLayer.setElevation(m); }
  if (!grid) {
    tempLayer.setProfiles(null);
    setLine(null, '0c');
    unavailable('Temperature');
    return;
  }
  tempLayer.feels = feels;
  tempLayer.setProfiles(packLattice(grid));
  setLine(grid, set.freezingLine ? '0c' : null);
  document.body.dataset.fill = 'ready';
  // The next hour ahead of time (instant when the point API answered).
  const i = cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
  const next = cursor.allSteps[i + 1];
  const nextRun = next ? runAt(next, true) : null;
  if (next && nextRun) void profiles.nodeGrid(nextRun, lattice, next, extra).catch(() => undefined);
}

/** Nothing for the view because the forecast service said no for now: say so, and ask again when it may be asked. */
let apiRetryTimer = 0;
function unavailable(what: string) {
  const at = profiles.apiRetryAt;
  if (!at || usingSaved) { scrubber.setStatus(usingSaved ? `${what} is not saved for this area` : `${what} for this view is not available`); return; }
  scrubber.setStatus(`${what}: the forecast service is busy · trying again shortly`);
  clearTimeout(apiRetryTimer);
  apiRetryTimer = window.setTimeout(() => { scrubber.setStatus(''); void updateFills(); }, at - Date.now() + 500);
}

/** The model's ground under the mosaic, per mosaic and model grid (computed once each). */
let windGround: { key: string; data: Float32Array } | null = null;

/** The wind fill: profiles at a lattice of nodes, wind at the terrain per pixel on the GPU, and the flow over it. */
async function updateWind(r: RunMetadata, t: Date, mine: number, cachedOnly = false) {
  const view = marginView();
  if (!view) { windLayer.setProfiles(null); flow.setField(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const [m, grid] = await Promise.all([elevationMosaic(view, map.getZoom(), mosaic), profiles.nodeGrid(r, lattice, t, nodeNeeds(wind), { cachedOnly })]);
  if (mine !== fillSeq || active.id !== 'wind') return;
  if (!grid && cachedOnly) return;
  if (m !== mosaic) { mosaic = m; tempLayer.setElevation(m); }
  const profilesAt = grid ? nodeProfiles(grid) : null;
  if (!grid || !profilesAt || !windComplete(profilesAt)) {
    windLayer.setProfiles(null);
    flow.setField(null);
    unavailable('Wind');
    return;
  }
  const seg = segmentAt(timeline, t);
  const gridKm = (seg && REGISTRY[seg.model as ModelId]?.gridKm) || 2.5;
  const gkey = `${m.key}|${gridKm}`;
  if (windGround?.key !== gkey) windGround = { key: gkey, data: modelGround(m, gridKm) };
  windLayer.setElevation(m, windGround.data, gkey);
  windLayer.gusts = settingsFor(wind).map === 'gusts';
  windLayer.setProfiles(packWind(grid, profilesAt));
  document.body.dataset.fill = 'ready';
  // The flow and In view need the wind on screen: not while dragging (the release does it).
  if (!cachedOnly) {
    const c = map.getCanvas();
    const w = c.clientWidth, h = c.clientHeight;
    const sw = screenWind(grid, profilesAt, m, windGround.data, w, h, (x, y) => map.unproject([x, y]));
    flow.setField(sw.field);
    view_ = { cells: sw.cells.map((x) => ({ lon: x.lon, lat: x.lat, value: x.gust, second: x.dir })) };
    scheduleDetails();
  }
  const i = cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
  const next = cursor.allSteps[i + 1];
  const nextRun = next ? runAt(next, true) : null;
  if (next && nextRun) void profiles.nodeGrid(nextRun, lattice, next, nodeNeeds(wind)).catch(() => undefined);
}

/** The lattice of profile nodes over the screen plus the panning margin, and the box it covers. */
function marginView(): Box | null {
  const b = map.getBounds();
  const padX = (b.getEast() - b.getWest()) * PAN_MARGIN;
  const padY = (b.getNorth() - b.getSouth()) * PAN_MARGIN;
  const view: Box = [Math.max(BC_BOX[0], b.getWest() - padX), Math.max(BC_BOX[1], b.getSouth() - padY), Math.min(BC_BOX[2], b.getEast() + padX), Math.min(BC_BOX[3], b.getNorth() + padY)];
  if (view[0] >= view[2] || view[1] >= view[3]) return null;
  // With saved data only, the fill covers the saved area in view (its nodes
  // must fall inside it, so the lattice is laid over the area, not the screen).
  if (usingSaved) {
    const overlap = (a: SavedArea): Box => [Math.max(a.bbox[0], view[0]), Math.max(a.bbox[1], view[1]), Math.min(a.bbox[2], view[2]), Math.min(a.bbox[3], view[3])];
    const size = (x: Box) => Math.max(0, x[2] - x[0]) * Math.max(0, x[3] - x[1]);
    const best = savedAreas.map(overlap).sort((x, y) => size(y) - size(x))[0];
    return best && size(best) > 0 ? best : null;
  }
  return view;
}

/**
 * Precipitation on the terrain: rain or snow at each spot from the wet-bulb at
 * its real height (the same rule as the snow line, so line and colours agree),
 * and the line chosen in settings. Needs humidity at the nodes; without it the
 * colours keep the model's own split.
 */
async function updatePrecipLine(r: RunMetadata, t: Date, mine: number, cachedOnly = false) {
  const kind = settingsFor(precipitation).line as string;
  const view = marginView();
  if (!view) { setLine(null, null); precipLayer.setShare(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const [m, grid] = await Promise.all([elevationMosaic(view, map.getZoom(), mosaic), profiles.nodeGrid(r, lattice, t, nodeNeeds(precipitation), { cachedOnly })]);
  if (mine !== fillSeq || active.id !== 'precipitation') return;
  if (!grid && cachedOnly) return;
  if (!grid && profiles.apiRetryAt) { clearTimeout(apiRetryTimer); apiRetryTimer = window.setTimeout(() => void updateFills(), profiles.apiRetryAt - Date.now() + 500); }
  if (m !== mosaic) { mosaic = m; tempLayer.setElevation(m); }
  const res = setLine(grid, kind === 'off' ? null : kind === 'wetbulb' ? 'wetbulb' : '0c');
  precipLayer.setShare(res?.share ?? null);
  // In view: type each on-screen cell by the same field.
  if (res?.share) {
    const sh = res.share;
    const pick = (lon: number, lat: number) => {
      const x = (lon + 180) / 360;
      const y = (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
      const c = Math.floor(((x - sh.merc[0]) / (sh.merc[2] - sh.merc[0])) * sh.width);
      const rr = Math.floor(((y - sh.merc[1]) / (sh.merc[3] - sh.merc[1])) * sh.height);
      return c >= 0 && rr >= 0 && c < sh.width && rr < sh.height ? sh.data[rr * sh.width + c]! : null;
    };
    view_.cells = view_.cells.map((cell) => { const f = pick(cell.lon, cell.lat); return f === null ? cell : { ...cell, second: cell.value * f }; });
    scheduleDetails();
  }
}

function packLattice(grid: NodeData) {
  const nl = PROFILE_LEVELS.length;
  const row = nl + 1;
  const data = new Float32Array(grid.profiles.length * row * 2);
  grid.profiles.forEach((p, n) => {
    for (let k = 0; k < nl; k++) { data[(n * row + k) * 2] = p.gh[k]!; data[(n * row + k) * 2 + 1] = p.temp[k]!; }
    // Last texel: 10 m wind and dew point, for the feels-like map.
    const v = grid.values[n] ?? {};
    const t2 = v.temperature_2m, rh = v.relative_humidity_2m;
    data[(n * row + nl) * 2] = v.wind_speed_10m ?? 0;
    data[(n * row + nl) * 2 + 1] = t2 !== undefined && rh !== undefined ? dewPoint(t2, rh) : -50;
  });
  return { lons: grid.lons, lats: grid.lats, levels: nl, data };
}

/** What the map holds now, for the In view line. */
let view_: { cells: ViewSample['cells']; freezing?: [number, number] | undefined } = { cells: [] };

/** A dashed line from the node profiles over the terrain (0 °C, or the snow line), labelled with its height. */
function setLine(grid: NodeData | null, kind: LineKind | null) {
  const src = map.getSource('freezing-line') as maplibregl.GeoJSONSource | undefined;
  const empty = { type: 'FeatureCollection' as const, features: [] };
  if (!grid || !mosaic) { src?.setData(empty); return null; }
  const res = levelLine(grid, mosaic, kind ?? '0c');
  src?.setData(kind ? res.features : empty);
  // In view: only what is on screen, not the panning margin.
  const b = map.getBounds();
  const onScreen = (c: { lon: number; lat: number }) => c.lon >= b.getWest() && c.lon <= b.getEast() && c.lat >= b.getSouth() && c.lat <= b.getNorth();
  const fl = grid.profiles.map((p) => freezingLevel(p)).filter((x): x is number => x !== null);
  view_ = {
    cells: active.id === 'temperature' ? res.cells.filter(onScreen) : view_.cells,
    freezing: fl.length ? [Math.min(...fl), Math.max(...fl)] : undefined,
  };
  scheduleDetails();
  return res;
}

/**
 * `moving`: called during a drag. Profile nodes then come from memory only, so
 * a long pan does not fire request after request at the point API (it has a
 * per-minute limit); the release fetches what is new.
 */
async function updateFills(moving = false) {
  if (!mapReady) return;
  if (active.frames) {
    // Radar alone fills the map: the forecast fills step aside (and any still on their way are dropped).
    ++fillSeq;
    precipLayer.setFields([]);
    precipLayer.setShare(null);
    tempLayer.visible = false;
    windLayer.visible = false;
    windLayer.setProfiles(null);
    flow.setShown(false);
    flow.setField(null);
    setLine(null, null);
    showRadarFrame();
    return;
  }
  radarImages.show(null);
  radarImages.setCoverage(null);
  // Avalanche: issued bulletins, not model grids; the weather fills step aside.
  avy.update(active.id === 'avalanche', cursor.time ?? new Date());
  if (active.id === 'avalanche') {
    flow.setShown(false);
    windLayer.visible = false;
    windLayer.setProfiles(null);
    tempLayer.visible = false;
    precipLayer.setFields([]);
    setLine(null, null);
    return;
  }
  if (!cursor.time) return;
  const when = mapTime(cursor.time);
  const at = runAt(when);
  if (!at) return;
  flow.setShown(active.id === 'wind' && threeD.flat());
  windLayer.visible = active.id === 'wind';
  if (active.id === 'wind') {
    precipLayer.setFields([]);
    tempLayer.visible = false;
    setLine(null, null);
    flow.setMode(flowMode());
    await updateWind(at, when, ++fillSeq, moving).catch((err) => console.error(err));
    return;
  }
  windLayer.setProfiles(null);
  if (active.id === 'temperature') {
    precipLayer.setFields([]);
    tempLayer.visible = true;
    await updateTemperature(at, when, ++fillSeq, moving).catch((err) => console.error(err));
    return;
  }
  tempLayer.visible = false;
  const b = map.getBounds();
  const req = gridRequest([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom(), BC_BOX);
  if (!req) { precipLayer.setFields([]); return; }
  const r = at;
  const t = when;
  const mine = ++fillSeq;
  try {
    const f = await getField(r, t, req);
    if (mine !== fillSeq) return;
    precipLayer.setFields([precip.precipDrawField(f.field, f.key)]);
    document.body.dataset.fill = 'ready';
    // In view: the rates on screen, heaviest first.
    const field = f.field;
    const cells: ViewSample['cells'] = [];
    const rate = field.values.precipitation, swe = field.values.snowfall_water_equivalent;
    for (let j = 0; j < field.ny; j += 1) {
      const lat = field.bbox[1] + ((j + 0.5) / field.ny) * (field.bbox[3] - field.bbox[1]);
      if (lat < b.getSouth() || lat > b.getNorth()) continue;
      for (let k = 0; k < field.nx; k += 1) {
        const lon = field.bbox[0] + ((k + 0.5) / field.nx) * (field.bbox[2] - field.bbox[0]);
        if (lon < b.getWest() || lon > b.getEast()) continue;
        cells.push({ lon, lat, value: (rate?.[j * field.nx + k] ?? 0) / field.stepHours, second: (swe?.[j * field.nx + k] ?? 0) / field.stepHours });
      }
    }
    view_ = { ...view_, cells };
    scheduleDetails();
    void updatePrecipLine(r, t, mine, moving).catch((err) => console.error(err));
    // Fetch the next step ahead of time, so playing and scrubbing stay smooth.
    const i = cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
    const next = cursor.allSteps[i + 1];
    const nextRun = next ? runAt(next, false) : null;
    if (next && nextRun) void getField(nextRun, next, req).catch(() => undefined);
  } catch (err) {
    console.error(err);
  }
}
const scheduleFills = (ms: number) => { clearTimeout(fillTimer); fillTimer = window.setTimeout(() => void updateFills(), ms); };
map.on('moveend', () => { flow.setMoving(false); scheduleFills(150); });
map.on('movestart', () => flow.setMoving(true));
// During a long pan, refresh about twice a second rather than only on release.
let lastMoveFill = 0;
let moveFilling = false;
map.on('move', () => {
  const now = performance.now();
  if (moveFilling || now - lastMoveFill < 500) return;
  lastMoveFill = now;
  moveFilling = true;
  void updateFills(true).finally(() => { moveFilling = false; });
});

cursor.subscribe(() => {
  renderReadout();
  renderRunAge();
  scheduleFills(60);
  scheduleDetails();
  scheduleRadarPin();
});

/**
 * The runs a saved area holds, by model, for use without signal: the area
 * the pin is in (else the newest saved), its first model and any later ones.
 */
function savedRuns(): Partial<Record<ModelId, RunMetadata>> {
  const p = pin?.get();
  const inPin = p ? savedAreas.filter((a) => areaContains(a, p.lng, p.lat)) : [];
  const a = [...(inPin.length ? inPin : savedAreas)].sort((x, y) => y.savedAt.localeCompare(x.savedAt))[0];
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
async function sharedRun(latest: RunMetadata): Promise<RunMetadata> {
  const api = await Promise.race([
    fetchApiRun(latest.model).catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), 4000)),
  ]);
  if (!api || api.getTime() >= latest.referenceTime.getTime()) return latest;
  const shift = latest.referenceTime.getTime() - api.getTime();
  return { ...latest, referenceTime: api, validTimes: latest.validTimes.map((t) => new Date(t.getTime() - shift)) };
}

/** Every model's newest run, in parallel. HRDPS follows the point API's run (see sharedRun). */
async function fetchAllRuns() {
  const ids = Object.keys(REGISTRY) as ModelId[];
  const got = await Promise.all(ids.map(async (m) => {
    const spec = REGISTRY[m];
    try {
      const latest = await fetchRunMetadata(spec.mapModel);
      const surface = m === 'hrdps' ? await sharedRun(latest) : latest;
      const prof = spec.profileMapModel ? await fetchRunMetadata(spec.profileMapModel).catch(() => null) : null;
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

const runsKey = (r: Partial<Record<ModelId, RunMetadata>>) => Object.entries(r).map(([k, v]) => `${k}:${v!.referenceTime.toISOString()}`).sort().join('|');

async function loadRun() {
  // "Saved data only": no network at all while a saved area exists.
  const savedOnly = savedOnlyActive();
  const next = savedOnly ? { surface: {}, profile: {} } : await fetchAllRuns().catch(() => ({ surface: {}, profile: {} }));
  if (Object.keys(next.surface).length) {
    const changed = usingSaved || runsKey(next.surface) !== runsKey(runs) || runsKey(next.profile) !== runsKey(profileRuns);
    usingSaved = false;
    runs = next.surface;
    profileRuns = next.profile;
    if (changed) {
      rebuildTimeline();
      void updateFills();
      void loadSeries();
      void loadSummarySeries();
    }
    renderRunAge();
    document.body.dataset.run = 'ready';
    return;
  }
  // No signal (or saved data only): a saved area's runs.
  const savedSet = savedRuns();
  const saved = savedSet.hrdps ?? Object.values(savedSet)[0];
  if (saved) {
    const changed = !usingSaved || runsKey(savedSet) !== runsKey(runs);
    runs = savedSet;
    profileRuns = {};
    usingSaved = true;
    if (changed) {
      rebuildTimeline();
      void updateFills();
      void loadSeries();
      void loadSummarySeries();
    }
    renderRunAge();
    document.body.dataset.run = 'saved';
    return;
  }
  document.body.dataset.run = 'error';
  if (active.frames) { renderRunAge(); return; }
  $('run-age').textContent = 'Weather unavailable · tap to retry';
  scrubber.setStatus('Could not reach the weather data');
}

let seriesSeq = 0;
/** Asking again for parts of the pin's series that did not come (service busy, connection dropped). */
let seriesRetry = { timer: 0, key: '', tries: 0 };
function retrySeries(key: string) {
  if (seriesRetry.key !== key) seriesRetry = { timer: 0, key, tries: 0 };
  clearTimeout(seriesRetry.timer);
  // Soon at first, then less often; when the service gave a time, then.
  const backoff = Math.min(60_000, 3_000 * 2 ** seriesRetry.tries++);
  const delay = Math.max(backoff, profiles.apiRetryAt - Date.now() + 500);
  seriesRetry.timer = window.setTimeout(() => void loadSeries(), delay);
}

/** One model's part of the pin's series, for the active layer. */
async function modelSeries(layer: LayerSlots, m: ModelId, first: boolean, lat: number, lng: number, onPartial?: (s: PointSeries) => void, onLater?: (s: PointSeries) => void): Promise<PointSeries> {
  const spec = REGISTRY[m];
  const r = (usesProfile(layer) ? profileRuns[m] : undefined) ?? runs[m]!;
  const amounts = layer.pinNeeds.some(isAmount);
  const past = first && !usingSaved ? PAST_HOURS : 0;
  const extra = PIN_EXTRA;
  if (m === 'hrdps' && !usingSaved) {
    // One request for every layer: profile, wind, surface values and the
    // amounts, past hours included. Its amounts are the map files' own
    // numbers (the same model cell; checked hour by hour Nov 17), so the map,
    // the pin and saved areas still agree.
    try {
      return await profiles.pinSeries(r, lat, lng, onPartial, { amounts: true, pastHours: past, extra, noFiles: true });
    } catch (err) {
      console.warn('point API unavailable for the pin; reading the map files', err);
    }
  }
  if (m === 'hrdps' && amounts) {
    // Without the point API (or offline): amounts from the map files or the
    // saved area; the profile joins when it comes, which can take minutes
    // read from the files hour by hour.
    const own = (usingSaved ? await savedSeries(r, lat, lng) : null) ?? (usingSaved ? null : await fetchPointSeries(r, precip.needs, lat, lng));
    if (!own) throw new Error('the pin is outside the saved areas');
    const profP = profiles.pinSeries(r, lat, lng, undefined, { amounts: past > 0, pastHours: past, extra }).catch((err) => { console.warn('no profile for the pin', err); return null; });
    const quick = await Promise.race([profP, new Promise<null>((res) => setTimeout(() => res(null), 5000))]);
    if (quick) return overlay(quick, own);
    void profP.then((prof) => { if (prof) onLater?.(overlay(prof, own)); });
    return own;
  }
  // Hour by hour from the map files (minutes) only when the service is out for long (its hourly or daily limit).
  if (m === 'hrdps') return profiles.pinSeries(r, lat, lng, onPartial, { amounts, profile: spec.profile, pastHours: past, extra, noFiles: !profiles.apiLongDown });
  // Longer models: the point API gives every hour in one request. Without it,
  // precipitation reads its amounts from the model's map files (the profile,
  // hour by hour over days, would be too slow; rain or snow then uses the
  // model's own split).
  try {
    // Never days of map files hour by hour (that takes many minutes): without
    // the service, profiles wait for it (the series asks again); amounts read their own files.
    return await profiles.pinSeries(r, lat, lng, onPartial, { amounts, profile: spec.profile, pastHours: past, noFiles: true, extra });
  } catch (err) {
    if (!amounts || usingSaved) throw err;
    return fetchPointSeries(runs[m]!, precip.needs, lat, lng);
  }
}

/** `base` with `top`'s values wherever `top` has that time (same place). */
function overlay(base: PointSeries, top: PointSeries): PointSeries {
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
function stitch(parts: (PointSeries | null)[]): PointSeries | null {
  const firstPart = parts[0];
  if (!firstPart || !timeline.segments.length) return firstPart ?? null;
  const times: Date[] = [];
  const pick: { part: PointSeries; i: number }[] = [];
  const segments: NonNullable<PointSeries['segments']> = [];
  let prev = -Infinity;
  timeline.segments.forEach((seg, k) => {
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

async function loadSeries() {
  // Radar has no forecast at the pin: drop any series still on its way.
  if (active.frames) { ++seriesSeq; scrubber.setStatus(''); return; }
  const p = pin.get();
  if (!run || !p || !timeline.segments.length) return;
  void loadObserved();
  void loadPinGround();
  const layer = active;
  const tlKey = timeline.segments.map((x) => `${x.model}@${x.run.toISOString()}`).join(',');
  const key = `${layer.id}|${tlKey}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${usingSaved}`;
  const cached = store.get(key);
  const mine = ++seriesSeq;
  if (cached) {
    series = cached;
    document.body.dataset.seriesComplete = 'true';
  } else {
    document.body.dataset.seriesComplete = 'false';
    // Asking again for missing stretches: keep showing what is there meanwhile.
    if (!(seriesRetry.key === key && series)) {
      series = null;
      scrubber.setStatus('Loading the pin’s forecast…');
      renderReadout();
    }
    const segs = timeline.segments;
    const parts: (PointSeries | null)[] = segs.map(() => null);
    // The first model first, so the readout comes quickly; the rest join it.
    try {
      const update = (part: PointSeries) => {
        if (mine !== seriesSeq) return;
        parts[0] = part;
        series = stitch(parts);
        renderReadout();
        scrubber.refresh();
      };
      parts[0] = await modelSeries(layer, segs[0]!.model as ModelId, true, p.lat, p.lng, update, update);
    } catch (err) {
      if (mine !== seriesSeq) return;
      console.error(err);
      if (usingSaved) { scrubber.setStatus('The pin is outside the saved area'); return; }
      scrubber.setStatus('The forecast service is busy · trying again shortly');
      retrySeries(key);
      return;
    }
    if (mine !== seriesSeq) return;
    series = stitch(parts);
    scrubber.setStatus('');
    renderReadout();
    scrubber.refresh();
    document.body.dataset.series = 'ready';
    await Promise.all(segs.slice(1).map(async (seg, k) => {
      parts[k + 1] = await modelSeries(layer, seg.model as ModelId, false, p.lat, p.lng).catch((err) => { console.warn(`no ${seg.model} series for the pin`, err); return null; });
    }));
    if (mine !== seriesSeq) return;
    series = stitch(parts);
    // Kept only when whole: a stretch that did not come is asked for again
    // (parts already read come from memory), never remembered as missing.
    document.body.dataset.seriesComplete = String(parts.every(Boolean));
    if (parts.every(Boolean)) { if (series) store.put(key, series); clearTimeout(seriesRetry.timer); seriesRetry = { timer: 0, key: '', tries: 0 }; }
    else if (!usingSaved) retrySeries(key);
  }
  scrubber.setStatus('');
  renderReadout();
  scrubber.refresh();
  document.body.dataset.series = 'ready';
}

/** The pin's series from a saved area's grids (same run), for use without signal. */
async function savedSeries(r: RunMetadata, lat: number, lng: number): Promise<PointSeries | null> {
  for (const a of savedParts) {
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
setInterval(() => { if (document.visibilityState === 'visible') renderRunAge(); }, 60_000);
// A new run can land while the app stays open: look every 10 minutes while it is on screen.
setInterval(() => { if (document.visibilityState === 'visible' && !usingSaved) void loadRun(); }, 10 * 60_000);
// Radar: ECCC adds a frame every 6 minutes; ask again once one is due, while it is on screen.
setInterval(() => { if (document.visibilityState === 'visible' && active.frames) { void loadRadarFrames(); renderRunAge(); scrubber.refresh(); } }, 60_000);
addEventListener('online', () => void loadRadarFrames(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderRunAge(); void loadRun(); } });

// Pin
const renderPlace = (p: PinState) => {
  setAvalanchePin(p.lng, p.lat);
  const label = pinLabel(p).long;
  const text = p.elevation === null ? label : `${label} · ${formatElevation(p.elevation)}`;
  $('place-text').textContent = text;
  $('place-line').setAttribute('aria-label', `Centre the map on ${label}`);
  $('subject-place').textContent = text;
  document.body.dataset.pin = p.elevation === null ? 'pending' : 'ready';
  // Temperature is read at the pin's ground height: refresh once it is known.
  renderReadout();
  scrubber.refresh();
  summaryWin.refresh();
  // A new place: fetch its series once the pin settles.
  const where = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  if (where !== lastPlace) {
    lastPlace = where;
    alertsAt(p.lat, p.lng);
    scheduleRadarPin();
    clearTimeout(seriesTimer);
    seriesTimer = window.setTimeout(() => void loadSeries(), 250);
  }
};
let lastPlace = '';
let seriesTimer = 0;
const pin: ReturnType<typeof createPin> = createPin(map, renderPlace);
const rememberPin = (p: { lng: number; lat: number; name: string | null }) => {
  prefs.lastPin = { lng: p.lng, lat: p.lat, label: p.name ?? '' };
  savePrefs(prefs);
};

// ---- Forecast summary window (app/summary; no v8 design) -------------------
// Every chosen layer's chart for the pin, stacked on the app's one time line.
// Opens with press-and-hold on the map (or a right click) and from the details.
// Loads only while open, through the same read path as the sheet.
let summarySeries: PointSeries | null = null;
let summaryState: 'loading' | 'ready' | 'busy' | 'outside' = 'loading';
let summaryFor = '';
let summarySeq = 0;
const summaryRetry = { timer: 0, tries: 0 };
const summaryShown = () => includedLayers(LAYERS, prefs.summaryLayers);
const summaryWants = (l: LayerSlots) => summaryWin.isOpen() && summaryShown().includes(l);

/**
 * The pin's series for every strip at once: one request a model carrying what
 * they all need, read as the precipitation layer reads (surface runs, amounts
 * included). The HRDPS part is the very request the sheet makes, so it comes
 * from memory or the phone's cache, not the network.
 */
async function loadSummarySeries() {
  if (!summaryWin.isOpen()) return;
  const shown = summaryShown();
  if (shown.includes(avalanche)) avy.load();
  if (!needsSeries(shown)) { summaryWin.refresh(); return; }
  const p = pin.get();
  if (!run || !p || !timeline.segments.length) return; // loadRun asks again once the run is in
  void loadObserved();
  void loadPinGround();
  const union: LayerSlots = { ...precipitation, id: 'summary', pinNeeds: unionNeeds(shown).variables };
  const tlKey = timeline.segments.map((x) => `${x.model}@${x.run.toISOString()}`).join(',');
  const key = `summary|${union.pinNeeds.join(',')}|${tlKey}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${usingSaved}`;
  const mine = ++summarySeq;
  clearTimeout(summaryRetry.timer);
  const cached = store.get(key);
  if (cached) { summarySeries = cached; summaryFor = key; summaryState = 'ready'; summaryWin.refresh(); return; }
  if (summaryFor !== key) { summarySeries = null; summaryFor = key; summaryState = 'loading'; summaryWin.refresh(); }
  const segs = timeline.segments;
  const parts: (PointSeries | null)[] = segs.map(() => null);
  const update = (part: PointSeries) => {
    if (mine !== summarySeq) return;
    parts[0] = part;
    summarySeries = stitch(parts);
    summaryState = 'ready';
    summaryWin.refresh();
  };
  try {
    parts[0] = await modelSeries(union, segs[0]!.model as ModelId, true, p.lat, p.lng, update, update);
  } catch (err) {
    if (mine !== summarySeq) return;
    console.warn('no series for the forecast summary', err);
    summaryState = usingSaved ? 'outside' : 'busy';
    summaryWin.refresh();
    if (!usingSaved) retrySummary();
    return;
  }
  if (mine !== summarySeq) return;
  summarySeries = stitch(parts);
  summaryState = 'ready';
  summaryWin.refresh();
  await Promise.all(segs.slice(1).map(async (seg, k) => {
    parts[k + 1] = await modelSeries(union, seg.model as ModelId, false, p.lat, p.lng).catch((err) => { console.warn(`no ${seg.model} series for the summary`, err); return null; });
  }));
  if (mine !== summarySeq) return;
  summarySeries = stitch(parts);
  // Kept only when whole; a stretch that did not come is asked for again while the window is open.
  if (parts.every(Boolean)) { if (summarySeries) store.put(key, summarySeries); summaryRetry.tries = 0; }
  else if (!usingSaved) retrySummary();
  summaryWin.refresh();
}
function retrySummary() {
  clearTimeout(summaryRetry.timer);
  const delay = Math.max(Math.min(60_000, 3_000 * 2 ** summaryRetry.tries++), profiles.apiRetryAt - Date.now() + 500);
  summaryRetry.timer = window.setTimeout(() => void loadSummarySeries(), delay);
}

const summaryWin = setupSummaryWindow({
  cursor,
  layers: () => LAYERS,
  choice: () => prefs.summaryLayers,
  setChoice: (c) => { prefs.summaryLayers = c; savePrefs(prefs); },
  windowHours: () => scrubber.chosenHours,
  setWindowHours: (h) => scrubber.setWindowHours(h),
  pinData: () => ({ series: summarySeries, elevation: pin.get()?.elevation ?? null, observed, ground: pinGround.values }),
  index: () => { const t = cursor.time; return summarySeries && t ? summarySeries.times.findIndex((x) => x.getTime() === t.getTime()) : -1; },
  settingsFor,
  status: (l) => {
    if (!l.pinNeeds.length) return '';
    if (!run && document.body.dataset.run === 'error') return 'Could not reach the weather data';
    if (summaryState === 'outside') return 'The pin is outside the saved areas';
    if (!summarySeries) return summaryState === 'busy' ? 'The forecast service is busy · trying again shortly' : 'Loading the pin’s forecast…';
    const values = summarySeries.values;
    if (l.pinNeeds.some((v) => values[v]?.some(Number.isFinite))) return '';
    return usingSaved ? `${l.title} is not saved for this area` : `No ${l.title.toLowerCase()} data at the pin`;
  },
  place: () => $('place-text').textContent ?? '',
  footer: () => {
    const now = new Date();
    const shown = summaryShown();
    const lines: { text: string; stale: boolean }[] = [];
    if (needsSeries(shown) && run) {
      const labels = [...new Set(timeline.segments.map((x) => REGISTRY[x.model as ModelId]?.label ?? x.model))];
      const later = labels.slice(1);
      lines.push({
        text: `${labels[0] ?? ''} · ${formatRunAge(run.referenceTime, now)}${usingSaved ? ' · saved' : ''}${later.length ? ` · then ${later.join(', ')}` : ''}`,
        stale: runAgeHours(run.referenceTime, now) >= 12 || timeline.missing.length > 0,
      });
    }
    const p = pin.get();
    if (p && shown.includes(avalanche)) lines.push(avy.ageLine(p.lng, p.lat));
    return lines;
  },
  note: () => (active.frames ? `Radar is on the map, so time moves only through its last ${active.frames.windowHours} hours. Choose another layer to move through the forecast.` : null),
  load: () => void loadSummarySeries(),
});
// Press-and-hold (or a right click): the pin moves there, as a tap moves it, and the window grows from it.
const longPress = setupLongPress(map, (pt) => {
  const at = map.unproject([pt.x, pt.y]);
  const name = nameNear(map, pt);
  pin.set({ lng: at.lng, lat: at.lat, kind: 'dropped', name });
  rememberPin({ lng: at.lng, lat: at.lat, name });
  const r = map.getContainer().getBoundingClientRect();
  summaryWin.openAt(r.left + pt.x, r.top + pt.y);
});

function startFromLastOrDefault() {
  if (prefs.lastPin) {
    pin.set({ lng: prefs.lastPin.lng, lat: prefs.lastPin.lat, kind: 'last', name: prefs.lastPin.label || null });
  } else {
    pin.set({ lng: NORTH_SHORE[0], lat: NORTH_SHORE[1], kind: 'dropped', name: null });
  }
}

const locateBtn = $('locate');
function locate(fly: boolean) {
  if (!('geolocation' in navigator)) { if (!pin.get()) startFromLastOrDefault(); return; }
  locateBtn.dataset.busy = 'true';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      delete locateBtn.dataset.busy;
      const { longitude: lng, latitude: lat } = pos.coords;
      pin.set({ lng, lat, kind: 'you', name: null });
      rememberPin({ lng, lat, name: null });
      if (fly) map.easeTo({ center: [lng, lat] as LngLatLike, zoom: Math.max(map.getZoom(), 11), duration: 600 });
      else map.jumpTo({ center: [lng, lat] });
    },
    () => {
      delete locateBtn.dataset.busy;
      if (!pin.get()) startFromLastOrDefault();
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  );
}
locateBtn.addEventListener('click', () => locate(true));

$('place-line').addEventListener('click', () => {
  const p = pin.get();
  if (p) map.easeTo({ center: [p.lng, p.lat], duration: 500 });
});

map.on('click', (e) => {
  // The lift that ends a press-and-hold is not a tap (the summary window is opening).
  if (longPress.consumeClick()) return;
  // A tap on a weather station opens it; the pin stays.
  if (stations.hit(e.originalEvent.target)) return;
  const name = nameNear(map, e.point);
  pin.set({ lng: e.lngLat.lng, lat: e.lngLat.lat, kind: 'dropped', name });
  rememberPin({ lng: e.lngLat.lng, lat: e.lngLat.lat, name });
  // Avalanche: the tapped region's forecast opens, as on Avalanche Canada's map.
  if (active.id === 'avalanche') avy.tapped(e.point, e.lngLat);
});

// Search: a chosen place moves the pin as a tap would, named, and the map flies there.
setupSearch($('search-button') as HTMLButtonElement, {
  choose: (place) => {
    pin.set({ lng: place.lon, lat: place.lat, kind: 'dropped', name: place.name });
    rememberPin({ lng: place.lon, lat: place.lat, name: place.name });
    map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 12), duration: 900 });
  },
  near: () => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; },
});

// Sheet: the details are drawn when it is pulled up, and kept fresh while it is.
sheetCtl = setupSheet(sheetEl, $('sheet-handle'), (st) => { if (st === 'up') renderDetails(); });

// Point details (v8 06/07, 15/16, 20/21): the subject, the layer's cards in the
// standard order, In view, and the footer with Layer settings.
let detailsFrame = 0;
const openExpandables = new Set<string>();
function scheduleDetails() {
  if (detailsFrame || sheetCtl?.get() !== 'up') return;
  detailsFrame = requestAnimationFrame(() => { detailsFrame = 0; renderDetails(); });
}
function renderDetails() {
  const box = document.querySelector<HTMLElement>('.details');
  const t = cursor.time;
  const p = pin?.get();
  if (!box || !t || !p) return;
  const bands = bandsAt(p.lat, p.lng);
  const { start, end } = windowRange(t, scrubber.windowHours);
  const ctx: DetailContext = { pin: pinData(), index: seriesIndex(), cursor: t, start, end, now: new Date(), bands, settings: settingsFor(active) };
  const nodes: HTMLElement[] = [$('subject')];
  for (const c of active.details(ctx)) {
    const el = renderCard(c, bands, start, end);
    if (c.kind === 'expandable') {
      const d = el as HTMLDetailsElement;
      d.open = openExpandables.has(c.title);
      d.addEventListener('toggle', () => { if (d.open) openExpandables.add(c.title); else openExpandables.delete(c.title); });
    }
    nodes.push(el);
  }
  const line = active.inView({ ...view_, nameAt: (lon, lat) => nameNear(map, map.project([lon, lat]), 60) }, ctx);
  if (line) { const iv = document.createElement('div'); iv.className = 'in-view'; iv.textContent = line; nodes.push(iv); }
  // Footer: model, run and its age, elevation used, method; Layer settings on the right.
  const foot = document.createElement('div');
  foot.className = 'details-footer';
  const lines = document.createElement('div');
  lines.className = 'footer-lines';
  const runText = run ? formatRunAge(run.referenceTime, new Date()).replace(' · ', ', ') + (usingSaved ? ', saved' : '') : '';
  const model = run ? MODELS[run.model]?.label ?? run.model : '';
  const elev = p.elevation === null ? '' : ` · ${formatElevation(p.elevation)}`;
  const extra = active.footer(ctx);
  // A layer's own first line (precipitation: the snow ratio) sits above the model line.
  const own = active.id === 'precipitation' ? extra : [];
  const after = active.id === 'precipitation' ? [] : extra;
  // Radar is observed and an avalanche bulletin is issued: their own lines only (no model, run or bands of the app's).
  const footLines = active.frames || active.id === 'avalanche' ? extra : [...own, `${model} · ${runText}${elev}`, ...after, `Elevation bands approximate (${bands.region})`];
  for (const text of footLines) {
    const l = document.createElement('span');
    l.textContent = text;
    lines.append(l);
  }
  const btn = document.createElement('button');
  btn.className = 'secondary-button';
  btn.id = 'layer-settings';
  btn.innerHTML = `${icons.gear}<span>Layer settings</span>`;
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.addEventListener('click', () => openLayerSettings(btn));
  foot.append(lines, btn);
  // The forecast summary window: every chosen layer at the pin (also press-and-hold on the map).
  const full = document.createElement('button');
  full.className = 'secondary-button summary-open';
  full.id = 'summary-open';
  full.setAttribute('aria-haspopup', 'dialog');
  full.innerHTML = `${icons['pin-small']}<span>Forecast summary for this point</span>`;
  full.addEventListener('click', () => summaryWin.openFrom(full));
  nodes.push(foot, full);
  box.replaceChildren(...nodes);
  document.body.dataset.details = 'ready';
}

/** Change one of a layer's settings (remembered between sessions) and redraw what depends on it. */
function setLayerSetting(layer: LayerSlots, key: string, v: string | boolean) {
  prefs.layerSettings[layer.id] = { ...(prefs.layerSettings[layer.id] ?? {}), [key]: v };
  savePrefs(prefs);
  if (layer.id === 'precipitation' && key === 'type') precipLayer.setStyle(precip.precipRenderStyle(v as 'all' | 'rain' | 'snow'));
  // Radar: another product has its own frames and legend.
  if (layer.id === radar.id && key === 'shown') { showLayer(); void loadRadarFrames(true); }
  renderReadout();
  scrubber.refresh();
  renderDetails();
  void updateFills();
  if (layer.id === 'avalanche') { syncAtesThumb(); renderLegend(); }
}

/** The active layer's settings panel (v8 17-PrecipSettings, 22-TempSettings), remembered between sessions. */
function openLayerSettings(origin: HTMLElement) {
  if (isOpenFrom(origin)) { closePanel(); return; }
  const layer = active;
  const values = settingsFor(layer);
  const body = document.createElement('div');
  body.className = 'panel-groups';
  const change = (key: string, v: string | boolean) => setLayerSetting(layer, key, v);
  for (const st of layer.settings) {
    if (st.kind === 'segmented') {
      const g = document.createElement('div');
      g.className = 'group';
      const title = document.createElement('span');
      title.className = 'group-title';
      title.textContent = st.title;
      const seg = document.createElement('div');
      seg.className = 'segmented';
      for (const o of st.options) {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.setAttribute('aria-pressed', String(values[st.key] === o.value));
        b.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          change(st.key, o.value);
        });
        seg.append(b);
      }
      g.append(title, seg);
      body.append(g);
    } else {
      const row = document.createElement('button');
      row.className = 'switch-row';
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', String(values[st.key] === true));
      row.innerHTML = '<span class="switch-label"></span><span class="switch" aria-hidden="true"><span></span></span>';
      row.querySelector('.switch-label')!.textContent = st.title;
      row.addEventListener('click', () => {
        const next = row.getAttribute('aria-checked') !== 'true';
        row.setAttribute('aria-checked', String(next));
        change(st.key, next);
      });
      body.append(row);
    }
  }
  const note = document.createElement('p');
  note.className = 'panel-note';
  note.textContent = layer.settingsNote;
  body.append(note);
  openPanel({ origin, icon: icons.gear, title: `${layer.title} settings`, caption: 'Remembered on this phone', body });
}

// Layer menu (03-LayerMenu): grows from the layer name; built layers only.
const layerBtn = $('layer-button');
function setActive(l: LayerSlots) {
  if (l === active) return;
  active = l;
  prefs.layer = l.id;
  savePrefs(prefs);
  stations.setLayer(l.id);
  series = null;
  document.body.dataset.fill = '';
  document.body.dataset.series = '';
  showLayer();
  // Each layer keeps its own model choice, and temperature its own steps (GDPS's profile every 3 h).
  rebuildTimeline();
  renderRunAge();
  renderReadout();
  renderDetails();
  void updateFills();
  void loadSeries();
  void loadPinGround();
  scrubber.setStatus('');
  void loadRadarFrames();
}
layerBtn.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#run-age') && active.frames && radarError) { void loadRadarFrames(true); return; }
  if ((e.target as HTMLElement).closest('#run-age') && active.id === 'avalanche' && avy.needsRetry()) { avy.retry(); return; }
  if ((e.target as HTMLElement).closest('#run-age') && document.body.dataset.run === 'error') { void loadRun(); return; }
  if (isOpenFrom(layerBtn)) { closePanel(); return; }
  openPanel({
    origin: layerBtn,
    icon: icons.chevronUp,
    iconAfterTitle: true,
    title: 'Condition layer',
    caption: 'One condition layer at a time',
    body: layerMenuBody(LAYERS, active.id, (l) => { closePanel(); setActive(l); }),
  });
});

// Model menu (04-ModelMenu) and model info (05-ModelInfo): grows from the model button.
const modelBtn = $('model-pill');
function modelAge(m: ModelId): string | null {
  const r = runs[m];
  return r ? formatRunAge(r.referenceTime, new Date()).split(' · ')[1] ?? null : null;
}
function modelFacts(m: ModelId) {
  const r = runs[m];
  if (!r) return { latest: 'unavailable', next: '–' };
  const spec = REGISTRY[m];
  const hour = r.referenceTime.toISOString().slice(11, 13);
  const age = Math.round((Date.now() - r.referenceTime.getTime()) / 3_600_000);
  // The next run should arrive one cycle after this one did.
  const due = r.lastModified.getTime() + (24 / spec.runsPerDay) * 3_600_000;
  const left = Math.round((due - Date.now()) / 3_600_000);
  return { latest: `${hour}Z · ${age} h`, next: left >= 0 ? `≈ ${Math.max(1, left)} h` : `late ≈ ${-left} h` };
}
function openModelInfo(spec: (typeof REGISTRY)[ModelId]) {
  openPanel({ origin: modelBtn, icon: icons.info, title: spec.label, caption: spec.fullName, body: modelInfoBody(spec, modelFacts(spec.id)) });
}
modelBtn.addEventListener('click', () => {
  if (isOpenFrom(modelBtn)) { closePanel(); return; }
  const layer = active;
  if (layer.id === 'avalanche') {
    // Issued data: the source menu, with Avalanche Canada as the one source.
    const at = pin?.get();
    const line = at ? avy.ageLine(at.lng, at.lat).text : '';
    const rows = AVALANCHE_SOURCES.map((src, i) => ({ ...src, current: i === 0, age: line.startsWith(`${src.label} · issued `) ? line.slice(src.label.length + 10).replace(' · expired', ', expired') : 'as issued' }));
    openPanel({ origin: modelBtn, icon: '<span class="panel-letter">S</span>', title: 'Source', caption: `For this layer · ${layer.title}`, body: sourceMenuBody(rows, () => closePanel()) });
    return;
  }
  const choice = modelChoice(layer);
  const rows = modelsFor(layer).map((m) => ({ spec: REGISTRY[m], age: modelAge(m), current: m === choice }));
  openPanel({
    origin: modelBtn,
    icon: '<span class="panel-letter">M</span>',
    title: 'Model',
    caption: `For this layer · ${layer.title}`,
    body: modelMenuBody(rows, (spec) => {
      closePanel();
      prefs.layerModels[layer.id] = spec.id;
      savePrefs(prefs);
      rebuildTimeline();
      renderRunAge();
      series = null;
      document.body.dataset.series = '';
      renderReadout();
      void updateFills();
      void loadSeries();
    }, openModelInfo),
  });
});

// Map panel
const layersBtn = $('map-layers');
layersBtn.addEventListener('click', () => {
  if (isOpenFrom(layersBtn)) { closePanel(); return; }
  openPanel({
    origin: layersBtn,
    icon: icons.layersPanel,
    title: 'Map',
    caption: 'Base map and terrain',
    headerAction: appSettings.gear(layersBtn),
    body: mapPanelBody({
      hillshade: prefs.hillshade, contours: prefs.contours, terrain3d: prefs.terrain3d, buildings3d: buildingsOk ? prefs.buildings3d : undefined,
      stations: prefs.stations, stationsOffline: !navigator.onLine || savedOnlyActive(),
    }, (s) => {
      if (s.stations !== prefs.stations) stations.setEnabled(s.stations);
      prefs.stations = s.stations;
      prefs.hillshade = s.hillshade;
      prefs.contours = s.contours;
      prefs.terrain3d = s.terrain3d ?? false;
      prefs.buildings3d = s.buildings3d ?? false;
      savePrefs(prefs);
      applyTerrainPrefs();
      threeD.apply({ terrain: prefs.terrain3d, buildings: buildingsOk && prefs.buildings3d }, true);
    }, offlineGroup(savedAreas, {
      choose: () => {
        closePanel();
        openSaveBox();
      },
      list: () => openSavedList(),
    }, !!run && !usingSaved)),
  });
});

const H_MS = 3_600_000;
/** The chain a save holds: HRDPS, then RDPS for the hours past its end. */
function saveRuns(): RunMetadata[] {
  return (['hrdps', 'rdps'] as ModelId[]).flatMap((m) => { const r = runs[m]; return r ? [r] : []; });
}
const hoursTo = (r: RunMetadata) => Math.round((r.validTimes[r.validTimes.length - 1]!.getTime() - Date.now()) / H_MS);

/** Save the chosen layers for a box: the same choices serve a first save and a refresh. */
async function saveChoice(bbox: Box, layers: string[], hours: number | null, name: string, onProgress: (text: string) => void): Promise<SavedArea> {
  const chosen = LAYERS.filter((l) => layers.includes(l.id));
  // Amounts need the per-step conversion; plain values (profiles, wind) do not.
  const amounts = [...new Set(chosen.flatMap((l) => l.saveNeeds.filter(isAmount)))];
  const plain = [...new Set(chosen.flatMap((l) => l.saveNeeds.filter((v) => !isAmount(v))))];
  return saveArea({ bbox, hours, runs: saveRuns(), variables: amounts, plainVariables: plain, name, layers, basemap, style: map.getStyle(), onProgress: (p) => onProgress(progressText(p)) });
}

async function afterSavedChange() {
  for (const a of savedAreas) basemap.removeSaved(a.id);
  await registerSavedAreas();
  drawSavedOutlines();
  // Offline, the runs come from the saved areas: they may have changed.
  if (usingSaved) void loadRun();
}

function openSaveBox() {
  if (!run || usingSaved) return;
  const [first, ...rest] = saveRuns();
  if (!first) return;
  // The save box is drawn on a flat, north-up map.
  map.jumpTo({ pitch: 0, bearing: 0 });
  openSaveMode(map, {
    firstHours: hoursTo(first),
    endHours: Math.max(hoursTo(first), ...rest.map(hoursTo)),
    layers: LAYERS.map((l) => ({ id: l.id, title: l.title, variables: [...new Set(l.saveNeeds)], onlineOnly: onlineOnly(l) })),
    initial: active.id,
    // Each model's cells over the box (as saved: 4 bytes a value), for its share of the hours.
    weatherBytes: (bb, hours, variables) => {
      const cells = (m: string) => coveringRanges(m, bb).reduce((n, r) => n * (r.end - r.start), 1);
      const firstH = Math.min(hours, hoursTo(first));
      const later = rest[0] ? Math.max(0, hours - firstH) * cells(rest[0].model) : 0;
      return 4 * variables * (firstH * cells(first.model) + later);
    },
    basemapBytes: (bb) => basemap.storedBytes(tilesInBox(bb, 0, 15)),
    save: async (choice, onProgress) => {
      // Named after the place nearest the box's centre, as the map labels it.
      const sw = map.project([choice.bbox[0], choice.bbox[1]]), ne = map.project([choice.bbox[2], choice.bbox[3]]);
      const c = { x: (sw.x + ne.x) / 2, y: (sw.y + ne.y) / 2 };
      const name = nameNear(map, c, Math.max(40, Math.min(Math.abs(ne.x - sw.x), Math.abs(sw.y - ne.y)) / 2)) ?? `Area ${savedAreas.length + 1}`;
      await saveChoice(choice.bbox, choice.layers, choice.hours, name, onProgress);
      await afterSavedChange();
      document.body.dataset.saved = 'true';
    },
    onClose: () => undefined,
  });
}

async function openSavedList() {
  const st = await storageState();
  openPanel({
    origin: layersBtn,
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
    title: 'Saved areas',
    caption: 'For use with no signal',
    body: savedAreasBody(savedAreas, { savedOnly: prefs.savedOnly, online: !usingSaved && !!run, ...st }, {
      refresh: async (a, onProgress) => {
        // The same box, layers and window, from the newest forecast; the old copy goes once the new one is in.
        await saveChoice(a.bbox, a.layers ?? ['precipitation'], a.window ?? null, a.name ?? 'Saved area', onProgress);
        await deleteArea(a);
        await afterSavedChange();
        void openSavedList();
      },
      remove: async (a) => {
        await deleteArea(a);
        await afterSavedChange();
      },
      setSavedOnly,
    }),
  });
}

/** "Saved data only", from the saved areas list or app settings: one pref, one effect. */
function setSavedOnly(on: boolean) {
  prefs.savedOnly = on;
  savePrefs(prefs);
  document.body.dataset.savedOnly = String(on);
  stations.refresh();
  void loadRun();
}

/** Units changed in app settings: every number on screen is formatted again. */
function redrawForUnits() {
  stations.redraw();
  showLayer();
  const p = pin.get();
  if (p) renderPlace(p);
  renderReadout();
  renderRunAge();
  scrubber.refresh();
  renderDetails();
  // The line on the map is labelled with its height.
  void updateFills();
}

/** The colours of the map's own lines (freezing line, saved areas) for a theme. */
const linePaint = (t: Theme) => ({
  freezing: colorToken('ink', t), label: colorToken('ink', t), halo: colorToken('surface', t), saved: colorToken('ink-2', t),
});

/** Theme changed: CSS follows the tokens by itself; the map and canvases are recoloured here. */
function recolourForTheme(t: Theme) {
  if (mapReady) {
    applyBaseTheme(map, t);
    applyTerrainTheme(map, t);
    threeD.applyTheme(t);
    const c = linePaint(t);
    if (map.getLayer('freezing-line')) map.setPaintProperty('freezing-line', 'line-color', c.freezing);
    if (map.getLayer('freezing-line-label')) { map.setPaintProperty('freezing-line-label', 'text-color', c.label); map.setPaintProperty('freezing-line-label', 'text-halo-color', c.halo); }
    if (map.getLayer('saved-areas')) map.setPaintProperty('saved-areas', 'line-color', c.saved);
    avy.recolour(t);
  }
  // Canvases read the CSS variables when drawn.
  scrubber.refresh();
  renderDetails();
}

function addFreezingLineLayers(beforeId?: string) {
  const c = linePaint(appSettings.theme());
  map.addSource('freezing-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'freezing-line', type: 'line', source: 'freezing-line', paint: { 'line-color': c.freezing, 'line-width': 1.5, 'line-opacity': 0.85, 'line-dasharray': [3, 2.5] } }, beforeId);
  map.addLayer({
    id: 'freezing-line-label', type: 'symbol', source: 'freezing-line',
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 12, 'symbol-spacing': 400, 'text-max-angle': 45, 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
  });
}

/** Saved areas' boxes as dashed outlines, so it is clear where data exists offline. */
function drawSavedOutlines() {
  const data = {
    type: 'FeatureCollection' as const,
    features: savedAreas.map((a) => {
      const [w, s_, e, n] = a.bbox;
      return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[w, s_], [e, s_], [e, n], [w, n], [w, s_]] } };
    }),
  };
  const src = map.getSource('saved-areas') as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  map.addSource('saved-areas', { type: 'geojson', data });
  map.addLayer({ id: 'saved-areas', type: 'line', source: 'saved-areas', paint: { 'line-color': linePaint(appSettings.theme()).saved, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
}

map.on('load', () => {
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel, appSettings.theme());
  applyTerrainPrefs();
  // Under the hillshade and contours, so the terrain reads through at any rate.
  map.addLayer(precipLayer, map.getLayer('hillshade') ? 'hillshade' : firstLabel);
  map.addLayer(tempLayer, map.getLayer('hillshade') ? 'hillshade' : firstLabel);
  map.addLayer(windLayer, map.getLayer('hillshade') ? 'hillshade' : firstLabel);
  addFreezingLineLayers(firstLabel);
  avy.addLayers(map.getLayer('hillshade') ? 'hillshade' : firstLabel, firstLabel);
  if (active.id === 'avalanche') void updateFills();
  threeD.apply({ terrain: prefs.terrain3d, buildings: buildingsOk && prefs.buildings3d }, false);
  radarImages.setBefore(firstLabel);
  mapReady = true;
  void loadRadarFrames();
  drawSavedOutlines();
  fitPadding();
  locate(false);
  void loadRun();
});
window.addEventListener('resize', fitPadding);
map.on('idle', () => { document.body.dataset.idle = 'true'; });

// Installed app: keep the app's own files on the device.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* runs without it */ });
  // Files loaded before the worker took charge (a first visit) are not in its
  // cache yet: keep them now, so the app opens without signal next time.
  void navigator.serviceWorker.ready.then(async () => {
    try {
      const cache = await caches.open('tempest-app-v2');
      const urls = new Set<string>([new URL('./', document.baseURI).href]);
      for (const e of performance.getEntriesByType('resource')) {
        const u = new URL(e.name);
        if (u.origin === location.origin && !u.pathname.endsWith('.pmtiles') && !u.pathname.includes('/tiles/')) urls.add(u.href);
      }
      urls.add(new URL('tiles/basemap.json', document.baseURI).href);
      for (const url of urls) if (!(await cache.match(url))) await cache.add(url).catch(() => undefined);
    } catch { /* storage unavailable */ }
  });
}
