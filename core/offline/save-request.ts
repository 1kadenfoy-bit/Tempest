// The contract for saving an area for offline use (docs/plans/offline-save.md).
// Types only, no logic: the drawing tool (Maps) makes a SaveShape, the card
// (Interface) builds a SaveRequest, the saving engine (Data) estimates and runs
// it, and the Notification Centre (Interface) shows the job's progress.
// Owned by Data; changes approved by the lead.

/** A point as [longitude, latitude], in degrees. */
export type LngLat = [number, number];

/**
 * A closed shape traced on the map with a finger. The outline is a ring of
 * points in order, not repeated at the end, simplified by the drawing tool
 * (Maps) to a few hundred points at most. Never crosses itself.
 */
export interface SaveShape {
  outline: LngLat[];
  /** [west, south, east, north] around the outline. Weather is saved for this box (Kaden, Nov 22). */
  bbox: [number, number, number, number];
}

/** A layer to save, and which model: one by name, or "auto" (each hour from the best model for it). */
export interface LayerChoice {
  layer: string;
  model: string | 'auto';
}

/** What the "Save for offline" card asks for. */
export interface SaveRequest {
  shape: SaveShape;
  layers: LayerChoice[];
  /** The time span to keep, both ends chosen on the scrubber (the start may be in the past). */
  from: Date;
  to: Date;
  /** What the saved list calls it: the place the shape is centred on, if one is named. */
  name?: string;
}

/** How long a layer's data can reach, for the scrubber's frame: from the earliest kept past to its model's end. */
export interface LayerTimeRange {
  layer: string;
  model: string | 'auto';
  earliest: Date;
  latest: Date;
  /** How old the layer's newest data is, in plain words ("2 h old"), as the status line says it. */
  age?: string;
}

export interface LayerEstimate {
  layer: string;
  bytes: number;
  /** The part of [from, to] this layer can cover. Radar, avalanche and air quality stop where their data stops. */
  covers: { from: Date; to: Date } | null;
  /** Why it covers less, or nothing, in plain words. */
  note?: string;
}

export interface SaveEstimate {
  /** The map pieces cut to the outline, and the terrain. */
  mapBytes: number;
  layers: LayerEstimate[];
  totalBytes: number;
}

/** A save running in the background. The Notification Centre listens to it. */
export interface SaveProgress {
  done: number;
  total: number;
  /** What it is doing now, in plain words ("Temperature, HRDPS"). */
  label: string;
}

export interface SaveJob {
  id: string;
  request: SaveRequest;
  onProgress(fn: (p: SaveProgress) => void): () => void;
  /** Resolves with the saved area's id when every file is written; rejects with a plain-words reason. */
  done: Promise<string>;
  cancel(): void;
}
