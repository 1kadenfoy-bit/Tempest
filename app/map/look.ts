// The look of the map's lighting (Maps section), after Sebastian Lague's game
// Geographical Adventures: a soft warm sun on the lit slopes, cool blue-violet in
// the shadows (never grey), a second light straight overhead so flat ground still
// shows relief, and a faint contrast lift on the satellite picture. It is the same
// for Terrain and Satellite; only the ground colours differ.
//
// All the hues here are proposals for Kaden to judge on his phone, not tokens.
import type { Theme } from '../theme/tokens';

/** The hillshade's strength with the fixed light (the sun toggle off). */
export const PLAIN_RELIEF = 0.5;
/** And with the real sun. */
export const SUN_RELIEF = 0.55;
/** Lowest light height given to the sun light, so low sun still shows relief instead of going black. */
const MIN_LIGHT = 14;
/** The overhead light's height: nearly straight down, so only steep slopes darken (the game's "up-facing" term). */
const OVERHEAD = 80;

const SHADOW = { dark: 'rgba(58, 74, 130, 0.3)', light: 'rgba(76, 90, 150, 0.22)' };
const SHADOW_SOFT = { dark: 'rgba(58, 74, 130, 0.07)', light: 'rgba(76, 90, 150, 0.05)' };
const WARM = { dark: 'rgba(255, 230, 190, 0.18)', light: 'rgba(255, 240, 210, 0.3)' };
const OVERHEAD_LIGHT = 'rgba(255, 255, 255, 0.04)';

export type Paint = Record<string, unknown>;

/** The hillshade with the fixed light from the north-west: the look when the sun is off, and at night. */
export function plainHillshade(theme: Theme): Paint {
  return {
    'hillshade-method': 'standard',
    'hillshade-exaggeration': PLAIN_RELIEF,
    'hillshade-illumination-direction': 335,
    'hillshade-illumination-anchor': 'viewport',
    'hillshade-shadow-color': SHADOW[theme],
    'hillshade-highlight-color': WARM[theme],
  };
}

/** The hillshade lit by the real sun, plus a light from overhead. */
export function sunHillshade(theme: Theme, azimuth: number, altitude: number): Paint {
  return {
    'hillshade-method': 'multidirectional',
    'hillshade-exaggeration': SUN_RELIEF,
    'hillshade-illumination-anchor': 'map',
    'hillshade-illumination-direction': [azimuth, azimuth],
    'hillshade-illumination-altitude': [Math.max(MIN_LIGHT, Math.min(90, altitude)), OVERHEAD],
    'hillshade-shadow-color': [SHADOW[theme], SHADOW_SOFT[theme]],
    'hillshade-highlight-color': [WARM[theme], OVERHEAD_LIGHT],
  };
}

/** The satellite picture's colour: a little more contrast and life by day; at night dim and nearly grey (`night` 0 to 1). */
export function satelliteLook(night: number): Paint {
  return {
    'raster-contrast': 0.12,
    'raster-brightness-min': 0.04,
    'raster-saturation': 0.05 - 0.75 * night,
    'raster-brightness-max': 0.95 - 0.5 * night,
  };
}
