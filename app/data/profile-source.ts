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
import { PROFILE_LEVELS, PROFILE_VARIABLES, type PointSeries, type VariableName } from '../../core/vocabulary';
import { sampleNative, type NativeBox } from '../../render/openmeteo-starter';
import { coveringRanges, readBoxFast } from '../../render/openmeteo-starter/om-reader';
import { loadSavedWeather, savedStep } from '../offline/saved-areas';

/** What the pin needs beyond the profile: 2 m temperature and humidity (dew point) and 10 m wind (feels-like). */
export const SURFACE_VARIABLES: VariableName[] = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m'];
export const PIN_VARIABLES: VariableName[] = [...PROFILE_VARIABLES, ...SURFACE_VARIABLES];

const nodeKey = (r: RunMetadata, lat: number, lon: number) => `${r.model}|${r.referenceTime.toISOString()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;

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

  /** The nodes' profiles at one step, or null when no source has them. */
  async nodeGrid(run: RunMetadata, lattice: Lattice, t: Date): Promise<NodeGrid | null> {
    const points = lattice.lats.flatMap((lat) => lattice.lons.map((lon) => ({ lat, lon })));
    const fromSeries = () => {
      const profiles: Profile[] = [];
      for (const p of points) {
        const s = this.nodes.get(nodeKey(run, p.lat, p.lon));
        const i = s ? s.times.findIndex((x) => x.getTime() === t.getTime()) : -1;
        if (!s || i < 0) return null;
        const prof = profileAt(s.values, i);
        if (!complete(prof)) return null;
        profiles.push(prof);
      }
      return profiles;
    };
    // 1. Memory
    let profiles = fromSeries();
    if (profiles) return { ...lattice, profiles };
    // 2. A saved area holding this run's profiles for every node
    const saved = await this.savedBoxFor(run, t, (a) => points.every((p) => areaContains(a, p.lon, p.lat)));
    if (saved) return { ...lattice, profiles: points.map((p) => profileFromBox(saved, p.lat, p.lon)) };
    // 3. The point API: every hour for the missing nodes in one request
    if (Date.now() > this.apiDownUntil) {
      const missing = points.filter((p) => !this.nodes.has(nodeKey(run, p.lat, p.lon)));
      try {
        const got = await fetchApiSeries(run.model, run.referenceTime, PROFILE_VARIABLES, missing, run.validTimes);
        got.forEach((s, n) => this.nodes.put(nodeKey(run, missing[n]!.lat, missing[n]!.lon), s));
        profiles = fromSeries();
        if (profiles) return { ...lattice, profiles };
      } catch (err) {
        this.apiDownUntil = Date.now() + 10 * 60_000;
        console.warn('point API unavailable, reading the map files', err);
      }
    }
    // 4. The map files, this hour only
    const box = await this.fileBox(run, t, lattice).catch(() => null);
    if (box) {
      profiles = points.map((p) => profileFromBox(box, p.lat, p.lon));
      if (profiles.every(complete)) return { ...lattice, profiles };
    }
    // 5. A saved area that covers part of the view
    const partial = await this.savedBoxFor(run, t, (a) => points.some((p) => areaContains(a, p.lon, p.lat)));
    if (partial) {
      profiles = points.map((p) => profileFromBox(partial, p.lat, p.lon));
      if (profiles.every(complete)) return { ...lattice, profiles };
    }
    return null;
  }

  /** The pin's series: every hour, profile and surface values, from its nearest model cell. */
  async pinSeries(run: RunMetadata, lat: number, lon: number, onPartial?: (s: PointSeries) => void): Promise<PointSeries> {
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

  private async savedBoxFor(run: RunMetadata, t: Date, fits: (a: SavedArea) => boolean): Promise<NativeBox | null> {
    for (const a of this.savedAreas()) {
      if (a.weather.model !== run.model || new Date(a.weather.run).getTime() !== run.referenceTime.getTime()) continue;
      if (!a.weather.files['temperature_850hPa'] || !fits(a)) continue;
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

  private async fileBox(run: RunMetadata, t: Date, lattice: Lattice): Promise<NativeBox | null> {
    const bbox: [number, number, number, number] = [lattice.lons[0]!, lattice.lats[0]!, lattice.lons[lattice.lons.length - 1]!, lattice.lats[lattice.lats.length - 1]!];
    // Wide views would read most of the model's grid each hour: too slow without the API.
    if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 6) return null;
    const key = `${run.model}|${run.referenceTime.toISOString()}|${t.toISOString()}|${bbox.join(',')}`;
    const hit = this.boxes.get(key);
    if (hit) return hit;
    const box = await readBoxFast(run.model, stepFileUrl(run.model, run.referenceTime, t), PROFILE_VARIABLES, coveringRanges(run.model, bbox, 0.03));
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
