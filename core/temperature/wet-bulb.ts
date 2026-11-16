// Wet-bulb temperature, the snow line, and the Kuchera snow ratio, from a
// profile that carries humidity on each level.
//
// - Wet-bulb: Stull (2011), from air temperature and relative humidity; good
//   to about 0.3 °C for ordinary humidity.
// - Snow line: the lowest height where the wet-bulb temperature falls through
//   0.5 °C going up. The architecture notes (docs/03) cite a 0.5 °C wet-bulb
//   threshold as 93.1% accurate for rain against snow.
// - Kuchera: the snow ratio from the warmest temperature in the column above
//   the ground (12:1 at −2 °C; 2 less per degree warmer, 1 more per degree
//   colder). Kuchera used the column to 500 hPa; the app's profile ends at
//   600 hPa, which rarely holds the warmest layer.
import { sampleProfile, type Profile } from './toposcale';

export const SNOW_WET_BULB = 0.5;

export function wetBulb(t: number, rh: number): number {
  const r = Math.min(100, Math.max(1, rh));
  return t * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) + Math.atan(t + r) - Math.atan(r - 1.676331)
    + 0.00391838 * r ** 1.5 * Math.atan(0.023101 * r) - 4.686035;
}

/** A profile with humidity: relative humidity (%) on each level. */
export interface MoistProfile extends Profile { rh: Float32Array }

/** Wet-bulb temperature at height z. */
export function wetBulbAt(p: MoistProfile, z: number): number {
  return wetBulb(sampleProfile(p.gh, p.temp, z), sampleProfile(p.gh, p.rh, z));
}

/** Height (m) where the wet-bulb temperature drops through 0.5 °C going up, or null. */
export function snowLine(p: MoistProfile): number | null {
  let prev = wetBulb(p.temp[0]!, p.rh[0]!) - SNOW_WET_BULB;
  if (prev < 0) return null; // snow to sea level
  for (let k = 1; k < p.gh.length; k++) {
    const cur = wetBulb(p.temp[k]!, p.rh[k]!) - SNOW_WET_BULB;
    if (prev >= 0 && cur < 0) return p.gh[k - 1]! + (prev / (prev - cur)) * (p.gh[k]! - p.gh[k - 1]!);
    prev = cur;
  }
  return null;
}

/** Kuchera snow ratio (snow depth per water depth) for snow falling to height `ground`. */
export function kucheraRatio(p: Profile, ground: number): number {
  let tmax = sampleProfile(p.gh, p.temp, ground);
  for (let k = 0; k < p.gh.length; k++) if (p.gh[k]! > ground) tmax = Math.max(tmax, p.temp[k]!);
  const k = tmax + 273.15;
  const ratio = k > 271.16 ? 12 + 2 * (271.16 - k) : 12 + (271.16 - k);
  // Observed ratios run about 3:1 to 30:1 for most snow (docs/03).
  return Math.min(30, Math.max(3, ratio));
}
