// The sky and haze behind a tilted map (Maps section), driven by the sun: a blue sky
// and pale horizon by day, a warm horizon at sunset, deep blue at night, and distant
// land fading into the haze. MapLibre's own sky and fog do it (it shows only when the
// map is tilted, in 3D). The same for every ground choice. The hues are proposals.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { mix } from './style-mix';

interface Stop { alt: number; sky: string; horizon: string; fog: string; blend: number }

// Sun height in degrees, low to high.
const STOPS: Stop[] = [
  { alt: -14, sky: '#070B1A', horizon: '#141C38', fog: '#0E1530', blend: 0.3 },
  { alt: -4, sky: '#2B3978', horizon: '#8A6E9A', fog: '#5E5280', blend: 0.6 },
  { alt: 3, sky: '#6E8ED2', horizon: '#F2B08A', fog: '#D9A98F', blend: 0.9 },
  { alt: 16, sky: '#5E9FE6', horizon: '#D3E6F6', fog: '#CFE2F2', blend: 1 },
];

/** The sky for a sun height (null: no sun, the plain day look). */
export function skyFor(altitude: number | null): { 'sky-color': string; 'horizon-color': string; 'fog-color': string; 'atmosphere-blend': number } {
  const alt = altitude === null ? 90 : altitude;
  const lo = STOPS.filter((s) => s.alt <= alt).at(-1) ?? STOPS[0]!;
  const hi = STOPS.find((s) => s.alt >= alt) ?? STOPS.at(-1)!;
  const t = hi.alt === lo.alt ? 0 : (alt - lo.alt) / (hi.alt - lo.alt);
  return {
    'sky-color': mix(lo.sky, hi.sky, t),
    'horizon-color': mix(lo.horizon, hi.horizon, t),
    'fog-color': mix(lo.fog, hi.fog, t),
    'atmosphere-blend': lo.blend + (hi.blend - lo.blend) * t,
  };
}

let last = '';

/** Sets the map's sky for the sun's height (null for none). Cheap to call again: nothing changes unless the colours do. */
export function applySky(map: MapLibreMap, altitude: number | null): void {
  const sky = { ...skyFor(altitude), 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.4 };
  const key = JSON.stringify(sky);
  if (key === last) return;
  last = key;
  map.setSky(sky);
}
