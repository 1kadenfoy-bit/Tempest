// What the map's settings do (Maps section). The Map panel (Interface section)
// shows the switches and calls `mapSettings.set`; this file owns what each one
// does to the map. Nothing here draws a button.
//
//   View       2D or 3D: already the 3D terrain switch (app/map/three-d.ts)
//   Ground     Terrain (the terrain colours, 'shaded'), or Satellite
//              (the Sentinel-2 picture built by the Data section; app/map/satellite.ts).
//              Satellite shows only where the picture's tiles exist.
//   Overlays   trails, huts, campsites, peaks, contour lines, small roads,
//              ski lifts, boundaries
//   Sun        the sun-lit relief and night tint (app/map/sun.ts)
//
// Until the panel is wired, a link can set them: ?map=ground:satellite,trails:off,sun:on
import type { Map as MapLibreMap } from 'maplibre-gl';
import { L } from './layer-ids';
import { S } from '../state';
import { mapSun } from './sun';
import { setPeakHeights } from './places';
import { SATELLITE_LAYER } from './satellite';

export interface MapSettings {
  /**
   * What covers the ground: terrain colours ('shaded', shown as "Terrain") or the
   * satellite picture. 'plain' is no longer offered; anything that still holds it
   * (an old saved setting, a panel not yet updated) is drawn as 'shaded'.
   */
  ground: 'plain' | 'shaded' | 'satellite';
  trails: boolean;
  trailNames: boolean;
  huts: boolean;
  camps: boolean;
  peaks: boolean;
  peakHeights: boolean;
  contours: boolean;
  /** Forest roads and other minor roads. */
  smallRoads: boolean;
  skiLifts: boolean;
  /** Boundaries: park outlines, provincial and regional lines, municipal lines. */
  parkBoundaries: boolean;
  regionBoundaries: boolean;
  municipalBoundaries: boolean;
  sun: boolean;
}

/** What the map shows with nothing chosen: as it is today, plus trails, huts and camps on, and the new switches off. */
export const DEFAULT_MAP_SETTINGS: MapSettings = {
  ground: 'shaded',
  trails: true, trailNames: true, huts: true, camps: true,
  peaks: true, peakHeights: true,
  contours: true,
  smallRoads: true,
  skiLifts: false,
  parkBoundaries: false, regionBoundaries: true, municipalBoundaries: true,
  sun: false,
};

type Listener = (s: MapSettings) => void;

/** Reads `ground:satellite,trails:off,sun:on` into settings changes; unknown names and values are ignored. */
export function parseMapSettings(text: string): Partial<MapSettings> {
  const out: Record<string, unknown> = {};
  for (const part of text.split(',')) {
    const [k, v] = part.split(':').map((x) => x.trim());
    if (!k || !(k in DEFAULT_MAP_SETTINGS)) continue;
    if (k === 'ground') {
      if (v === 'shaded' || v === 'satellite') out.ground = v;
      else if (v === 'plain') out.ground = 'shaded'; // plain is gone: it is Terrain now
      continue;
    }
    if (v === 'on' || v === 'true') out[k] = true;
    else if (v === 'off' || v === 'false') out[k] = false;
  }
  return out as Partial<MapSettings>;
}

class MapSettingsStore {
  private state: MapSettings = { ...DEFAULT_MAP_SETTINGS };
  private listeners = new Set<Listener>();
  private map: MapLibreMap | null = null;

  get(): MapSettings { return this.state; }
  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Change some settings and redraw. */
  set(change: Partial<MapSettings>): void {
    this.state = { ...this.state, ...change };
    if (this.map) applyMapSettings(this.map);
    for (const fn of this.listeners) fn(this.state);
  }

  /** Called once the layers exist; reads a link's `map=` choices on the first call. */
  attach(map: MapLibreMap): void {
    if (this.map) return;
    this.map = map;
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search).get('map');
      if (q) this.state = { ...this.state, ...parseMapSettings(q) };
    }
    applyMapSettings(map);
  }
}

export const mapSettings = new MapSettingsStore();

/** Draw the map as the settings say. Safe to call again after layers are added. */
export function applyMapSettings(map: MapLibreMap): void {
  mapSettings.attach(map);
  const s = mapSettings.get();
  const show = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  const showAll = (ids: readonly string[], on: boolean) => ids.forEach((id) => show(id, on));

  // Ground
  showAll(L.groundColour, s.ground !== 'satellite');
  show(L.hillshade, prefOn('hillshade'));
  // Satellite: the picture replaces the colours, the sea, and the low-zoom land cover (it already shows them); the relief lighting stays.
  const sat = s.ground === 'satellite';
  show(SATELLITE_LAYER, sat);
  show('water', !sat);
  show('water_shine', !sat);
  show('landcover', !sat);
  // Trails, huts, camps
  show(L.trails, s.trails);
  show(L.trailsBase, s.trails);
  show(L.tracks, s.smallRoads);
  show(L.hutsBase, s.huts);
  show(L.huts, s.huts);
  show(L.camps, s.camps);
  // Peaks
  show(L.peaks, s.peaks);
  show(L.peaksBase, s.peaks);
  setPeakHeights(map, s.peakHeights);
  // Contours
  show(L.contours, s.contours && prefOn('contours'));
  // Small roads
  showAll(L.smallRoads, s.smallRoads);
  // Names along trails and small roads share one label layer: list the kinds still on.
  const kinds = [...(s.smallRoads ? ['minor_road', 'other'] : []), ...(s.trails && s.trailNames ? ['path'] : [])];
  if (map.getLayer(L.trailNames)) {
    show(L.trailNames, kinds.length > 0);
    if (kinds.length) map.setFilter(L.trailNames, ['in', 'kind', ...kinds]);
  }
  // Ski
  show(L.skiLifts, s.skiLifts);
  show(L.skiLiftNames, s.skiLifts);
  // Boundaries
  show(L.parkBoundaries, s.parkBoundaries);
  show(L.boundariesCountry, s.regionBoundaries);
  show(L.boundaries, s.regionBoundaries || s.municipalBoundaries);
  if (map.getLayer(L.boundaries)) {
    // Admin levels: 2 country, 4 and 6 provincial and regional, 8 and up municipal.
    const f = s.regionBoundaries && s.municipalBoundaries ? ['>', 'kind_detail', 2] : s.regionBoundaries ? ['all', ['>', 'kind_detail', 2], ['<=', 'kind_detail', 6]] : ['>', 'kind_detail', 6];
    map.setFilter(L.boundaries, f as never);
  }
  // Sun
  mapSun.setEnabled(s.sun);
}

/** The panel's older hillshade and contour switches (saved preferences) still count while the panel has them. */
function prefOn(key: 'hillshade' | 'contours'): boolean {
  return S.prefs?.[key] ?? true;
}
