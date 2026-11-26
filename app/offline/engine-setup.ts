// Hands the saving engine (app/offline/engine.ts) what it needs from the app,
// once at start-up: the current runs, the model chain, the layers' needs, the
// model cells over a box, Maps' tiles for a shape, and the base map's sizes.
// Written by the lead when combining the offline-save work (Nov 26); the
// engine itself is Data's.
import { MODELS, type ModelId } from '../../adapters/openmeteo-maps/models';
import { tilesForShape } from '../../core/geo/shape-tiles';
import { coveringRanges } from '../../render/openmeteo-starter';
import { S } from '../state';
import { configureSaveEngine } from './engine';
import { afterSavedChange } from './wiring';

/** The chain "auto" follows: HRDPS, then RDPS past its end. GDPS waits: its saved steps do not match ("step size mismatch", Nov 26); Data to add it. */
const CHAIN: ModelId[] = ['hrdps', 'rdps'];

export function setupSaveEngine(): void {
  configureSaveEngine({
    runs: () => Object.fromEntries(CHAIN.map((m) => [m, S.runs[m]])),
    chain: CHAIN,
    layers: () => S.layers.map((l) => ({ id: l.id, needs: l.saveNeeds })),
    cells: (m, bbox) => coveringRanges(MODELS[m as ModelId].mapModel, bbox).reduce((n, r) => n * (r.end - r.start), 1),
    tilesForShape: (shape, lo, hi) => tilesForShape(shape, lo, hi).map((t) => [t.z, t.x, t.y] as [number, number, number]),
    storedBytes: (tiles) => S.basemap.storedBytes(tiles),
    basemap: S.basemap,
    style: () => S.map.getStyle(),
    afterChange: () => afterSavedChange(),
  });
}
