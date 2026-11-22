// The saving engine behind "Save for offline" (docs/plans/offline-save.md):
// size estimate, a save that runs in the background with progress and cancel,
// the time range each layer can reach, and the saved list. No shell code: the
// card and the Notification Centre call these, and the app hands the engine
// what it needs once at start (configureSaveEngine). The calculations are in
// core/offline/save-plan.ts.
import type { StyleSpecification } from 'maplibre-gl';
import type { RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import { estimateSave as estimate, layerTimeRange as range, modelsFor, planSegments, type PlanContext, type PlanLayer } from '../../core/offline/save-plan';
import type { SavedArea } from '../../core/offline/saved-area';
import type { LayerChoice, LayerTimeRange, SaveEstimate, SaveJob, SaveProgress, SaveRequest, SaveShape } from '../../core/offline/save-request';
import { isAmount, type VariableName } from '../../core/vocabulary';
import type { Basemap } from '../map/basemap-router';
import { deleteArea, listSavedAreas, saveArea } from './saved-areas';

/** A layer the card can tick. `own`: a layer with its own source (radar, avalanche, air quality). */
export interface EngineLayer { id: string; needs: readonly VariableName[]; own?: PlanLayer['own'] }

export interface SaveEngineEnv {
  /** The current run of each model, by id ("hrdps", "rdps"…). */
  runs(): Record<string, RunMetadata | undefined>;
  /** The chain "auto" follows, best model first. */
  chain: readonly string[];
  layers(): EngineLayer[];
  /** Model cells covering a box, for the model with this id. */
  cells(model: string, bbox: SaveShape['bbox']): number;
  /** Maps' tilesForShape: the tiles touching the outline, zoom min to max (core/geo/shape-tiles.ts). */
  tilesForShape(shape: SaveShape, minZoom: number, maxZoom: number): [number, number, number][];
  /** Bytes of the stored base map tiles for these addresses, from the files' indexes. */
  storedBytes(tiles: [number, number, number][]): Promise<number>;
  basemap: Basemap;
  style(): StyleSpecification;
  now?(): Date;
  /** Called after the saved list changes, by a save or a delete (the app re-reads it). */
  afterChange?(area: SavedArea): void | Promise<void>;
  /** Replaces the real save (tests). */
  save?: typeof saveArea;
}

let env: SaveEngineEnv | null = null;
export function configureSaveEngine(e: SaveEngineEnv | null): void { env = e; }
const need = (): SaveEngineEnv => { if (!env) throw new Error('The saving engine is not set up yet'); return env; };

/** Terrain tiles are kept to this zoom and the base map to this one; the map bytes are counted at the same zooms. */
const MAP_MAX_ZOOM = 15;
const TERRAIN_AVG_BYTES = 1.4e5;
const TERRAIN_MAX_ZOOM = 12;

function context(e: SaveEngineEnv): PlanContext {
  const runs = Object.fromEntries(Object.entries(e.runs()).flatMap(([id, r]) => (r ? [[id, { model: id, referenceTime: r.referenceTime, validTimes: r.validTimes }]] : [])));
  return {
    now: e.now?.() ?? new Date(),
    runs,
    chain: e.chain,
    layers: Object.fromEntries(e.layers().map((l) => [l.id, { id: l.id, needs: l.needs, ...(l.own ? { own: l.own } : {}) }])),
    cells: (m, bbox) => e.cells(m, bbox),
    mapBytes: async (shape) => {
      const base = await e.storedBytes(e.tilesForShape(shape, 0, MAP_MAX_ZOOM));
      return base + e.tilesForShape(shape, 0, TERRAIN_MAX_ZOOM).length * TERRAIN_AVG_BYTES;
    },
  };
}

/** How far a layer can reach on the scrubber, with its age; null when it has no data. */
export function layerTimeRange(layer: string, model: LayerChoice['model']): LayerTimeRange | null {
  return range(layer, model, context(need()));
}

/** Size of a save before it starts, as the card asks it again whenever the shape, ticks, models or span change. */
export function estimateSave(req: SaveRequest): Promise<SaveEstimate> {
  return estimate(req, context(need()));
}

let counter = 0;

/** Start a save. It runs in the background: the card can close, and `done` resolves with the saved area's id. */
export function startSave(req: SaveRequest): SaveJob {
  const e = need();
  const id = `job${Date.now().toString(36)}${(counter++).toString(36)}`;
  const abort = new AbortController();
  const listeners = new Set<(p: SaveProgress) => void>();
  const emit = (p: SaveProgress) => listeners.forEach((fn) => fn(p));
  const done = (async () => {
    const ctx = context(e);
    const chosen = req.layers.map((c) => ({ choice: c, layer: e.layers().find((l) => l.id === c.layer) })).filter((x) => x.layer);
    if (!chosen.length) throw new Error('Choose a layer to save');
    // The models the save needs: the chain for "auto", else the ones named, in the chain's order.
    const ids = new Set<string>();
    for (const { choice, layer } of chosen) {
      if (layer!.own) continue;
      for (const run of modelsFor(choice.model, ctx)) ids.add(run.model);
    }
    const runs = e.chain.filter((m) => ids.has(m)).flatMap((m) => { const r = e.runs()[m]; return r ? [r] : []; });
    const weatherChosen = chosen.filter((x) => !x.layer!.own);
    if (weatherChosen.length && !runs.length) throw new Error('No forecast is available for those layers');
    if (weatherChosen.length && !planSegments(runs.map((r) => ({ model: r.model, referenceTime: r.referenceTime, validTimes: r.validTimes })), req.from, req.to).length) {
      throw new Error('The forecast does not reach that time span');
    }
    const needs = [...new Set(weatherChosen.flatMap((x) => x.layer!.needs))];
    const existing = await listSavedAreas();
    const area = await (e.save ?? saveArea)({
      bbox: req.shape.bbox, hours: null, span: { from: req.from, to: req.to }, shape: req.shape.outline,
      layerModels: req.layers.map((c) => ({ layer: c.layer, model: c.model })),
      runs, variables: needs.filter(isAmount), plainVariables: needs.filter((v) => !isAmount(v)),
      name: req.name ?? `Area ${existing.length + 1}`, layers: req.layers.map((c) => c.layer),
      basemap: e.basemap, style: e.style(), signal: abort.signal,
      tilesFor: (a, b) => e.tilesForShape(req.shape, a, b),
      onProgress: emit,
    });
    await e.afterChange?.(area);
    return area.id;
  })();
  // A save nobody awaits must not leave an unhandled rejection.
  done.catch(() => undefined);
  return {
    id, request: req, done, cancel: () => abort.abort(),
    onProgress: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/** The saved areas, newest first. */
export function listSaved(): Promise<SavedArea[]> { return listSavedAreas(); }

/** Remove a saved area and its files; resolves false when no such area exists. */
export async function deleteSaved(id: string): Promise<boolean> {
  const area = (await listSavedAreas()).find((a) => a.id === id);
  if (!area) return false;
  await deleteArea(area);
  await env?.afterChange?.(area);
  return true;
}
