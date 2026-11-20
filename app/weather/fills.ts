// The weather on the map (Weather section): the precipitation, temperature and
// wind fills drawn by the app's own GPU renderer, the wind's flow, the 0 °C or
// snow line, and what the map holds for the details' In view line. Grid
// fields come from memory, then a saved area, then the network. Moved out of
// app/main.ts; it reads the shared state in app/state.ts.
import type { GeoJSONSource } from 'maplibre-gl';
import { S, app } from '../state';
import type { ViewSample } from '../../layers/contract';
import { PROFILE_LEVELS, type GridField } from '../../core/vocabulary';
import { MemoryStore } from '../../core/store/memory-store';
import { segmentAt } from '../../core/time/timeline';
import { gridRequest } from '../../core/geo/grid-request';
import { areaOverlaps, type SavedArea } from '../../core/offline/saved-area';
import { latticeAxis, freezingLevel } from '../../core/temperature/toposcale';
import { dewPoint } from '../../core/temperature/feels-like';
import { MODELS as REGISTRY, type ModelId } from '../../adapters/openmeteo-maps/models';
import { MODELS } from '../../adapters/openmeteo-maps/point-series';
import { fetchGridField } from '../../adapters/openmeteo-maps/grid-field';
import type { RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import * as precip from '../../layers/precipitation';
import { precipitation } from '../../layers/precipitation';
import { temperature, temperatureRenderStyle } from '../../layers/temperature';
import { wind, windRenderStyle } from '../../layers/wind';
import { airQuality } from '../../layers/air-quality';
import { TypedRateLayer } from '../../render/grid-gl/typed-rate-layer';
import { TerrainTemperatureLayer } from '../../render/grid-gl/terrain-temperature-layer';
import { TerrainWindLayer } from '../../render/grid-gl/terrain-wind-layer';
import { FlowCanvas, type FlowMode } from '../../render/flow/flow-canvas';
import { regridNative } from '../../render/openmeteo-starter';
import { MODEL_SPACING_DEG, type NodeData } from '../data/profile-source';
import { mapTime, nodeNeeds, runAt } from '../data/forecast';
import { loadSavedWeather, savedStep } from '../offline/saved-areas';
import { elevationMosaic, type Mosaic } from '../map/elevation';
import { levelLine, type LineKind } from '../map/freezing-line';
import { modelGround, nodeProfiles, packWind, screenWind, windComplete } from '../map/wind-field';
import { colorToken, type Theme } from '../theme/tokens';
import { hideRadar, showRadarFrame } from '../radar/frames';

// The map fill: the app's own renderer, fed grid fields for the view and
// the cursor's step. Fields come from the store first, then the adapter.
export const BC_BOX: [number, number, number, number] = [-139.1, 48.2, -114, 60];
export let precipLayer: TypedRateLayer;
export let tempLayer: TerrainTemperatureLayer;
export let windLayer: TerrainWindLayer;
export let flow: FlowCanvas;

/** Creates the fills and the flow once the map exists, and follows the map's moves. */
export function setupFills(): void {
precipLayer = new TypedRateLayer('precip-grid', precip.precipRenderStyle(app.settingsFor(precipitation).type as 'all' | 'rain' | 'snow'));
tempLayer = new TerrainTemperatureLayer('temperature-grid', temperatureRenderStyle(), PROFILE_LEVELS.length);
windLayer = new TerrainWindLayer('wind-grid', windRenderStyle(), PROFILE_LEVELS.length);
// Inside the map's canvas container, before the pin, so the pin stays on top.
flow = new FlowCanvas(S.map.getCanvasContainer(), S.map.getContainer());
S.map.on('resize', () => flow.resized());
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
watchMoves();
}
/** The flow's mode from the wind settings: animated, still arrows, or nothing. */
export const flowMode = (): FlowMode => { const s = app.settingsFor(wind); return s.flow ? 'flow' : s.arrows ? 'arrows' : 'off'; };
export let mosaic: Mosaic | null = null;
/** How far beyond each screen edge the temperature fill reaches, as a share of the screen. */
export const PAN_MARGIN = 0.35;
export const fieldStore = new MemoryStore<GridField>(48);
export let fillTimer = 0;
export let fillSeq = 0;

export function fieldKey(r: RunMetadata, t: Date, gridKey: string) {
  return `${r.model}|${r.referenceTime.toISOString()}|${t.toISOString()}|${gridKey}`;
}

type Box = [number, number, number, number];
export const covers = (a: Box, b: Box) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/** A saved area's field for this run and step, if it has one (and covers `need`, when given). */
export async function savedField(r: RunMetadata, t: Date, need: Box | null, overlap: Box): Promise<{ field: GridField; key: string } | null> {
  for (const a of S.savedParts) {
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
export async function getField(r: RunMetadata, t: Date, req: NonNullable<ReturnType<typeof gridRequest>>): Promise<{ field: GridField; key: string }> {
  const key = fieldKey(r, t, req.key);
  const hit = fieldStore.get(key);
  if (hit) return { field: hit, key: req.key };
  const saved = await savedField(r, t, req.bbox, req.bbox);
  if (saved) return saved;
  // Saved data only (no signal, or the switch): never wait on the network.
  if (S.usingSaved) {
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
export async function updateTemperature(r: RunMetadata, t: Date, mine: number, cachedOnly = false) {
  const view = marginView();
  if (!view) { tempLayer.setProfiles(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const set = app.settingsFor(temperature);
  const feels = set.map === 'feels';
  // Feels-like on the map needs each node's 10 m wind, 2 m air and humidity (dew point).
  const extra = nodeNeeds(temperature, feels);
  const [m, grid] = await Promise.all([elevationMosaic(view, S.map.getZoom(), mosaic), S.profiles.nodeGrid(r, lattice, t, extra, { cachedOnly })]);
  if (mine !== fillSeq || S.active.id !== 'temperature') return;
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
  const i = S.cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
  const next = S.cursor.allSteps[i + 1];
  const nextRun = next ? runAt(next, true) : null;
  if (next && nextRun) void S.profiles.nodeGrid(nextRun, lattice, next, extra).catch(() => undefined);
}

/** Nothing for the view because the forecast service said no for now: say so, and ask again when it may be asked. */
export let apiRetryTimer = 0;
export function unavailable(what: string) {
  const at = S.profiles.apiRetryAt;
  if (!at || S.usingSaved) { S.scrubber.setStatus(S.usingSaved ? `${what} is not saved for this area` : `${what} for this view is not available`); return; }
  S.scrubber.setStatus(`${what}: the forecast service is busy · trying again shortly`);
  clearTimeout(apiRetryTimer);
  apiRetryTimer = window.setTimeout(() => { S.scrubber.setStatus(''); void updateFills(); }, at - Date.now() + 500);
}

/** The model's ground under the mosaic, per mosaic and model grid (computed once each). */
export let windGround: { key: string; data: Float32Array } | null = null;

/** The wind fill: profiles at a lattice of nodes, wind at the terrain per pixel on the GPU, and the flow over it. */
export async function updateWind(r: RunMetadata, t: Date, mine: number, cachedOnly = false) {
  const view = marginView();
  if (!view) { windLayer.setProfiles(null); flow.setField(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const [m, grid] = await Promise.all([elevationMosaic(view, S.map.getZoom(), mosaic), S.profiles.nodeGrid(r, lattice, t, nodeNeeds(wind), { cachedOnly })]);
  if (mine !== fillSeq || S.active.id !== 'wind') return;
  if (!grid && cachedOnly) return;
  if (m !== mosaic) { mosaic = m; tempLayer.setElevation(m); }
  const profilesAt = grid ? nodeProfiles(grid) : null;
  if (!grid || !profilesAt || !windComplete(profilesAt)) {
    windLayer.setProfiles(null);
    flow.setField(null);
    unavailable('Wind');
    return;
  }
  const seg = segmentAt(S.timeline, t);
  const gridKm = (seg && REGISTRY[seg.model as ModelId]?.gridKm) || 2.5;
  const gkey = `${m.key}|${gridKm}`;
  if (windGround?.key !== gkey) windGround = { key: gkey, data: modelGround(m, gridKm) };
  windLayer.setElevation(m, windGround.data, gkey);
  windLayer.gusts = app.settingsFor(wind).map === 'gusts';
  windLayer.setProfiles(packWind(grid, profilesAt));
  document.body.dataset.fill = 'ready';
  // The flow and In view need the wind on screen: not while dragging (the release does it).
  if (!cachedOnly) {
    const c = S.map.getCanvas();
    const w = c.clientWidth, h = c.clientHeight;
    const sw = screenWind(grid, profilesAt, m, windGround.data, w, h, (x, y) => S.map.unproject([x, y]));
    flow.setField(sw.field);
    S.view = { cells: sw.cells.map((x) => ({ lon: x.lon, lat: x.lat, value: x.gust, second: x.dir })) };
    app.scheduleDetails();
  }
  const i = S.cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
  const next = S.cursor.allSteps[i + 1];
  const nextRun = next ? runAt(next, true) : null;
  if (next && nextRun) void S.profiles.nodeGrid(nextRun, lattice, next, nodeNeeds(wind)).catch(() => undefined);
}

/** The lattice of profile nodes over the screen plus the panning margin, and the box it covers. */
export function marginView(): Box | null {
  const b = S.map.getBounds();
  const padX = (b.getEast() - b.getWest()) * PAN_MARGIN;
  const padY = (b.getNorth() - b.getSouth()) * PAN_MARGIN;
  const view: Box = [Math.max(BC_BOX[0], b.getWest() - padX), Math.max(BC_BOX[1], b.getSouth() - padY), Math.min(BC_BOX[2], b.getEast() + padX), Math.min(BC_BOX[3], b.getNorth() + padY)];
  if (view[0] >= view[2] || view[1] >= view[3]) return null;
  // With saved data only, the fill covers the saved area in view (its nodes
  // must fall inside it, so the lattice is laid over the area, not the screen).
  if (S.usingSaved) {
    const overlap = (a: SavedArea): Box => [Math.max(a.bbox[0], view[0]), Math.max(a.bbox[1], view[1]), Math.min(a.bbox[2], view[2]), Math.min(a.bbox[3], view[3])];
    const size = (x: Box) => Math.max(0, x[2] - x[0]) * Math.max(0, x[3] - x[1]);
    const best = S.savedAreas.map(overlap).sort((x, y) => size(y) - size(x))[0];
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
export async function updatePrecipLine(r: RunMetadata, t: Date, mine: number, cachedOnly = false) {
  const kind = app.settingsFor(precipitation).line as string;
  const view = marginView();
  if (!view) { setLine(null, null); precipLayer.setShare(null); return; }
  const spacing = MODEL_SPACING_DEG[r.model] ?? 0.0225;
  const lattice = { lats: latticeAxis(view[1], view[3], spacing), lons: latticeAxis(view[0], view[2], spacing) };
  const [m, grid] = await Promise.all([elevationMosaic(view, S.map.getZoom(), mosaic), S.profiles.nodeGrid(r, lattice, t, nodeNeeds(precipitation), { cachedOnly })]);
  if (mine !== fillSeq || S.active.id !== 'precipitation') return;
  if (!grid && cachedOnly) return;
  if (!grid && S.profiles.apiRetryAt) { clearTimeout(apiRetryTimer); apiRetryTimer = window.setTimeout(() => void updateFills(), S.profiles.apiRetryAt - Date.now() + 500); }
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
    S.view.cells = S.view.cells.map((cell) => { const f = pick(cell.lon, cell.lat); return f === null ? cell : { ...cell, second: cell.value * f }; });
    app.scheduleDetails();
  }
}

export function packLattice(grid: NodeData) {
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


/** A dashed line from the node profiles over the terrain (0 °C, or the snow line), labelled with its height. */
export function setLine(grid: NodeData | null, kind: LineKind | null) {
  const src = S.map.getSource('freezing-line') as GeoJSONSource | undefined;
  const empty = { type: 'FeatureCollection' as const, features: [] };
  if (!grid || !mosaic) { src?.setData(empty); return null; }
  const res = levelLine(grid, mosaic, kind ?? '0c');
  src?.setData(kind ? res.features : empty);
  // In view: only what is on screen, not the panning margin.
  const b = S.map.getBounds();
  const onScreen = (c: { lon: number; lat: number }) => c.lon >= b.getWest() && c.lon <= b.getEast() && c.lat >= b.getSouth() && c.lat <= b.getNorth();
  const fl = grid.profiles.map((p) => freezingLevel(p)).filter((x): x is number => x !== null);
  S.view = {
    cells: S.active.id === 'temperature' ? res.cells.filter(onScreen) : S.view.cells,
    freezing: fl.length ? [Math.min(...fl), Math.max(...fl)] : undefined,
  };
  app.scheduleDetails();
  return res;
}

/**
 * `moving`: called during a drag. Profile nodes then come from memory only, so
 * a long pan does not fire request after request at the point API (it has a
 * per-minute limit); the release fetches what is new.
 */
export async function updateFills(moving = false) {
  if (!S.mapReady) return;
  S.air.update(S.active.id === airQuality.id, S.cursor.time ?? null, moving);
  if (S.active.frames) {
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
  hideRadar();
  // Avalanche: issued bulletins, not model grids; the weather fills step aside.
  S.avy.update(S.active.id === 'avalanche', S.cursor.time ?? new Date());
  if (S.active.id === 'avalanche' || S.active.id === airQuality.id) {
    flow.setShown(false);
    windLayer.visible = false;
    windLayer.setProfiles(null);
    tempLayer.visible = false;
    precipLayer.setFields([]);
    setLine(null, null);
    return;
  }
  if (!S.cursor.time) return;
  const when = mapTime(S.cursor.time);
  const at = runAt(when);
  if (!at) return;
  flow.setShown(S.active.id === 'wind' && S.threeD.flat());
  windLayer.visible = S.active.id === 'wind';
  if (S.active.id === 'wind') {
    precipLayer.setFields([]);
    tempLayer.visible = false;
    setLine(null, null);
    flow.setMode(flowMode());
    await updateWind(at, when, ++fillSeq, moving).catch((err) => console.error(err));
    return;
  }
  windLayer.setProfiles(null);
  if (S.active.id === 'temperature') {
    precipLayer.setFields([]);
    tempLayer.visible = true;
    await updateTemperature(at, when, ++fillSeq, moving).catch((err) => console.error(err));
    return;
  }
  tempLayer.visible = false;
  const b = S.map.getBounds();
  const req = gridRequest([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], S.map.getZoom(), BC_BOX);
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
    S.view = { ...S.view, cells };
    app.scheduleDetails();
    void updatePrecipLine(r, t, mine, moving).catch((err) => console.error(err));
    // Fetch the next step ahead of time, so playing and scrubbing stay smooth.
    const i = S.cursor.allSteps.findIndex((s) => s.getTime() === t.getTime());
    const next = S.cursor.allSteps[i + 1];
    const nextRun = next ? runAt(next, false) : null;
    if (next && nextRun) void getField(nextRun, next, req).catch(() => undefined);
  } catch (err) {
    console.error(err);
  }
}
export const scheduleFills = (ms: number) => { clearTimeout(fillTimer); fillTimer = window.setTimeout(() => void updateFills(), ms); };
let lastMoveFill = 0;
let moveFilling = false;
function watchMoves(): void {
S.map.on('moveend', () => { flow.setMoving(false); scheduleFills(150); });
S.map.on('movestart', () => flow.setMoving(true));
// During a long pan, refresh about twice a second rather than only on release.
S.map.on('move', () => {
  const now = performance.now();
  if (moveFilling || now - lastMoveFill < 500) return;
  lastMoveFill = now;
  moveFilling = true;
  void updateFills(true).finally(() => { moveFilling = false; });
});
}

/** The colours of the freezing or snow line and its label, for a theme. */
const linePaint = (t: Theme) => ({ freezing: colorToken('ink', t), label: colorToken('ink', t), halo: colorToken('surface', t) });

/** Theme changed: the line follows. */
export function recolourFills(t: Theme): void {
  const c = linePaint(t);
  if (S.map.getLayer('freezing-line')) S.map.setPaintProperty('freezing-line', 'line-color', c.freezing);
  if (S.map.getLayer('freezing-line-label')) { S.map.setPaintProperty('freezing-line-label', 'text-color', c.label); S.map.setPaintProperty('freezing-line-label', 'text-halo-color', c.halo); }
}

export function addFreezingLineLayers(beforeId?: string) {
  const c = linePaint(S.settings.theme());
  S.map.addSource('freezing-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  S.map.addLayer({ id: 'freezing-line', type: 'line', source: 'freezing-line', paint: { 'line-color': c.freezing, 'line-width': 1.5, 'line-opacity': 0.85, 'line-dasharray': [3, 2.5] } }, beforeId);
  S.map.addLayer({
    id: 'freezing-line-label', type: 'symbol', source: 'freezing-line',
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 12, 'symbol-spacing': 400, 'text-max-angle': 45, 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
  });
}

