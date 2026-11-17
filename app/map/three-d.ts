// 3D terrain and 3D buildings, the two switches at the end of the map panel's
// TERRAIN group (docs/spikes/3d-terrain.md).
//
// 3D terrain raises the map on the same Mapterhorn tiles the hillshade uses,
// at true height. The weather fills drape over it (render/grid-gl/terrain-drape.ts),
// as do the hillshade, contours and the snow or freezing line. 3D buildings
// raise the base map's building footprints by their stored heights.
//
// Tilting and turning the map are allowed only while one of the two is on:
// two fingers moving up or down tilt, twisting turns. A round button above
// the thumb buttons, shown only while the map is tilted or turned, points
// north and brings the map back flat and north up.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { colorToken, type Theme } from '../theme/tokens';
import { icons } from '../shell/icons';
import { mix } from './style';
import { TERRAIN_3D_SOURCE } from './terrain';

export interface ThreeDState { terrain: boolean; buildings: boolean }

/** True height. The mountains here need no help, and the fills' heights stay honest to the eye. */
const EXAGGERATION = 1;
/** Tilt given when a switch is turned on, so the change shows at once. */
const TILT = 55;
/** Below this zoom buildings are too small to raise. Stored at zoom 14 (larger buildings) and 15 (all) where detail exists. */
const BUILDINGS_MINZOOM = 14;
/** Footprints the source gives no height: about two storeys. */
const DEFAULT_HEIGHT_M = 6;
const BUILDINGS_LAYER = 'buildings-3d';

interface VectorLayerMeta { id?: unknown; fields?: Record<string, unknown> }

/** The base map holds building footprints with heights (Protomaps `buildings` layer, `height` field). */
export function hasBuildingHeights(vectorLayers: unknown[] | undefined): boolean {
  return Boolean(vectorLayers?.some((l) => {
    const m = l as VectorLayerMeta | null;
    return m?.id === 'buildings' && typeof m.fields === 'object' && 'height' in m.fields;
  }));
}

/** Flat and north up: the 2D overlays (wind flow) line up with the map only then. */
export function isFlat(map: MapLibreMap): boolean {
  return map.getPitch() < 0.5 && Math.abs(map.getBearing()) < 0.5;
}

/** Raised buildings: neutral, from the ground and ink tokens (colour is for data). */
const buildingColour = (theme: Theme) => mix(colorToken('map-ground', theme), colorToken('ink', theme), theme === 'dark' ? 0.22 : 0.16);

export function setupThreeD(map: MapLibreMap, thumbs: HTMLElement, theme: () => Theme, onFlatChange: (flat: boolean) => void) {
  const reset = document.createElement('button');
  reset.className = 'thumb';
  reset.id = 'reset-view';
  reset.setAttribute('aria-label', 'Back to flat, north up');
  reset.innerHTML = icons.compass;
  reset.style.display = 'none';
  thumbs.prepend(reset);
  reset.addEventListener('click', () => map.easeTo({ pitch: 0, bearing: 0, duration: 500 }));

  let flat = isFlat(map);
  const sync = () => {
    const now = isFlat(map);
    reset.style.display = now ? 'none' : '';
    reset.querySelector('svg')?.style.setProperty('transform', `rotate(${-map.getBearing()}deg)`);
    document.body.dataset.tilted = String(!now);
    if (now !== flat) { flat = now; onFlatChange(flat); }
  };
  map.on('move', sync);

  const gestures = (on: boolean) => {
    if (on) {
      map.touchPitch.enable();
      map.touchZoomRotate.enableRotation();
      map.dragRotate.enable();
    } else {
      map.touchPitch.disable();
      map.touchZoomRotate.disableRotation();
      map.dragRotate.disable();
    }
  };

  const buildings = (on: boolean) => {
    if (on && !map.getLayer(BUILDINGS_LAYER)) {
      // Under the labels.
      const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      map.addLayer({
        id: BUILDINGS_LAYER,
        type: 'fill-extrusion',
        source: 'protomaps',
        'source-layer': 'buildings',
        minzoom: BUILDINGS_MINZOOM,
        paint: {
          'fill-extrusion-color': buildingColour(theme()),
          'fill-extrusion-height': ['coalesce', ['get', 'height'], DEFAULT_HEIGHT_M],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        },
      }, firstLabel);
    }
    if (map.getLayer(BUILDINGS_LAYER)) map.setLayoutProperty(BUILDINGS_LAYER, 'visibility', on ? 'visible' : 'none');
  };

  let state: ThreeDState = { terrain: false, buildings: false };
  return {
    /** Apply the switches. `animate` tilts on turning one on, and flattens on turning both off. */
    apply(next: ThreeDState, animate: boolean) {
      const wasOn = state.terrain || state.buildings;
      const on = next.terrain || next.buildings;
      const terrainOn = next.terrain && Boolean(map.getSource(TERRAIN_3D_SOURCE));
      if (terrainOn !== Boolean(map.getTerrain())) {
        map.setTerrain(terrainOn ? { source: TERRAIN_3D_SOURCE, exaggeration: EXAGGERATION } : null);
      }
      buildings(next.buildings);
      gestures(on);
      state = { ...next };
      document.body.dataset.terrain3d = String(next.terrain);
      if (animate && on && !wasOn && isFlat(map)) map.easeTo({ pitch: TILT, duration: 800 });
      if (!on && !isFlat(map)) map.easeTo({ pitch: 0, bearing: 0, duration: animate ? 500 : 0 });
      sync();
    },
    flat: () => flat,
    /** Recolour the raised buildings for a theme. */
    applyTheme(t: Theme) {
      if (map.getLayer(BUILDINGS_LAYER)) map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-color', buildingColour(t));
    },
  };
}
