// Tempest: the shell (map, top bar, pin, thumb buttons, sheet, panels) with
// one condition layer at a time filling its slots (layers/contract.ts). One
// time cursor drives the map, the chart, the summary and the readout together.
import './shell/shell.css';
import type { LngLatLike } from 'maplibre-gl';
import { MemoryStore, pointKey } from '../core/store/memory-store';
import { TimeCursor } from '../core/time/cursor';
import { formatRunAge, runAgeHours } from '../core/time/run-age';
import { formatElevation } from '../core/units/format';
import type { PointSeries } from '../core/vocabulary';
import { MODELS, fetchPointSeries } from '../adapters/openmeteo-maps/point-series';
import { fetchRunMetadata, type RunMetadata } from '../adapters/openmeteo-maps/run-metadata';
import * as precip from '../layers/precipitation';
import { precipitation } from '../layers/precipitation';
import { temperature, temperatureRenderStyle } from '../layers/temperature';
import type { LayerSlots, PinData } from '../layers/contract';
import { fetchApiRun } from '../adapters/openmeteo-api/point-series';
import { PROFILE_LEVELS, isAmount } from '../core/vocabulary';
import { latticeAxis, type NodeGrid } from '../core/temperature/toposcale';
import { TerrainTemperatureLayer } from '../render/grid-gl/terrain-temperature-layer';
import { MODEL_SPACING_DEG, ProfileSource } from './data/profile-source';
import { elevationMosaic, type Mosaic } from './map/elevation';
import { freezingLineFeatures } from './map/freezing-line';
import { layerMenuBody } from './shell/layer-menu';
import { fetchGridField } from '../adapters/openmeteo-maps/grid-field';
import { gridRequest } from '../core/geo/grid-request';
import type { GridField } from '../core/vocabulary';
import { TypedRateLayer } from '../render/grid-gl/typed-rate-layer';
import { areaContains, areaOverlaps, tilesInBox, type SavedArea } from '../core/offline/saved-area';
import { offlineGroup, progressText } from './offline/offline-panel';
import { openSaveMode } from './offline/save-mode';
import { deleteArea, forgetSavedWeather, listSavedAreas, loadSavedWeather, saveArea, savedStep } from './offline/saved-areas';
import { regridNative, sampleNative } from '../render/openmeteo-starter';
import { readFile } from './offline/storage';
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
import { applyTokens, colorToken } from './theme/tokens';

applyTokens(document);
applyInsetOverride(document, location.search);
setupViewport(document);
hydrateIcons(document);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const prefs = loadPrefs();

// North Shore, the start region on every design screen.
const NORTH_SHORE: [number, number] = [-123.02, 49.38];

const basemap = await loadBasemap(document.baseURI);

// Saved areas: their base map files are read first, inside their boxes.
let savedAreas: SavedArea[] = [];
async function registerSavedAreas() {
  try {
    savedAreas = await listSavedAreas();
    for (const a of savedAreas) {
      const file = await readFile(a.basemap.file);
      if (file) basemap.addSaved(a.id, file, a.bbox, a.basemap.minzoom, a.basemap.maxzoom);
    }
  } catch { savedAreas = []; }
}
await registerSavedAreas();
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
const scrubber = setupScrubber(cursor, prefs.windowHours, (h) => { prefs.windowHours = h; savePrefs(prefs); });
setInterval(() => { if (document.visibilityState === 'visible') scrubber.refresh(); }, 30_000);

// The condition layers that work, in menu order. One is shown at a time.
const LAYERS: LayerSlots[] = [precipitation, temperature];
let active: LayerSlots = LAYERS.find((l) => l.id === prefs.layer) ?? precipitation;

// The layer's data: the run, and the pin's series.
const MODEL = 'cmc_gem_hrdps';
const store = new MemoryStore<PointSeries>(32);
let run: RunMetadata | null = null;
let series: PointSeries | null = null;
/** True when the run comes from a saved area (no signal). */
let usingSaved = false;

const pinData = (): PinData => ({ series, elevation: pin?.get()?.elevation ?? null });
const profiles = new ProfileSource(() => savedAreas);

/** Point the shell's slots at the active layer. */
function showLayer() {
  $('layer-name').textContent = active.title;
  $('legend-row').replaceChildren(active.legend(document));
  const weekDay = active.weekDay;
  scrubber.setLayer({
    chartLabel: active.chartLabel,
    drawChart: (ctx, w, h, start, end) => active.drawChart(ctx, w, h, pinData(), start, end),
    summary: (start, c, end) => active.summary(pinData(), start, c, end),
    ...(weekDay ? { weekDay: (a: Date, b: Date) => weekDay(pinData(), a, b) } : {}),
  });
  document.body.dataset.layer = active.id;
}
showLayer();

function renderRunAge() {
  if (!run) return;
  const el = $('run-age');
  el.textContent = formatRunAge(run.referenceTime, new Date()) + (usingSaved ? ' · saved' : '');
  // Stale is shown, never hidden: a run over 12 h old turns the warning colour.
  el.dataset.stale = String(runAgeHours(run.referenceTime, new Date()) >= 12);
  $('model-pill').textContent = MODELS[run.model]?.label ?? run.model;
}

function renderReadout() {
  const i = seriesIndex();
  pin.setReadout(active.readout(pinData(), i));
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
const precipLayer = new TypedRateLayer('precip-grid', precip.precipRenderStyle());
const tempLayer = new TerrainTemperatureLayer('temperature-grid', temperatureRenderStyle(), PROFILE_LEVELS.length);
let mosaic: Mosaic | null = null;
/** How far beyond each screen edge the temperature fill reaches, as a share of the screen. */
const PAN_MARGIN = 0.35;
const fieldStore = new MemoryStore<GridField>(48);
let fillTimer = 0;
let mapReady = false;
let fillSeq = 0;

function fieldKey(r: RunMetadata, t: Date, gridKey: string) {
  return `${r.model}|${r.referenceTime.toISOString()}|${t.toISOString()}|${gridKey}`;
}

type Box = [number, number, number, number];
const covers = (a: Box, b: Box) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/** A saved area's field for this run and step, if it has one (and covers `need`, when given). */
async function savedField(r: RunMetadata, t: Date, need: Box | null, overlap: Box): Promise<{ field: GridField; key: string } | null> {
  for (const a of savedAreas) {
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
async function updateTemperature(r: RunMetadata, t: Date, mine: number) {
  // A margin around the screen, so panning shows colour straight away.
  const b = map.getBounds();
  const padX = (b.getEast() - b.getWest()) * PAN_MARGIN;
  const padY = (b.getNorth() - b.getSouth()) * PAN_MARGIN;
  const view: Box = [Math.max(BC_BOX[0], b.getWest() - padX), Math.max(BC_BOX[1], b.getSouth() - padY), Math.min(BC_BOX[2], b.getEast() + padX), Math.min(BC_BOX[3], b.getNorth() + padY)];
  if (view[0] >= view[2] || view[1] >= view[3]) { tempLayer.setProfiles(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const [m, grid] = await Promise.all([elevationMosaic(view, map.getZoom(), mosaic), profiles.nodeGrid(r, lattice, t)]);
  if (mine !== fillSeq || active.id !== 'temperature') return;
  if (m !== mosaic) { mosaic = m; tempLayer.setElevation(m); }
  if (!grid) {
    tempLayer.setProfiles(null);
    setFreezingLine(null);
    scrubber.setStatus(usingSaved ? 'Temperature is not saved for this area' : 'Temperature for this view is not available');
    return;
  }
  tempLayer.setProfiles(packLattice(grid));
  setFreezingLine(grid);
  document.body.dataset.fill = 'ready';
  // The next hour ahead of time (instant when the point API answered).
  const i = cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
  const next = cursor.allSteps[i + 1];
  if (next) void profiles.nodeGrid(r, lattice, next).catch(() => undefined);
}

function packLattice(grid: NodeGrid) {
  const nl = PROFILE_LEVELS.length;
  const data = new Float32Array(grid.profiles.length * nl * 2);
  grid.profiles.forEach((p, n) => {
    for (let k = 0; k < nl; k++) { data[(n * nl + k) * 2] = p.gh[k]!; data[(n * nl + k) * 2 + 1] = p.temp[k]!; }
  });
  return { lons: grid.lons, lats: grid.lats, levels: nl, data };
}

/** The dashed 0 °C line, labelled with its height, from the same profiles and terrain as the fill. */
function setFreezingLine(grid: NodeGrid | null) {
  const src = map.getSource('freezing-line') as maplibregl.GeoJSONSource | undefined;
  const data = grid && mosaic ? freezingLineFeatures(grid, mosaic) : { type: 'FeatureCollection' as const, features: [] };
  src?.setData(data);
}

async function updateFills() {
  if (!run || !cursor.time || !mapReady) return;
  if (active.id === 'temperature') {
    precipLayer.setFields([]);
    tempLayer.visible = true;
    await updateTemperature(run, cursor.time, ++fillSeq).catch((err) => console.error(err));
    return;
  }
  tempLayer.visible = false;
  setFreezingLine(null);
  const b = map.getBounds();
  const req = gridRequest([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom(), BC_BOX);
  if (!req) { precipLayer.setFields([]); return; }
  const r = run;
  const t = cursor.time;
  const mine = ++fillSeq;
  try {
    const f = await getField(r, t, req);
    if (mine !== fillSeq) return;
    precipLayer.setFields([precip.precipDrawField(f.field, f.key)]);
    document.body.dataset.fill = 'ready';
    // Fetch the next step ahead of time, so playing and scrubbing stay smooth.
    const i = cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
    const next = cursor.allSteps[i + 1];
    if (next) void getField(r, next, req).catch(() => undefined);
  } catch (err) {
    console.error(err);
  }
}
const scheduleFills = (ms: number) => { clearTimeout(fillTimer); fillTimer = window.setTimeout(() => void updateFills(), ms); };
map.on('moveend', () => scheduleFills(150));
// During a long pan, refresh about twice a second rather than only on release.
let lastMoveFill = 0;
let moveFilling = false;
map.on('move', () => {
  const now = performance.now();
  if (moveFilling || now - lastMoveFill < 500) return;
  lastMoveFill = now;
  moveFilling = true;
  void updateFills().finally(() => { moveFilling = false; });
});

cursor.subscribe(() => {
  renderReadout();
  scheduleFills(60);
});

/** The run a saved area holds, for use without signal. */
function savedRun(): RunMetadata | null {
  const a = [...savedAreas].sort((x, y) => y.weather.run.localeCompare(x.weather.run))[0];
  if (!a) return null;
  const ref = new Date(a.weather.run);
  return { model: a.weather.model, completed: true, referenceTime: ref, lastModified: new Date(a.savedAt), validTimes: [ref, ...a.weather.validTimes.map((t) => new Date(t))], variables: [] };
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

async function loadRun() {
  try {
    const next = await sharedRun(await fetchRunMetadata(MODEL));
    usingSaved = false;
    const changed = !run || next.referenceTime.getTime() !== run.referenceTime.getTime();
    run = next;
    renderRunAge();
    if (changed) {
      // Amounts start at the run's second file (the first has none yet).
      cursor.setSteps(run.validTimes.slice(1), cursor.time ?? new Date());
      void updateFills();
      void loadSeries();
    }
    document.body.dataset.run = 'ready';
  } catch (err) {
    const saved = savedRun();
    if (saved) {
      const changed = !run || saved.referenceTime.getTime() !== run.referenceTime.getTime();
      run = saved;
      usingSaved = true;
      renderRunAge();
      if (changed) {
        cursor.setSteps(run.validTimes.slice(1), cursor.time ?? new Date());
        void updateFills();
        void loadSeries();
      }
      document.body.dataset.run = 'saved';
      return;
    }
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
  const layer = active;
  const key = pointKey(layer.id, run.model, run.referenceTime, layer.pinNeeds, p.lat, p.lng);
  const cached = store.get(key);
  const mine = ++seriesSeq;
  if (cached) {
    series = cached;
  } else {
    series = null;
    scrubber.setStatus('Loading the pin’s forecast…');
    renderReadout();
    try {
      const r = run;
      const s = layer.id === 'temperature'
        // Partial series arrive while the slow path (map files) reads hour by hour.
        ? await profiles.pinSeries(r, p.lat, p.lng, (part) => { if (mine === seriesSeq) { series = part; renderReadout(); scrubber.refresh(); } })
        : (usingSaved ? await savedSeries(r, p.lat, p.lng) : null) ?? await fetchPointSeries(r, precip.needs, p.lat, p.lng);
      store.put(key, s);
      if (mine !== seriesSeq) return;
      series = s;
    } catch (err) {
      const s = layer.id === 'precipitation' ? await savedSeries(run, p.lat, p.lng) : null;
      if (mine !== seriesSeq) return;
      if (s) {
        series = s;
        scrubber.setStatus('');
        renderReadout();
        document.body.dataset.series = 'ready';
        return;
      }
      scrubber.setStatus(usingSaved ? 'The pin is outside the saved area' : 'Could not load the pin’s forecast');
      console.error(err);
      return;
    }
  }
  scrubber.setStatus('');
  renderReadout();
  scrubber.refresh();
  document.body.dataset.series = 'ready';
}
/** The pin's series from a saved area's grids (same run), for use without signal. */
async function savedSeries(r: RunMetadata, lat: number, lng: number): Promise<PointSeries | null> {
  for (const a of savedAreas) {
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderRunAge(); void loadRun(); } });

// Pin
const renderPlace = (p: PinState) => {
  const label = pinLabel(p).long;
  const text = p.elevation === null ? label : `${label} · ${formatElevation(p.elevation)}`;
  $('place-text').textContent = text;
  $('place-line').setAttribute('aria-label', `Centre the map on ${label}`);
  $('subject-place').textContent = text;
  document.body.dataset.pin = p.elevation === null ? 'pending' : 'ready';
  // Temperature is read at the pin's ground height: refresh once it is known.
  renderReadout();
  scrubber.refresh();
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
const pin: ReturnType<typeof createPin> = createPin(map, renderPlace);
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
sheetCtl = setupSheet(sheetEl, $('sheet-handle'), () => undefined);

// Layer menu (03-LayerMenu): grows from the layer name; built layers only.
const layerBtn = $('layer-button');
function setActive(l: LayerSlots) {
  if (l === active) return;
  active = l;
  prefs.layer = l.id;
  savePrefs(prefs);
  series = null;
  document.body.dataset.fill = '';
  document.body.dataset.series = '';
  showLayer();
  renderReadout();
  void updateFills();
  void loadSeries();
}
layerBtn.addEventListener('click', (e) => {
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
    }, offlineGroup(savedAreas, {
      choose: () => {
        closePanel();
        if (!run || usingSaved) return;
        const r = run;
        openSaveMode(map, {
          modelHours: Math.round((r.validTimes[r.validTimes.length - 1]!.getTime() - Date.now()) / 3_600_000),
          layers: LAYERS.map((l) => ({ id: l.id, title: l.title, variables: l.saveNeeds.length })),
          initial: active.id,
          basemapBytes: (bb) => basemap.storedBytes(tilesInBox(bb, 0, 15)),
          save: async (choice, onProgress) => {
            const chosen = LAYERS.filter((l) => choice.layers.includes(l.id));
            // Amounts need the per-step conversion; plain values (profiles) do not.
            const amounts = [...new Set(chosen.flatMap((l) => l.saveNeeds.filter(isAmount)))];
            const plain = [...new Set(chosen.flatMap((l) => l.saveNeeds.filter((v) => !isAmount(v))))];
            await saveArea({ bbox: choice.bbox, hours: choice.hours, run: r, variables: amounts, plainVariables: plain, basemap, style: map.getStyle(), onProgress: (p) => onProgress(progressText(p)) });
            for (const old of savedAreas) { basemap.removeSaved(old.id); forgetSavedWeather(old.id); }
            await registerSavedAreas();
            drawSavedOutlines();
            document.body.dataset.saved = 'true';
          },
          onClose: () => undefined,
        });
      },
      remove: async (area) => {
        await deleteArea(area);
        basemap.removeSaved(area.id);
        forgetSavedWeather(area.id);
        await registerSavedAreas();
        drawSavedOutlines();
      },
    })),
  });
});

function addFreezingLineLayers(beforeId?: string) {
  map.addSource('freezing-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'freezing-line', type: 'line', source: 'freezing-line', paint: { 'line-color': colorToken('ink'), 'line-width': 1.5, 'line-opacity': 0.85, 'line-dasharray': [3, 2.5] } }, beforeId);
  map.addLayer({
    id: 'freezing-line-label', type: 'symbol', source: 'freezing-line',
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 12, 'symbol-spacing': 400, 'text-max-angle': 45, 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': colorToken('ink'), 'text-halo-color': colorToken('surface'), 'text-halo-width': 1.5 },
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
  map.addLayer({ id: 'saved-areas', type: 'line', source: 'saved-areas', paint: { 'line-color': colorToken('ink-2'), 'line-width': 1.5, 'line-dasharray': [3, 2] } });
}

map.on('load', () => {
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel);
  applyTerrainPrefs();
  // Under the hillshade and contours, so the terrain reads through at any rate.
  map.addLayer(precipLayer, map.getLayer('hillshade') ? 'hillshade' : firstLabel);
  map.addLayer(tempLayer, map.getLayer('hillshade') ? 'hillshade' : firstLabel);
  addFreezingLineLayers(firstLabel);
  mapReady = true;
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
