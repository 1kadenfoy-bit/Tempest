// Tempest: the shell (map, top bar, pin, thumb buttons, sheet, panels) with
// the precipitation layer filling its slots. One time cursor drives the map,
// the chart, the summary and the readout together.
import './shell/shell.css';
import type { LngLatLike } from 'maplibre-gl';
import { MemoryStore, pointKey } from '../core/store/memory-store';
import { TimeCursor } from '../core/time/cursor';
import { formatRunAge, runAgeHours } from '../core/time/run-age';
import { formatElevation } from '../core/units/format';
import type { PointSeries } from '../core/vocabulary';
import { MODELS, fetchPointSeries } from '../adapters/openmeteo-maps/point-series';
import { fetchRunMetadata, stepFileUrl, type RunMetadata } from '../adapters/openmeteo-maps/run-metadata';
import * as precip from '../layers/precipitation';
import { showWeatherFills } from '../render/openmeteo-starter';
import { loadBasemap } from './map/basemap-router';
import { maplibregl } from './map/maplibre';
import { topoStyle } from './map/style';
import { addTerrain } from './map/terrain';
import { hydrateIcons, icons } from './shell/icons';
import { applyInsetOverride } from './shell/insets';
import { mapPanelBody } from './shell/map-panel';
import { closePanel, isOpenFrom, openPanel } from './shell/panel';
import { createPin, nameNear, pinLabel, type PinState } from './shell/pin';
import { loadPrefs, savePrefs } from './shell/prefs';
import { setupScrubber } from './shell/scrubber';
import { setupSheet } from './shell/sheet';
import { setupViewport } from './shell/viewport';
import { applyTokens } from './theme/tokens';

applyTokens(document);
applyInsetOverride(document, location.search);
setupViewport(document);
hydrateIcons(document);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const prefs = loadPrefs();

// North Shore, the start region on every design screen.
const NORTH_SHORE: [number, number] = [-123.02, 49.38];

const basemap = await loadBasemap(document.baseURI);
const map = new maplibregl.Map({
  container: 'map',
  style: topoStyle(basemap.source),
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

// Keep "centre" meaning the part of the map above the collapsed sheet. The
// pulled-up sheet covers the map without moving it.
const sheetEl = $('sheet');
const collapsedProbe = document.createElement('div');
collapsedProbe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:var(--sheet-collapsed)';
document.body.append(collapsedProbe);
const fitPadding = () => {
  map.setPadding({ top: 0, bottom: collapsedProbe.offsetHeight, left: 0, right: 0 });
};

// Terrain switches
const applyTerrainPrefs = () => {
  if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', prefs.hillshade ? 'visible' : 'none');
  if (map.getLayer('contour-lines')) map.setLayoutProperty('contour-lines', 'visibility', prefs.contours ? 'visible' : 'none');
};

// One time cursor for the whole app, and the scrubber that shows it.
const cursor = new TimeCursor();
const scrubber = setupScrubber(cursor, prefs.windowHours, (h) => { prefs.windowHours = h; savePrefs(prefs); });
$('legend-row').append(precip.legend(document));
setInterval(() => { if (document.visibilityState === 'visible') scrubber.refresh(); }, 30_000);

// The layer's data: the latest run, and the pin's series from the same files.
const MODEL = 'cmc_gem_hrdps';
const store = new MemoryStore<PointSeries>(32);
let run: RunMetadata | null = null;
let series: PointSeries | null = null;

scrubber.setLayer({
  drawChart: (ctx, w, h, start, end) => precip.drawChart(ctx, w, h, series, start, end),
  summary: (start, end) => precip.windowSummary(series, start, end),
});

function renderRunAge() {
  if (!run) return;
  const el = $('run-age');
  el.textContent = formatRunAge(run.referenceTime, new Date());
  // Stale is shown, never hidden: a run over 12 h old turns the warning colour.
  el.dataset.stale = String(runAgeHours(run.referenceTime, new Date()) >= 12);
  $('model-pill').textContent = MODELS[run.model]?.label ?? run.model;
}

function renderReadout() {
  const i = seriesIndex();
  pin.setValue(precip.readoutValue(series, i));
}

/** Index into the pin's series for the cursor's step. */
function seriesIndex(): number {
  const t = cursor.time;
  if (!series || !t) return -1;
  return series.times.findIndex((s) => s.getTime() === t.getTime());
}

// Map fills follow the cursor, at most a few times a second while scrubbing.
let fillTimer = 0;
let mapReady = false;
let shownStep = '';
function updateFills() {
  if (!run || !cursor.time || !mapReady) return;
  const key = cursor.time.toISOString();
  if (key === shownStep) return;
  shownStep = key;
  const label = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  showWeatherFills(map, precip.precipFills(stepFileUrl(run.model, run.referenceTime, cursor.time), 1), label);
}
cursor.subscribe(() => {
  renderReadout();
  clearTimeout(fillTimer);
  fillTimer = window.setTimeout(updateFills, 120);
});

async function loadRun() {
  try {
    const next = await fetchRunMetadata(MODEL);
    const changed = !run || next.referenceTime.getTime() !== run.referenceTime.getTime();
    run = next;
    renderRunAge();
    if (changed) {
      // Amounts start at the run's second file (the first has none yet).
      cursor.setSteps(run.validTimes.slice(1), cursor.time ?? new Date());
      shownStep = '';
      updateFills();
      void loadSeries();
    }
    document.body.dataset.run = 'ready';
  } catch (err) {
    $('run-age').textContent = 'Weather unavailable · tap to retry';
    scrubber.setStatus('Could not reach the weather data');
    document.body.dataset.run = 'error';
    console.error(err);
  }
}

let seriesSeq = 0;
async function loadSeries() {
  const p = pin.get();
  if (!run || !p) return;
  const key = pointKey('openmeteo-maps', run.model, run.referenceTime, precip.needs, p.lat, p.lng);
  const cached = store.get(key);
  const mine = ++seriesSeq;
  if (cached) {
    series = cached;
  } else {
    series = null;
    scrubber.setStatus('Loading the pin’s forecast…');
    renderReadout();
    try {
      const s = await fetchPointSeries(run, precip.needs, p.lat, p.lng);
      store.put(key, s);
      if (mine !== seriesSeq) return;
      series = s;
    } catch (err) {
      if (mine !== seriesSeq) return;
      scrubber.setStatus('Could not load the pin’s forecast');
      console.error(err);
      return;
    }
  }
  scrubber.setStatus('');
  renderReadout();
  document.body.dataset.series = 'ready';
}
setInterval(() => { if (document.visibilityState === 'visible') renderRunAge(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderRunAge(); void loadRun(); } });

// Pin
const renderPlace = (p: PinState) => {
  const label = pinLabel(p).long;
  const text = p.elevation === null ? label : `${label} · ${formatElevation(p.elevation)}`;
  $('place-text').textContent = text;
  $('place-line').setAttribute('aria-label', `Centre the map on ${label}`);
  $('subject-place').textContent = text;
  document.body.dataset.pin = p.elevation === null ? 'pending' : 'ready';
  // A new place: fetch its series once the pin settles.
  const where = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  if (where !== lastPlace) {
    lastPlace = where;
    clearTimeout(seriesTimer);
    seriesTimer = window.setTimeout(() => void loadSeries(), 250);
  }
};
let lastPlace = '';
let seriesTimer = 0;
const pin = createPin(map, renderPlace);
const rememberPin = (p: { lng: number; lat: number; name: string | null }) => {
  prefs.lastPin = { lng: p.lng, lat: p.lat, label: p.name ?? '' };
  savePrefs(prefs);
};

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
  const name = nameNear(map, e.point);
  pin.set({ lng: e.lngLat.lng, lat: e.lngLat.lat, kind: 'dropped', name });
  rememberPin({ lng: e.lngLat.lng, lat: e.lngLat.lat, name });
});

// Sheet
setupSheet(sheetEl, $('sheet-handle'), () => undefined);

// Map panel
const layersBtn = $('map-layers');
layersBtn.addEventListener('click', () => {
  if (isOpenFrom(layersBtn)) { closePanel(); return; }
  openPanel({
    origin: layersBtn,
    icon: icons.layersPanel,
    title: 'Map',
    caption: 'Base map and terrain',
    body: mapPanelBody({ hillshade: prefs.hillshade, contours: prefs.contours }, (s) => {
      prefs.hillshade = s.hillshade;
      prefs.contours = s.contours;
      savePrefs(prefs);
      applyTerrainPrefs();
    }),
  });
});

map.on('load', () => {
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel);
  applyTerrainPrefs();
  mapReady = true;
  fitPadding();
  locate(false);
  void loadRun();
});
$('run-age').addEventListener('click', () => { if (document.body.dataset.run === 'error') void loadRun(); });
window.addEventListener('resize', fitPadding);
map.on('idle', () => { document.body.dataset.idle = 'true'; });

// Installed app: keep the app's own files on the device.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* runs without it */ });
}
