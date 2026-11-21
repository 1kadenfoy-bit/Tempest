// Tempest: the shell (map, top bar, pin, thumb buttons, sheet, panels) with
// one condition layer at a time filling its slots (layers/contract.ts). One
// time cursor drives the map, the chart, the summary and the readout together.
//
// This file only starts the app, in order, and keeps the few calls that touch
// every part (the active layer, a layer's settings, the readout, units and
// theme, the map's stacking order). Each part lives in its section's folder
// and shares state through app/state.ts. Owned by the lead
// (docs/sections/README.md).
import './shell/shell.css';
import { S, app, $ } from './state';
import { MemoryStore } from '../core/store/memory-store';
import { TimeCursor } from '../core/time/cursor';
import type { PointSeries } from '../core/vocabulary';
import type { LayerSlots, PinData } from '../layers/contract';
import * as precip from '../layers/precipitation';
import { precipitation } from '../layers/precipitation';
import { temperature } from '../layers/temperature';
import { wind } from '../layers/wind';
import { avalanche, setAvalancheCursor } from '../layers/avalanche';
import { setAvalanchePin } from '../core/avalanche/danger';
import { airQuality } from '../layers/air-quality';
import { formatElevation } from '../core/units/format';
import { startRecordedWeather } from './data/recorded';
import { ProfileSource } from './data/profile-source';
import { savedOnlyActive } from './data/connection';
import { loadPinGround, loadRun, loadSeries, rebuildTimeline } from './data/forecast';
import { loadBasemap } from './map/basemap-router';
import { addTerrain } from './map/terrain';
import { setupThreeD } from './map/three-d';
import { applyTerrainPrefs, buildingsOk, createMap, fitPadding, locate, recolourMap, setupMapControls } from './map/setup';
import { setupRadar, radar, radarBefore, radarPinData, loadRadarFrames, scheduleRadarPin, setFrameSteps } from './radar/frames';
import { addFreezingLineLayers, flow, precipLayer, recolourFills, scheduleFills, setupFills, tempLayer, updateFills, windLayer } from './weather/fills';
import { drawSavedOutlines, recolourSavedOutlines, registerSavedAreas, setSavedOnly } from './offline/wiring';
import { hydrateIcons } from './shell/icons';
import { applyInsetOverride } from './shell/insets';
import { namedPlaceAt } from './map/places';
import { createPin, nameNear, pinLabel, type PinState } from './shell/pin';
import { loadPrefs, savePrefs } from './shell/prefs';
import { setupScrubber } from './shell/scrubber';
import { setupSheet } from './shell/sheet';
import { setupViewport } from './shell/viewport';
import { renderLegend, renderRunAge, setupTopBar, showLayer, syncAtesThumb } from './shell/top-bar';
import { renderDetails, scheduleDetails } from './shell/details';
import type { Theme } from './theme/tokens';
import { startAppSettings } from './settings/app-settings';
import { alertsAt } from './alerts/alerts';
import { setupSearch } from './search/search';
import { setupStations } from './stations/stations';
import { setupAvalanche } from './avalanche/avalanche';
import { setupAir } from './air/air';
import { consumeLongPressClick, loadSummarySeries, refreshSummary, setupSummary, summaryWants } from './summary/wiring';

// Recorded weather (dev server, ?weather=recorded): before anything asks for data.
await startRecordedWeather(location.search, document.baseURI);

S.prefs = loadPrefs();
// App settings: units and theme apply before anything draws; the hooks redraw
// what CSS cannot reach (called only on a change).
S.settings = startAppSettings(S.prefs, {
  savePrefs: () => savePrefs(S.prefs),
  onUnits: () => redrawForUnits(),
  onTheme: (t) => recolourForTheme(t),
  onSavedOnly: (on) => setSavedOnly(on),
  basemapAttribution: () => String(S.basemap.source.attribution ?? ''),
});
applyInsetOverride(document, location.search);
setupViewport(document);
hydrateIcons(document);

// The shared state starts empty; the parts fill it as data arrives.
Object.assign(S, {
  mapReady: false,
  sheet: null,
  runs: {},
  profileRuns: {},
  timeline: { segments: [], steps: [], seams: [], missing: [] },
  run: null,
  pastSteps: [],
  series: null,
  usingSaved: false,
  observed: undefined,
  pinGround: { key: '', values: {} },
  store: new MemoryStore<PointSeries>(32),
  savedAreas: [],
  savedParts: [],
  view: { cells: [] },
});

S.basemap = await loadBasemap(document.baseURI);
// Saved areas: their base map files are read first, inside their boxes.
await registerSavedAreas();
S.map = createMap();

// Weather stations: an overlay over every layer (map panel), online only.
S.stations = setupStations(S.map, {
  enabled: S.prefs.stations,
  layerId: S.prefs.layer,
  // Read only on a tap, after the pin exists.
  pin: () => { const p = S.pin?.get(); return p ? { lat: p.lat, lon: p.lng } : null; },
  savedOnly: () => savedOnlyActive(),
});

// One time cursor for the whole app, and the scrubber that shows it.
S.cursor = new TimeCursor();
S.scrubber = setupScrubber(S.cursor, S.prefs.windowHours, (h) => { S.prefs.windowHours = h; savePrefs(S.prefs); scheduleDetails(); });
setInterval(() => { if (document.visibilityState === 'visible') S.scrubber.refresh(); }, 30_000);
// The air quality layer's fill, pin values, AQHI and fires (online only; fires kept on the phone).
S.air = setupAir(S.map, {
  theme: () => S.settings.theme(),
  settings: () => settingsFor(airQuality),
  sourceId: () => S.prefs.layerModels[airQuality.id] ?? 'eccc',
  pin: () => { const p = S.pin?.get(); return p ? { lat: p.lat, lon: p.lng } : null; },
  onSteps: () => { if (S.active.id === airQuality.id) rebuildTimeline(); },
  onData: () => { if (S.active.id === airQuality.id) { renderReadout(); renderRunAge(); renderLegend(); S.scrubber.refresh(); } refreshSummary(); },
});

// The condition layers that work, in menu order. One is shown at a time.
S.layers = [precipitation, temperature, wind, radar, avalanche, airQuality];
S.active = S.layers.find((l) => l.id === S.prefs.layer) ?? precipitation;
S.profiles = new ProfileSource(() => S.savedParts, () => S.usingSaved);

// The calls the parts make on each other (app/state.ts).
Object.assign(app, {
  settingsFor, setLayerSetting, setActive, pinData, seriesIndex, renderReadout, rememberPin,
  showLayer, renderLegend, renderRunAge,
  scheduleDetails, renderDetails,
  refreshSummary, loadSummarySeries, summaryWants,
  rebuildTimeline, loadRun, loadSeries, loadPinGround,
  updateFills,
  loadRadarFrames, scheduleRadarPin, setFrameSteps,
});

/** A layer's settings: its defaults, overlaid with what was chosen (remembered between sessions). */
function settingsFor(l: LayerSlots): Record<string, string | boolean> {
  const saved = S.prefs.layerSettings[l.id] ?? {};
  return Object.fromEntries(l.settings.map((x) => [x.key, saved[x.key] ?? x.default]));
}

function pinData(): PinData {
  return { series: S.series, elevation: S.pin?.get()?.elevation ?? null, observed: S.observed, ground: S.pinGround.values, radar: radarPinData() };
}

showLayer();

function renderReadout() {
  // The avalanche layer needs no model run: until the time line is built, it reads now.
  setAvalancheCursor(S.cursor.time ?? new Date());
  S.air.setCursor(S.cursor.time ?? null);
  const i = seriesIndex();
  S.pin.setReadout(S.active.readout(pinData(), i, settingsFor(S.active)));
  scheduleDetails();
}

/** Index into the pin's series for the cursor's step. */
function seriesIndex(): number {
  const t = S.cursor.time;
  if (!S.series || !t) return -1;
  return S.series.times.findIndex((s) => s.getTime() === t.getTime());
}

// Radar's pictures, the weather fills and the wind's flow.
setupRadar();
setupFills();
// 3D terrain and buildings. The flow is drawn in screen space for a flat,
// north-up map, so it waits while the map is tilted or turned.
S.threeD = setupThreeD(S.map, document.querySelector<HTMLElement>('.thumbs')!, () => S.settings.theme(), (flat) => flow.setShown(S.active.id === 'wind' && flat));
// The avalanche layer's regions, report pins and panels (online only).
S.avy = setupAvalanche(S.map, {
  theme: () => S.settings.theme(),
  settings: () => settingsFor(avalanche),
  onData: () => { renderReadout(); renderRunAge(); S.scrubber.refresh(); refreshSummary(); },
  onLegend: () => { if (S.active.id === 'avalanche') renderLegend(); },
});
// The top bar's buttons and menus, and the avalanche terrain ratings' quick switch.
setupTopBar();

S.cursor.subscribe(() => {
  renderReadout();
  renderRunAge();
  scheduleFills(60);
  scheduleDetails();
  scheduleRadarPin();
});

setInterval(() => { if (document.visibilityState === 'visible') renderRunAge(); }, 60_000);
// A new run can land while the app stays open: look every 10 minutes while it is on screen.
setInterval(() => { if (document.visibilityState === 'visible' && !S.usingSaved) void loadRun(); }, 10 * 60_000);
// Radar: ECCC adds a frame every 6 minutes; ask again once one is due, while it is on screen.
setInterval(() => { if (document.visibilityState === 'visible' && S.active.frames) { void loadRadarFrames(); renderRunAge(); S.scrubber.refresh(); } }, 60_000);
addEventListener('online', () => void loadRadarFrames(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderRunAge(); void loadRun(); } });

// Pin
let lastPlace = '';
let seriesTimer = 0;
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
  S.scrubber.refresh();
  refreshSummary();
  // A new place: fetch its series once the pin settles.
  const where = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  if (where !== lastPlace) {
    lastPlace = where;
    alertsAt(p.lat, p.lng);
    S.air.pinMoved();
    scheduleRadarPin();
    clearTimeout(seriesTimer);
    seriesTimer = window.setTimeout(() => void loadSeries(), 250);
  }
};
S.pin = createPin(S.map, renderPlace);
function rememberPin(p: { lng: number; lat: number; name: string | null }) {
  S.prefs.lastPin = { lng: p.lng, lat: p.lat, label: p.name ?? '' };
  savePrefs(S.prefs);
}

// The forecast summary window and press-and-hold (app/summary).
setupSummary();
// The locate button, the place line and the map panel (app/map).
setupMapControls();

S.map.on('click', (e) => {
  // The lift that ends a press-and-hold is not a tap (the summary window is opening).
  if (consumeLongPressClick()) return;
  // A tap on a weather station opens it; the pin stays.
  if (S.stations.hit(e.originalEvent.target)) return;
  // Air quality: a tap on a fire opens it; the pin stays.
  if (S.active.id === airQuality.id && S.air.tapped(e.point)) return;
  // A tap near a named peak, hut or trail takes that place (and its name) for the pin.
  const named = namedPlaceAt(S.map, e.point);
  const at = named ?? { lng: e.lngLat.lng, lat: e.lngLat.lat };
  const name = named?.name ?? nameNear(S.map, e.point);
  S.pin.set({ lng: at.lng, lat: at.lat, kind: 'dropped', name });
  rememberPin({ lng: at.lng, lat: at.lat, name });
  // Avalanche: the tapped region's forecast opens, as on Avalanche Canada's map.
  if (S.active.id === 'avalanche') S.avy.tapped(e.point, e.lngLat);
});

// Search: a chosen place moves the pin as a tap would, named, and the map flies there.
setupSearch($('search-button') as HTMLButtonElement, {
  choose: (place) => {
    S.pin.set({ lng: place.lon, lat: place.lat, kind: 'dropped', name: place.name });
    rememberPin({ lng: place.lon, lat: place.lat, name: place.name });
    S.map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(S.map.getZoom(), 12), duration: 900 });
  },
  near: () => { const c = S.map.getCenter(); return { lat: c.lat, lon: c.lng }; },
});

// Sheet: the details are drawn when it is pulled up, and kept fresh while it is.
S.sheet = setupSheet($('sheet'), $('sheet-handle'), (st) => { if (st === 'up') renderDetails(); });

/** Change one of a layer's settings (remembered between sessions) and redraw what depends on it. */
function setLayerSetting(layer: LayerSlots, key: string, v: string | boolean) {
  S.prefs.layerSettings[layer.id] = { ...(S.prefs.layerSettings[layer.id] ?? {}), [key]: v };
  savePrefs(S.prefs);
  if (layer.id === 'precipitation' && key === 'type') precipLayer.setStyle(precip.precipRenderStyle(v as 'all' | 'rain' | 'snow'));
  // Radar: another product has its own frames and legend.
  if (layer.id === radar.id && key === 'shown') { showLayer(); void loadRadarFrames(true); }
  renderReadout();
  S.scrubber.refresh();
  renderDetails();
  void updateFills();
  if (layer.id === 'avalanche') { syncAtesThumb(); renderLegend(); }
  if (layer.id === airQuality.id) { S.air.changed(); renderLegend(); }
}

/** Show another condition layer (from the layer menu). */
function setActive(l: LayerSlots) {
  if (l === S.active) return;
  S.active = l;
  S.prefs.layer = l.id;
  savePrefs(S.prefs);
  S.stations.setLayer(l.id);
  S.series = null;
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
  S.scrubber.setStatus('');
  void loadRadarFrames();
}

/** Units changed in app settings: every number on screen is formatted again. */
function redrawForUnits() {
  S.stations.redraw();
  showLayer();
  const p = S.pin.get();
  if (p) renderPlace(p);
  renderReadout();
  renderRunAge();
  S.scrubber.refresh();
  renderDetails();
  // The line on the map is labelled with its height.
  void updateFills();
}

/** Theme changed: CSS follows the tokens by itself; the map and canvases are recoloured here. */
function recolourForTheme(t: Theme) {
  if (S.mapReady) {
    recolourMap(t);
    recolourFills(t);
    recolourSavedOutlines(t);
    S.avy.recolour(t);
    S.air.recolour(t);
  }
  // Canvases read the CSS variables when drawn.
  S.scrubber.refresh();
  renderDetails();
}

// The map's stacking order, bottom to top: the base map's ground and water,
// the weather fills, the hillshade and contours, the lines (freezing or snow
// line, saved areas), the labels. Sections add to it here, through the lead.
S.map.on('load', () => {
  const map = S.map;
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel, S.settings.theme());
  applyTerrainPrefs();
  // Under the hillshade and contours, so the terrain reads through at any rate.
  const underShading = map.getLayer('hillshade') ? 'hillshade' : firstLabel;
  map.addLayer(precipLayer, underShading);
  map.addLayer(tempLayer, underShading);
  map.addLayer(windLayer, underShading);
  addFreezingLineLayers(firstLabel);
  S.avy.addLayers(underShading, firstLabel);
  S.air.addLayers(underShading, firstLabel);
  if (S.active.id === 'avalanche' || S.active.id === airQuality.id) void updateFills();
  S.threeD.apply({ terrain: S.prefs.terrain3d, buildings: buildingsOk() && S.prefs.buildings3d }, false);
  radarBefore(firstLabel);
  S.mapReady = true;
  void loadRadarFrames();
  drawSavedOutlines();
  fitPadding();
  locate(false);
  void loadRun();
});
window.addEventListener('resize', fitPadding);
S.map.on('idle', () => { document.body.dataset.idle = 'true'; });

// Installed app: keep the app's own files on the device.
// A section preview (VITE_PREVIEW at build time) is named in the top bar and
// keeps no offline copy, so it never mixes with the installed app.
const preview = import.meta.env.VITE_PREVIEW as string | undefined;
if (preview) {
  document.title = `Tempest · ${preview} preview`;
  $('run-age').dataset.preview = preview;
}

if ('serviceWorker' in navigator && import.meta.env.PROD && !preview) {
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
