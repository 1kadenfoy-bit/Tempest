// The Air quality layer's map wiring: the PM2.5 fill for the hour under the
// cursor (ECCC's RAQDPS, or CAMS global from the source button), the pin's
// hourly series, the nearest station's AQHI as ECCC issues it, and BC
// Wildfire Service's fires (app/air/fires.ts). It hands what it holds to the
// layer through core/air/state; the layer never sees a provider.
//
// The layer's hours are its source's own (ECCC: two days back through the
// earlier runs it keeps, to 72 h ahead; CAMS: two days back to about 4½
// days ahead), so the one cursor steps through them while it is shown.
//
// Online only. Asked politely: one question at a time per kind, the map's
// box snapped to whole degrees and kept in memory, ECCC's hours asked again
// every 10 minutes, the AQHI every 15, the fires every 30.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { TypedRateLayer } from '../../render/grid-gl/typed-rate-layer';
import { airDrawField, airRenderStyle } from '../../layers/air-quality';
import { airState, setAirState, type AirSource } from '../../core/air/state';
import type { GridField, PointSeries } from '../../core/vocabulary';
import { formatRunAge, runAgeHours } from '../../core/time/run-age';
import { formatWhen } from '../../core/units/format';
import * as raqdps from '../../adapters/eccc-geomet/raqdps';
import * as cams from '../../adapters/openmeteo-air/cams';
import * as aqhi from '../../adapters/eccc-aqhi/aqhi';
import { failureReason, fetchKept } from '../data/kept-fetch';
import { savedOnlyActive } from '../data/connection';
import type { SourceRow } from '../shell/model-menu';
import type { Theme } from '../theme/tokens';
import { setupFires } from './fires';

export type AirSourceId = 'eccc' | 'cams';

export interface AirOptions {
  theme(): Theme;
  settings(): Record<string, string | boolean>;
  /** The source chosen in the source menu (remembered by the app). */
  sourceId(): string;
  pin(): { lat: number; lon: number } | null;
  /** The source's hours changed: the cursor should step through them again. */
  onSteps(): void;
  /** New values: the readout, chart and details redraw. */
  onData(): void;
}

/** Where the fill's data may be asked for (BC and its neighbours). */
const LIMIT: [number, number, number, number] = [-140, 47, -113, 61];
const TIMES_TTL = 10 * 60_000;
const AQHI_TTL = 15 * 60_000;

const sourceFor = (id: AirSourceId, smoke: boolean): AirSource => (id === 'cams'
  ? { id: 'cams', label: 'CAMS global via Open-Meteo', short: 'CAMS', gridKm: 40, variable: 'pm2_5', model: 'CAMS global' }
  : { id: 'eccc', label: 'ECCC RAQDPS (FireWork)', short: 'ECCC', gridKm: 10, variable: smoke ? 'pm2_5_smoke' : 'pm2_5', model: 'ECCC RAQDPS' });

export function setupAir(map: MapLibreMap, opts: AirOptions) {
  const fill = new TypedRateLayer('air-grid', airRenderStyle());
  let active = false;
  let cursor: Date | null = null;
  let steps: Date[] = [];
  let stepsKey = '';
  let failure: string | null = null;

  const online = () => navigator.onLine && !savedOnlyActive();
  const chosen = (): AirSourceId => (opts.sourceId() === 'cams' ? 'cams' : 'eccc');
  const src = () => sourceFor(chosen(), opts.settings().shown !== 'all');
  const variable = () => src().variable;

  const fires = setupFires(map, {
    theme: opts.theme,
    online,
    onData: (list, fetchedAt, kept) => { setAirState({ fires: list && fetchedAt ? { list, fetchedAt, kept } : null }); opts.onData(); },
  });

  // ---- The source's hours -----------------------------------------------------
  const ecccTimes = new Map<string, { at: number; times: raqdps.RaqdpsTimes }>();
  let timesLoading: Promise<void> | null = null;

  function setSteps(next: Date[]) {
    const key = next.length ? `${next[0]!.toISOString()}|${next.length}` : '';
    steps = next;
    if (key !== stepsKey) { stepsKey = key; opts.onSteps(); }
  }

  async function loadTimes(force = false): Promise<void> {
    if (chosen() === 'cams') {
      const block = pinBlock;
      setSteps(cams.stepsFor(block ? { times: block.times, values: block.values.pm2_5 ?? [] } : null, new Date()));
      return;
    }
    const layer = raqdps.LAYERS[variable() as raqdps.RaqdpsVariable];
    const had = ecccTimes.get(layer);
    if (had && !force && Date.now() - had.at < TIMES_TTL) { setSteps(raqdps.stepsFor(had.times, new Date())); return; }
    if (!online()) { failure = 'needs a connection'; setSteps([]); return; }
    if (timesLoading) return timesLoading;
    timesLoading = (async () => {
      try {
        const times = await raqdps.fetchTimes(layer);
        ecccTimes.set(layer, { at: Date.now(), times });
        failure = null;
        setAirState({ run: times.runs[times.runs.length - 1] ?? null, fetchedAt: new Date() });
        setSteps(raqdps.stepsFor(times, new Date()));
      } catch (err) {
        console.warn('ECCC air quality hours unavailable', err);
        failure = failureReason(err);
        if (!had) setSteps([]);
      } finally {
        timesLoading = null;
        opts.onData();
      }
    })();
    return timesLoading;
  }
  const timesNow = () => ecccTimes.get(raqdps.LAYERS[variable() as raqdps.RaqdpsVariable])?.times ?? null;

  // ---- The map fill -------------------------------------------------------------
  const fields = new Map<string, Promise<GridField | null>>();
  const camsBlocks = new Map<string, Promise<cams.CamsBlock | null>>();
  let fillSeq = 0;

  const remember = <T>(m: Map<string, T>, key: string, make: () => T, max = 48): T => {
    const hit = m.get(key);
    if (hit) return hit;
    const v = make();
    m.set(key, v);
    if (m.size > max) m.delete(m.keys().next().value!);
    return v;
  };

  function viewBox(margin = 0.25): [number, number, number, number] {
    const b = map.getBounds();
    const px = (b.getEast() - b.getWest()) * margin, py = (b.getNorth() - b.getSouth()) * margin;
    return [b.getWest() - px, b.getSouth() - py, b.getEast() + px, b.getNorth() + py];
  }

  function ecccField(t: Date): Promise<GridField | null> | null {
    const times = timesNow();
    const run = times ? raqdps.runFor(times, t) : null;
    const box = raqdps.boxFor(viewBox(), LIMIT);
    if (!run || !box) return null;
    const v = variable() as raqdps.RaqdpsVariable;
    const key = `${v}|${run.toISOString()}|${t.toISOString()}|${box.key}`;
    return remember(fields, key, () => raqdps.fetchField(v, box, t, run).catch((err) => { fields.delete(key); console.warn('no smoke field', err); return null; }));
  }

  function camsBlockFor(box: [number, number, number, number]): { key: string; block: Promise<cams.CamsBlock | null> } | null {
    const g = cams.gridFor(box);
    if (!g) return null;
    const { from, to } = cams.dateRange(new Date());
    const key = `${g.key}|${from.toISOString().slice(0, 10)}`;
    return {
      key,
      block: remember(camsBlocks, key, () => fetch(cams.gridUrl(g, from, to), { signal: AbortSignal.timeout(30_000) })
        .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return cams.parseGrid(await r.json(), g); })
        .catch((err) => { camsBlocks.delete(key); console.warn('no CAMS grid', err); return null; }), 8),
    };
  }

  async function showFill(t: Date, moving: boolean) {
    const mine = ++fillSeq;
    if (!online()) { fill.setFields([]); setAirState({ view: [] }); return; }
    let field: GridField | null = null;
    let gridKey = '';
    if (chosen() === 'cams') {
      const got = moving ? null : camsBlockFor(viewBox(0.15));
      const block = got ? await got.block : null;
      if (mine !== fillSeq) return;
      if (block) {
        const i = block.times.findIndex((x) => x.getTime() === t.getTime());
        field = i >= 0 ? cams.fieldAt(block, i) : null;
        gridKey = got!.key;
      } else if (moving) return;
    } else {
      const p = moving ? null : ecccField(t);
      if (moving) return;
      field = p ? await p : null;
      if (mine !== fillSeq) return;
      gridKey = field ? `${field.bbox.join(',')}@${field.nx}` : '';
      // The next hour ahead of time, so playing and scrubbing stay smooth.
      const next = steps[steps.findIndex((s) => s.getTime() === t.getTime()) + 1];
      if (next) void ecccField(next);
    }
    if (!active) return;
    fill.setFields(field ? [airDrawField(field, gridKey)] : []);
    document.body.dataset.airFill = field ? 'ready' : 'none';
    // In view: the cells on screen.
    const b = map.getBounds();
    const cells: { lon: number; lat: number; value: number }[] = [];
    if (field) {
      const v = field.values.pm2_5_smoke ?? field.values.pm2_5;
      for (let j = 0; j < field.ny; j++) {
        const lat = field.bbox[1] + ((j + 0.5) / field.ny) * (field.bbox[3] - field.bbox[1]);
        if (lat < b.getSouth() || lat > b.getNorth()) continue;
        for (let i = 0; i < field.nx; i++) {
          const lon = field.bbox[0] + ((i + 0.5) / field.nx) * (field.bbox[2] - field.bbox[0]);
          const x = v?.[j * field.nx + i];
          if (lon >= b.getWest() && lon <= b.getEast() && x !== undefined && Number.isFinite(x)) cells.push({ lon, lat, value: x });
        }
      }
    }
    setAirState({ view: cells });
    opts.onData();
  }

  // ---- The pin --------------------------------------------------------------------
  let pinKey = '';
  let pinBlock: { times: Date[]; values: PointSeries['values'] } | null = null;
  let pinSeq = 0;

  async function loadPin(force = false) {
    const p = opts.pin();
    if (!p) return;
    const s = src();
    if (!online()) { setAirState({ series: null, problem: 'Air quality needs a connection' }); return; }
    const times = s.id === 'eccc' ? timesNow() : null;
    if (s.id === 'eccc' && !times) return;
    const key = `${s.id}|${s.variable}|${times?.runs.at(-1)?.toISOString() ?? new Date().toISOString().slice(0, 13)}|${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    if (key === pinKey && !force) return;
    pinKey = key;
    const mine = ++pinSeq;
    setAirState({ series: null, problem: null });
    opts.onData();
    try {
      let series: PointSeries;
      if (s.id === 'eccc') {
        series = await raqdps.fetchPointSeries(s.variable as raqdps.RaqdpsVariable, times!, steps.length ? steps : raqdps.stepsFor(times!, new Date()), p.lat, p.lon, fetch, 6);
      } else {
        const { from, to } = cams.dateRange(new Date());
        const res = await fetch(cams.pointUrl(p.lat, p.lon, from, to), { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        series = cams.parsePoint(await res.json(), p.lat, p.lon);
        pinBlock = { times: series.times, values: series.values };
        setAirState({ fetchedAt: new Date() });
        void loadTimes();
      }
      if (mine !== pinSeq) return;
      setAirState({ series, problem: series.times.length ? null : 'No values at the pin' });
      document.body.dataset.airSeries = 'ready';
    } catch (err) {
      if (mine !== pinSeq) return;
      pinKey = '';
      console.warn('no air quality at the pin', err);
      setAirState({ series: null, problem: `${s.short} did not answer (${failureReason(err)})` });
      document.body.dataset.airSeries = 'error';
    }
    opts.onData();
  }

  // ---- AQHI, as issued ---------------------------------------------------------------
  let aqhiKey = '';
  let aqhiAt = 0;
  async function loadAqhi() {
    const p = opts.pin();
    if (!p) return;
    const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    if (key === aqhiKey && Date.now() - aqhiAt < AQHI_TTL) return;
    aqhiKey = key;
    aqhiAt = Date.now();
    try {
      if (!online()) throw new Error('offline');
      const obs = await fetchKept(aqhi.observationsUrl(p.lat, p.lon), 'aqhi-observations');
      const near = aqhi.parseObservations(obs.json, p.lat, p.lon);
      const first = near[0] ?? null;
      let forecast = null;
      if (first) {
        const fc = await fetchKept(aqhi.forecastsUrl(first.stationId), 'aqhi-forecast').catch(() => null);
        forecast = fc ? aqhi.parseForecast(fc.json, first) : null;
      }
      if (key !== aqhiKey) return;
      setAirState({ aqhi: { observed: first, forecast, fetchedAt: obs.fetchedAt, link: aqhi.PUBLIC_PAGE } });
    } catch (err) {
      console.warn('no AQHI', err);
      aqhiAt = 0;
      setAirState({ aqhi: 'error' });
    }
    document.body.dataset.airAqhi = 'ready';
    opts.onData();
  }

  // ---- The layer on screen ------------------------------------------------------------
  function sync() {
    const s = opts.settings();
    fires.update(active && s.fires !== false, s.perimeters !== false, cursor);
    setAirState({ firesShown: s.fires !== false });
  }

  /** Called with every fill update: the layer is on screen (or not), at this cursor time. */
  function update(isActive: boolean, t: Date | null, moving = false) {
    const was = active;
    active = isActive;
    cursor = t;
    const p = opts.pin();
    setAirState({ source: src(), cursor: t, pin: p ? { lat: p.lat, lon: p.lon } : null });
    sync();
    if (!active) {
      if (was) { fill.setFields([]); ++fillSeq; }
      return;
    }
    void loadTimes();
    if (!moving) { void loadPin(); void loadAqhi(); }
    if (t) void showFill(t, moving);
  }

  return {
    addLayers(fillBefore?: string, marksBefore?: string) {
      map.addLayer(fill, fillBefore);
      fires.addLayers(marksBefore);
    },
    update,
    /** The source's hours, for the cursor (empty until known). */
    steps: () => steps,
    /** The time line's cursor time moved without a fill update (the readout reads it). */
    setCursor(t: Date | null) { cursor = t; setAirState({ cursor: t }); },
    pinMoved() { if (active) { void loadPin(); void loadAqhi(); } },
    tapped: (point: { x: number; y: number }) => fires.tapped(point),
    recolour: (t: Theme) => fires.recolour(t),
    /** A setting or the source changed: the hours, the fill and the pin follow. */
    changed() {
      pinKey = '';
      pinBlock = null;
      fill.setFields([]);
      setAirState({ source: src(), series: null, problem: null, view: [], run: null, fetchedAt: null });
      if (active) { void loadTimes(); void loadPin(); }
      sync();
    },
    short: () => src().short,
    /** The top bar's line: the run and its age, or why there is none. */
    ageLine(): { text: string; stale: boolean } {
      const s = src();
      if (!online()) return { text: 'Air quality needs a connection', stale: true };
      if (s.id === 'eccc') {
        const run = timesNow()?.runs.at(-1);
        if (!run) return failure ? { text: `ECCC did not answer (${failure}) · tap to retry`, stale: true } : { text: 'Finding ECCC’s air quality runs…', stale: false };
        return { text: formatRunAge(run, new Date()), stale: runAgeHours(run, new Date()) >= 24 };
      }
      const at = airState().fetchedAt;
      return { text: at ? `Fetched ${formatWhen(at, new Date())} · 40 km` : 'Asking Open-Meteo…', stale: false };
    },
    needsRetry: () => (src().id === 'eccc' && !timesNow()) || fires.failure !== null,
    retry() { void loadTimes(true); pinKey = ''; void loadPin(true); fires.retry(); },
    /** The source menu's rows. */
    sourceRows(): SourceRow[] {
      const run = ecccTimes.get(raqdps.LAYERS.pm2_5_smoke)?.times.runs.at(-1) ?? ecccTimes.get(raqdps.LAYERS.pm2_5)?.times.runs.at(-1);
      return [
        { id: 'eccc', label: 'ECCC RAQDPS (FireWork)', detail: 'Smoke forecast · 10 km · 72 h', age: run ? formatRunAge(run, new Date()).replace(' · ', ', ') : 'online', current: chosen() === 'eccc' },
        { id: 'cams', label: 'CAMS global', detail: 'All PM2.5 · 40 km · via Open-Meteo', age: 'online', current: chosen() === 'cams' },
      ];
    },
  };
}
