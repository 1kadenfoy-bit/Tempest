// The app's variable vocabulary: one name, one unit, one meaning. Adapters
// convert into it; nothing downstream converts again except for display.
// Amounts are per model step, never running totals. Times are UTC.

/**
 * Pressure levels of the temperature profile, from the ground up. 1015 hPa
 * sits near sea level; 600 hPa is about 4,100 m, above BC's highest summits.
 */
export const PROFILE_LEVELS = [1015, 1000, 985, 970, 950, 925, 900, 875, 850, 800, 750, 700, 650, 600] as const;
export type ProfileLevel = (typeof PROFILE_LEVELS)[number];

export const VOCABULARY = {
  precipitation: { unit: 'mm per step', meaning: 'Liquid-equivalent precipitation that fell during the step' },
  snowfall_water_equivalent: { unit: 'mm per step', meaning: 'The part of precipitation that fell as snow, as water' },
  temperature_2m: { unit: '°C', meaning: 'Air temperature 2 m above the model’s own ground' },
  relative_humidity_2m: { unit: '%', meaning: 'Relative humidity 2 m above the model’s own ground' },
  wind_speed_10m: { unit: 'km/h', meaning: 'Wind speed 10 m above the model’s own ground' },
  wind_direction_10m: { unit: '°', meaning: 'Direction the 10 m wind blows from, clockwise from north' },
  wind_gusts_10m: { unit: 'km/h', meaning: 'Strongest gust 10 m above the model’s own ground during the step' },
} as const;

/** The temperature profile: temperature and height of each pressure level. */
export type ProfileVariable = `temperature_${ProfileLevel}hPa` | `geopotential_height_${ProfileLevel}hPa` | `relative_humidity_${ProfileLevel}hPa`;
export const PROFILE_VOCABULARY = {
  temperature: { unit: '°C', meaning: 'Air temperature on a pressure level' },
  geopotential_height: { unit: 'm', meaning: 'Height of a pressure level above sea level' },
  relative_humidity: { unit: '%', meaning: 'Relative humidity on a pressure level (for the wet-bulb snow line)' },
} as const;

/** Humidity on each level: only the snow line needs it, so it is asked for separately. */
export const PROFILE_RH_VARIABLES: ProfileVariable[] = PROFILE_LEVELS.map((l) => `relative_humidity_${l}hPa` as const);

export const PROFILE_VARIABLES: ProfileVariable[] = [
  ...PROFILE_LEVELS.map((l) => `temperature_${l}hPa` as const),
  ...PROFILE_LEVELS.map((l) => `geopotential_height_${l}hPa` as const),
];

/** Wind on each pressure level (M7): speed in km/h, direction it blows from in degrees. */
export type WindLevelVariable = `wind_speed_${ProfileLevel}hPa` | `wind_direction_${ProfileLevel}hPa`;
export const WIND_LEVEL_VARIABLES: WindLevelVariable[] = [
  ...PROFILE_LEVELS.map((l) => `wind_speed_${l}hPa` as const),
  ...PROFILE_LEVELS.map((l) => `wind_direction_${l}hPa` as const),
];
export const WIND_SURFACE_VARIABLES = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] as const;

export type VariableName = keyof typeof VOCABULARY | ProfileVariable | WindLevelVariable;

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
  /**
   * Which model and run each stretch comes from, when the series joins models
   * (M6). `earlier`: hours before the current run, from earlier runs.
   */
  segments?: { model: string; run: Date; from: Date; to: Date; kind: 'forecast' | 'earlier' }[];
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

/** Amounts per step (they need converting per step when read from map files). */
export function isAmount(v: VariableName): boolean {
  return v in VOCABULARY && VOCABULARY[v as keyof typeof VOCABULARY].unit === 'mm per step';
}
