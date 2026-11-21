// The map itself (Maps section): creating it over the base map, its padding
// above the sheet, the terrain switches, the pin's start (your location, the
// last pin, or the North Shore), the locate button, the map panel, and the
// base map's colours for a theme. Moved out of app/main.ts; it reads the
// shared state in app/state.ts.
import type { LngLatLike, Map as MapLibreMap } from 'maplibre-gl';
import { S, app, $ } from '../state';
import { maplibregl } from './maplibre';
import { applyMapSettings } from './map-settings';
import { applyBaseTheme, topoStyle } from './style';
import { applyTerrainTheme } from './terrain';
import { hasBuildingHeights, TILT } from './three-d';
import { mapPanelBody } from '../shell/map-panel';
import { closePanel, isOpenFrom, openPanel } from '../shell/panel';
import { icons } from '../shell/icons';
import { savePrefs } from '../shell/prefs';
import { savedOnlyActive } from '../data/connection';
import { offlineGroup } from '../offline/offline-panel';
import { openSaveBox, openSavedList } from '../offline/wiring';
import type { Theme } from '../theme/tokens';

/** North Shore, the start region on every design screen. */
export const NORTH_SHORE: [number, number] = [-123.02, 49.38];

/** Whether the base map carries building heights (3D buildings need them). */
export const buildingsOk = () => hasBuildingHeights(S.basemap.manifest.vector_layers);

/** The map over the base map, centred on the last pin (or the North Shore). */
export function createMap(): MapLibreMap {
  const map = new maplibregl.Map({
  container: 'map',
  style: topoStyle(S.basemap.source, S.settings.theme()),
  center: S.prefs.lastPin ? [S.prefs.lastPin.lng, S.prefs.lastPin.lat] : NORTH_SHORE,
  zoom: 11,
  // Start tilted when a 3D switch is on, so 3D is what you see on opening.
  pitch: S.prefs.terrain3d || (buildingsOk() && S.prefs.buildings3d) ? TILT : 0,
  minZoom: 4,
  maxZoom: 16,
  maxBounds: [[-145, 44], [-108, 63]],
  attributionControl: false,
  // Memory on phones. Safari reloads the page when it runs out, which 3D on
  // an iPhone did while zooming in (Nov 21). Drawing at 2x instead of the
  // phone's 3x needs less than half the graphics memory (3D keeps a picture
  // of every tile at that sharpness), and keeping map pieces for two zoom
  // levels instead of five holds fewer of them at once.
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  maxTileCacheZoomLevels: 2,
  pitchWithRotate: false,
  dragRotate: false,
});
map.touchZoomRotate.disableRotation();
map.touchPitch.disable();
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
(window as unknown as { tempestMap: typeof map }).tempestMap = map;
  return map;
}
export const fitPadding = () => {
  S.map.setPadding({ top: 0, bottom: S.sheet?.collapsedHeight() ?? 320, left: 0, right: 0 });
};

// Terrain switches: the map's settings decide (app/map/map-settings.ts), including the panel's hillshade and contour switches.
export const applyTerrainPrefs = () => applyMapSettings(S.map);
export function startFromLastOrDefault() {
  if (S.prefs.lastPin) {
    S.pin.set({ lng: S.prefs.lastPin.lng, lat: S.prefs.lastPin.lat, kind: 'last', name: S.prefs.lastPin.label || null });
  } else {
    S.pin.set({ lng: NORTH_SHORE[0], lat: NORTH_SHORE[1], kind: 'dropped', name: null });
  }
}

export function locate(fly: boolean) {
  if (!('geolocation' in navigator)) { if (!S.pin.get()) startFromLastOrDefault(); return; }
  $('locate').dataset.busy = 'true';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      delete $('locate').dataset.busy;
      const { longitude: lng, latitude: lat } = pos.coords;
      S.pin.set({ lng, lat, kind: 'you', name: null });
      app.rememberPin({ lng, lat, name: null });
      if (fly) S.map.easeTo({ center: [lng, lat] as LngLatLike, zoom: Math.max(S.map.getZoom(), 11), duration: 600 });
      else S.map.jumpTo({ center: [lng, lat] });
    },
    () => {
      delete $('locate').dataset.busy;
      if (!S.pin.get()) startFromLastOrDefault();
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  );
}

/** Theme changed: the base map, terrain and 3D buildings follow. */
export function recolourMap(t: Theme): void {
  applyBaseTheme(S.map, t);
  applyTerrainTheme(S.map, t);
  S.threeD.applyTheme(t);
}

/** The locate button, the place line and the map panel. */
export function setupMapControls(): void {
$('locate').addEventListener('click', () => locate(true));

$('place-line').addEventListener('click', () => {
  const p = S.pin.get();
  if (p) S.map.easeTo({ center: [p.lng, p.lat], duration: 500 });
});
// Map panel
$('map-layers').addEventListener('click', () => {
  if (isOpenFrom($('map-layers'))) { closePanel(); return; }
  openPanel({
    origin: $('map-layers'),
    icon: icons.layersPanel,
    title: 'Map',
    caption: 'Base map and terrain',
    headerAction: S.settings.gear($('map-layers')),
    body: mapPanelBody({
      hillshade: S.prefs.hillshade, contours: S.prefs.contours, terrain3d: S.prefs.terrain3d, buildings3d: buildingsOk() ? S.prefs.buildings3d : undefined,
      stations: S.prefs.stations, stationsOffline: !navigator.onLine || savedOnlyActive(),
    }, (s) => {
      if (s.stations !== S.prefs.stations) S.stations.setEnabled(s.stations);
      S.prefs.stations = s.stations;
      S.prefs.hillshade = s.hillshade;
      S.prefs.contours = s.contours;
      S.prefs.terrain3d = s.terrain3d ?? false;
      S.prefs.buildings3d = s.buildings3d ?? false;
      savePrefs(S.prefs);
      applyTerrainPrefs();
      S.threeD.apply({ terrain: S.prefs.terrain3d, buildings: buildingsOk() && S.prefs.buildings3d }, true);
    }, offlineGroup(S.savedAreas, {
      choose: () => {
        closePanel();
        openSaveBox();
      },
      list: () => openSavedList(),
    }, !!S.run && !S.usingSaved)),
  });
});
}
