// The app's shared state and the calls the parts make on each other.
//
// app/main.ts starts the app: it creates these once, in order, then each part
// (map, weather fills, forecast data, interface, offline, safety layers) reads
// and changes the state here and redraws through `app`. Parts never import
// main.ts. Owned by the lead (docs/sections/README.md): a section that needs a
// new field or call says so in its handoff note.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TimeCursor } from '../core/time/cursor';
import type { Timeline } from '../core/time/timeline';
import type { PointSeries } from '../core/vocabulary';
import type { SavedArea } from '../core/offline/saved-area';
import type { MemoryStore } from '../core/store/memory-store';
import type { RunMetadata } from '../adapters/openmeteo-maps/run-metadata';
import type { ModelId } from '../adapters/openmeteo-maps/models';
import type { LayerSlots, PinData, ViewSample } from '../layers/contract';
import type { Prefs } from './shell/prefs';
import type { setupScrubber } from './shell/scrubber';
import type { setupSheet } from './shell/sheet';
import type { createPin } from './shell/pin';
import type { AppSettings } from './settings/app-settings';
import type { Basemap } from './map/basemap-router';
import type { ProfileSource } from './data/profile-source';
import type { setupStations } from './stations/stations';
import type { setupAir } from './air/air';
import type { setupAvalanche } from './avalanche/avalanche';
import type { setupThreeD } from './map/three-d';

export interface AppState {
  prefs: Prefs;
  settings: AppSettings;
  basemap: Basemap;
  map: MapLibreMap;
  /** True once the map's style has loaded and every layer is added. */
  mapReady: boolean;
  /** One time cursor for the whole app. */
  cursor: TimeCursor;
  scrubber: ReturnType<typeof setupScrubber>;
  pin: ReturnType<typeof createPin>;
  sheet: ReturnType<typeof setupSheet> | null;

  /** The condition layers that work, in menu order; one is shown at a time. */
  layers: LayerSlots[];
  active: LayerSlots;

  // The forecast: each model's newest run, the time line joining them, the pin's series.
  runs: Partial<Record<ModelId, RunMetadata>>;
  /** GDPS's separate profile files (its 3-hourly steps), by model. */
  profileRuns: Partial<Record<ModelId, RunMetadata>>;
  timeline: Timeline;
  /** The first model's run on the time line (saving, offline). */
  run: RunMetadata | null;
  /** The hours before the forecast the cursor can reach (pin only). */
  pastSteps: Date[];
  series: PointSeries | null;
  /** True when the runs come from a saved area (no signal, or saved data only). */
  usingSaved: boolean;
  /** Observed precipitation at the pin for the week's past (HRDPA), online only. */
  observed: PinData['observed'];
  /** The model's own ground near the pin, per model (wind reads the terrain against it). */
  pinGround: { key: string; values: Record<string, number> };
  profiles: ProfileSource;
  /** Pin series by layer, place and runs. */
  store: MemoryStore<PointSeries>;

  savedAreas: SavedArea[];
  /** Each saved model run as an area of its own (HRDPS, then RDPS past its end). */
  savedParts: SavedArea[];

  /** What the map holds now, for the details' In view line. */
  view: { cells: ViewSample['cells']; freezing?: [number, number] | undefined };

  // Features with their own map wiring (set up by main.ts, used by others).
  stations: ReturnType<typeof setupStations>;
  air: ReturnType<typeof setupAir>;
  avy: ReturnType<typeof setupAvalanche>;
  threeD: ReturnType<typeof setupThreeD>;
}

/** Calls between the parts. Each is set once by the part that owns it. */
export interface AppCalls {
  settingsFor(l: LayerSlots): Record<string, string | boolean>;
  setLayerSetting(l: LayerSlots, key: string, v: string | boolean): void;
  setActive(l: LayerSlots): void;
  pinData(): PinData;
  seriesIndex(): number;
  showLayer(): void;
  renderLegend(): void;
  renderRunAge(): void;
  renderReadout(): void;
  scheduleDetails(): void;
  renderDetails(): void;
  /** Redraw the forecast summary window, when it is open. */
  refreshSummary(): void;
  rebuildTimeline(): void;
  updateFills(moving?: boolean): Promise<void>;
  loadRun(): Promise<void>;
  loadSeries(): Promise<void>;
  loadSummarySeries(): Promise<void>;
  loadPinGround(): Promise<void>;
  loadRadarFrames(force?: boolean): Promise<void>;
  scheduleRadarPin(): void;
  /** Radar: the cursor steps through the frames ECCC holds. */
  setFrameSteps(): void;
  rememberPin(p: { lng: number; lat: number; name: string | null }): void;
  /** True when the summary window is open and shows this layer. */
  summaryWants(l: LayerSlots): boolean;
}

/** Filled in by app/main.ts before anything reads it. */
export const S = {} as AppState;
/** Filled in by each part's setup before the app starts drawing. */
export const app = {} as AppCalls;

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
