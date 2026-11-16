// The app's variable vocabulary: one name, one unit, one meaning. Adapters
// convert into it; nothing downstream converts again except for display.
// Amounts are per model step, never running totals. Times are UTC.

export const VOCABULARY = {
  precipitation: { unit: 'mm per step', meaning: 'Liquid-equivalent precipitation that fell during the step' },
  snowfall_water_equivalent: { unit: 'mm per step', meaning: 'The part of precipitation that fell as snow, as water' },
} as const;

export type VariableName = keyof typeof VOCABULARY;

/** The label every value carries (architecture: data contract). */
export interface ValueLabel {
  source: string;
  model: string;
  run: Date;
  gridKm: number;
  licence: string;
  attribution: string;
  fetchedAt: Date;
  offline: boolean;
}

/** Point series shape: values over time at one place. */
export interface PointSeries {
  label: ValueLabel;
  lat: number;
  lon: number;
  /** Valid time of each step (end of the hour for amounts). */
  times: Date[];
  /** Hours each step covers. */
  stepHours: number;
  values: Partial<Record<VariableName, number[]>>;
}

/**
 * Grid field shape: values on a regular latitude/longitude grid for one valid
 * time. Rows run south to north, columns west to east; cell centres.
 */
export interface GridField {
  label: ValueLabel;
  validTime: Date;
  stepHours: number;
  bbox: [west: number, south: number, east: number, north: number];
  nx: number;
  ny: number;
  values: Partial<Record<VariableName, Float32Array>>;
}
