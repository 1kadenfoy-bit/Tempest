// Temperature profiles for the map's nodes and for the pin, through the one
// read path: memory, then a saved area, then the point API (every hour at
// once), then the map files (one hour at a time, slower). Layers never see
// which one answered; every value keeps its label.
import { fetchApiSeries } from '../../adapters/openmeteo-api/point-series';
import { stepFileUrl, type RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import { MODELS } from '../../adapters/openmeteo-maps/point-series';
import { areaContains, type SavedArea } from '../../core/offline/saved-area';
import { MemoryStore } from '../../core/store/memory-store';
import { isComplete, profileAt } from '../../core/temperature/profile';
import { newProfile, type NodeGrid, type Profile } from '../../core/temperature/toposcale';
import { PROFILE_LEVELS, PROFILE_RH_VARIABLES, PROFILE_VARIABLES, type PointSeries, type VariableName } from '../../core/vocabulary';
import { sampleNative, type NativeBox } from '../../render/openmeteo-starter';
import { coveringRanges, readBoxFast } from '../../render/openmeteo-starter/om-reader';
import { loadSavedWeather, savedStep } from '../offline/saved-areas';

/** What the pin needs beyond the profile: 2 m temperature and humidity (dew point) and 10 m wind (feels-like). */
export const SURFACE_VARIABLES: VariableName[] = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m'];
/** Everything the pin's cards use: the profile with humidity (snow line), and the surface values. */
export const PIN_VARIABLES: VariableName[] = [...PROFILE_VARIABLES, ...PROFILE_RH_VARIABLES, ...SURFACE_VARIABLES];

const nodeKey = (r: RunMetadata, lat: number, lon: number, set: string) => `${r.model}|${r.referenceTime.toISOString()}|${lat.toFixed(4)}|${lon.toFixed(4)}|${set}`;

/** Node profiles at one step, with any extra variables asked for (per node). */
export interface NodeData extends NodeGrid { values: Record<string, number>[] }

function profileFromBox(box: NativeBox, lat: number, lon: number): Profile {
  const p = newProfile(PROFILE_LEVELS.length);
  PROFILE_LEVELS.forEach((l, k) => {
    p.gh[k] = sampleNative(box, `geopotential_height_${l}hPa`, lat, lon);
    p.temp[k] = sampleNative(box, `temperature_${l}hPa`, lat, lon);
  });
  return p;
}

const complete = isComplete;

export interface Lattice { lats: number[]; lons: number[] }

export class ProfileSource {
  /** Every hour of one node's profile, from the point API. */
  private nodes = new MemoryStore<PointSeries>(400);
  /** One hour's profiles over a box, from the map files (the slow path). */
  private boxes = new MemoryStore<NativeBox>(24);
  /** Nodes the point API could not give (over its limit or offline): stop asking for a while. */
  private apiDownUntil = 0;

  constructor(private savedAreas: () => SavedArea[]) {}

  /**
   * The nodes' profiles at one step, or null when no source has them.
   * `extra`: more variables per node (humidity for the snow line, surface
   * values for the feels-like map); asked for only when a setting needs them,
   * to keep the point API's daily allowance.
   */
  async nodeGrid(run: RunMetadata, lattice: Lattice, t: Date, extra: readonly VariableName[] = []): Promise<NodeData | null> {
    const points = lattice.lats.flatMap((lat) => lattice.lons.map((lon) => ({ lat, lon })));
    const set = extra.join(',');
    const vars = [...PROFILE_VARIABLES, ...extra];
    const done = (profiles: Profile[], values: Record<string, number>[]): NodeData | null =>
      profiles.every(complete) && values.every((v) => extra.every((x) => Number.isFinite(v[x]))) ? { ...lattice, profiles, values } : null;
    const fromSeries = () => {
      const profiles: Profile[] = [];
      const values: Record<string, number>[] = [];
      for (const p of points) {
        const s = this.nodes.get(nodeKey(run, p.lat, p.lon, set));
        const i = s ? s.times.findIndex((x) => x.getTime() === t.getTime()) : -1;
        if (!s || i < 0) return null;
        profiles.push(profileAt(s.values, i));
        values.push(Object.fromEntries(extra.map((x) => [x, s.values[x]?.[i] ?? NaN])));
      }
      return done(profiles, values);
    };
    const fromBox = (box: NativeBox) => done(points.map((p) => profileFromBox(box, p.lat, p.lon)), points.map((p) => Object.fromEntries(extra.map((x) => [x, sampleNative(box, x, p.lat, p.lon)]))));
    // 1. Memory
    const mem = fromSeries();
    if (mem) return mem;
    // 2. A saved area holding this run's profiles for every node
    const saved = await this.savedBoxFor(run, t, (a) => points.every((p) => areaContains(a, p.lon, p.lat)), extra);
    const fromSaved = saved && fromBox(saved);
    if (fromSaved) return fromSaved;
    // 3. The point API: every hour for the missing nodes in one request
    if (Date.now() > this.apiDownUntil) {
      const missing = points.filter((p) => !this.nodes.has(nodeKey(run, p.lat, p.lon, set)));
      try {
        const got = await fetchApiSeries(run.model, run.referenceTime, vars, missing, run.validTimes);
        got.forEach((s, n) => this.nodes.put(nodeKey(run, missing[n]!.lat, missing[n]!.lon, set), s));
        const api = fromSeries();
        if (api) return api;
      } catch (err) {
        this.apiDownUntil = Date.now() + 10 * 60_000;
        console.warn('point API unavailable, reading the map files', err);
      }
    }
    // 4. The map files, this hour only
    const box = await this.fileBox(run, t, lattice, vars).catch(() => null);
    const fromFiles = box && fromBox(box);
    if (fromFiles) return fromFiles;
    // 5. A saved area that covers part of the view
    const partial = await this.savedBoxFor(run, t, (a) => points.some((p) => areaContains(a, p.lon, p.lat)), extra);
    return partial ? fromBox(partial) : null;
  }

  /** Pin series already read, so switching layers does not ask again. */
  private pins = new MemoryStore<PointSeries>(8);

  /** The pin's series: every hour, profile and surface values, from its nearest model cell. */
  async pinSeries(run: RunMetadata, lat: number, lon: number, onPartial?: (s: PointSeries) => void): Promise<PointSeries> {
    const key = `${run.model}|${run.referenceTime.toISOString()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    const hit = this.pins.get(key);
    if (hit) return hit;
    const s = await this.readPin(run, lat, lon, onPartial);
    this.pins.put(key, s);
    return s;
  }

  private async readPin(run: RunMetadata, lat: number, lon: number, onPartial?: (s: PointSeries) => void): Promise<PointSeries> {
    // Saved first when the run is a saved one (no signal), else the API.
    const fromSaved = await this.savedSeries(run, lat, lon);
    if (fromSaved) return fromSaved;
    if (Date.now() > this.apiDownUntil) {
      try {
        const [s] = await fetchApiSeries(run.model, run.referenceTime, PIN_VARIABLES, [{ lat, lon }], run.validTimes);
        return s!;
      } catch (err) {
        this.apiDownUntil = Date.now() + 10 * 60_000;
        console.warn('point API unavailable, reading the map files', err);
      }
    }
    return this.fileSeries(run, lat, lon, onPartial);
  }

  private async savedBoxFor(run: RunMetadata, t: Date, fits: (a: SavedArea) => boolean, extra: readonly VariableName[] = []): Promise<NativeBox | null> {
    for (const a of this.savedAreas()) {
      if (a.weather.model !== run.model || new Date(a.weather.run).getTime() !== run.referenceTime.getTime()) continue;
      if (!a.weather.files['temperature_850hPa'] || !extra.every((x) => a.weather.files[x]) || !fits(a)) continue;
      const w = await loadSavedWeather(a).catch(() => null);
      const i = w ? w.times.findIndex((x) => x.getTime() === t.getTime()) : -1;
      if (w && i >= 0) return savedStep(w, i);
    }
    return null;
  }

  private async savedSeries(run: RunMetadata, lat: number, lon: number): Promise<PointSeries | null> {
    for (const a of this.savedAreas()) {
      if (!areaContains(a, lon, lat) || new Date(a.weather.run).getTime() !== run.referenceTime.getTime()) continue;
      if (!a.weather.files['temperature_850hPa']) continue;
      const w = await loadSavedWeather(a).catch(() => null);
      if (!w) continue;
      const values = Object.fromEntries(PIN_VARIABLES.map((v) => [v, w.times.map((_, i) => sampleNative(savedStep(w, i), v, lat, lon))]));
      return {
        label: { source: a.weather.source, model: a.weather.model, run: new Date(a.weather.run), gridKm: MODELS[a.weather.model]?.gridKm ?? NaN, licence: '', attribution: '', fetchedAt: new Date(a.savedAt), offline: true },
        lat, lon, times: w.times, stepHours: a.weather.stepHours, values,
      };
    }
    return null;
  }

  private async fileBox(run: RunMetadata, t: Date, lattice: Lattice, vars: VariableName[]): Promise<NativeBox | null> {
    const bbox: [number, number, number, number] = [lattice.lons[0]!, lattice.lats[0]!, lattice.lons[lattice.lons.length - 1]!, lattice.lats[lattice.lats.length - 1]!];
    // Wide views would read most of the model's grid each hour: too slow without the API.
    if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 6) return null;
    const key = `${run.model}|${run.referenceTime.toISOString()}|${t.toISOString()}|${bbox.join(',')}|${vars.length}`;
    const hit = this.boxes.get(key);
    if (hit) return hit;
    const box = await readBoxFast(run.model, stepFileUrl(run.model, run.referenceTime, t), vars, coveringRanges(run.model, bbox, 0.03));
    this.boxes.put(key, box);
    return box;
  }

  /** The slow path: one file per hour, the cursor's hours first, reported as they arrive. */
  private async fileSeries(run: RunMetadata, lat: number, lon: number, onPartial?: (s: PointSeries) => void): Promise<PointSeries> {
    const times = run.validTimes;
    const ranges = coveringRanges(run.model, [lon, lat, lon, lat], 0.03);
    const values = Object.fromEntries(PIN_VARIABLES.map((v) => [v, new Array<number>(times.length).fill(NaN)])) as PointSeries['values'];
    const series: PointSeries = {
      label: { source: 'openmeteo-maps', model: run.model, run: run.referenceTime, gridKm: MODELS[run.model]?.gridKm ?? NaN, licence: 'CC BY 4.0', attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)', fetchedAt: new Date(), offline: true },
      lat, lon, times: [...times], stepHours: 1, values,
    };
    const snapshot = (): PointSeries => ({ ...series, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, [...v]])) });
    // Nearest hours to now first, so the readout fills in early.
    const now = Date.now();
    const order = times.map((t, i) => ({ i, d: Math.abs(t.getTime() - now) })).sort((a, b) => a.d - b.d).map((x) => x.i);
    let next = 0;
    let lastReport = 0;
    const worker = async () => {
      while (next < order.length) {
        const i = order[next++]!;
        const box = await readBoxFast(run.model, stepFileUrl(run.model, run.referenceTime, times[i]!), PIN_VARIABLES, ranges);
        for (const v of PIN_VARIABLES) values[v]![i] = sampleNative(box, v, lat, lon);
        // A fresh copy each time: readers may cache by object.
        if (onPartial && Date.now() - lastReport > 500) { lastReport = Date.now(); onPartial(snapshot()); }
      }
    };
    await Promise.all([worker(), worker()]);
    return snapshot();
  }
}

/** The lattice spacing floor: the model's own grid (2.5 km ≈ 0.0225°). */
export const MODEL_SPACING_DEG: Record<string, number> = { cmc_gem_hrdps: 0.0225 };
