// Profiles from the vocabulary's per-level variables, and the temperature at
// a point's ground height for every hour of its series.
import { PROFILE_LEVELS, type PointSeries } from '../vocabulary';
import { freezingLevel, newProfile, sampleProfile, type Profile } from './toposcale';

/** The profile at step i of a series's values (NaN where a level is missing). */
export function profileAt(values: PointSeries['values'], i: number): Profile {
  const p = newProfile(PROFILE_LEVELS.length);
  PROFILE_LEVELS.forEach((l, k) => {
    p.gh[k] = values[`geopotential_height_${l}hPa`]?.[i] ?? NaN;
    p.temp[k] = values[`temperature_${l}hPa`]?.[i] ?? NaN;
  });
  return p;
}

export const isComplete = (p: Profile) => p.gh.every(Number.isFinite) && p.temp.every(Number.isFinite);

/** Temperature at `elevation` for each step (NaN where the profile is missing). */
export function terrainTemperatures(s: PointSeries, elevation: number): number[] {
  return s.times.map((_, i) => {
    const p = profileAt(s.values, i);
    return isComplete(p) ? sampleProfile(p.gh, p.temp, elevation) : NaN;
  });
}

/** Freezing level for each step, or null where the profile has no crossing. */
export function freezingLevels(s: PointSeries): (number | null)[] {
  return s.times.map((_, i) => {
    const p = profileAt(s.values, i);
    return isComplete(p) ? freezingLevel(p) : null;
  });
}
