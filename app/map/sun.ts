// The sun on the map (Maps section): where the sun is at the time you are
// looking at, so the hillshade is lit from it and the map darkens at night.
//
// Level 1, sun-lit relief: the hillshade takes the sun's direction and height.
// It is slope shading, not cast shadows: a valley floor behind a ridge still
// looks lit. Level 2, night tint: a dark wash under the weather fills, with a
// dusk band, so colour for data is never darkened. True cast shadows come later.
//
// The time is the app's one time cursor (the scrubber), so dragging it moves
// the sun. The position is plain astronomy from the date, time and place; no
// data is fetched.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { S } from '../state';
import { colorToken, type Theme } from '../theme/tokens';
import { mix } from './style-mix';
import { mapGround } from './style';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;

/** Where the sun is: azimuth in degrees clockwise from north, altitude in degrees above the horizon (below zero is night). */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const lw = -lng * RAD;
  const phi = lat * RAD;
  const d = date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const e = RAD * 23.4397;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const fromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { azimuth: (((fromSouth / RAD + 180) % 360) + 360) % 360, altitude: altitude / RAD };
}

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** How dark the night wash is, 0 (day) to 1 (full night): dusk starts at 6° above the horizon and the dark is full at 12° below. */
export function nightAmount(altitudeDeg: number): number {
  return smooth((6 - altitudeDeg) / 18);
}

/** The strongest the night wash gets, as an opacity: dark enough to read as night, light enough to keep the map readable. */
const NIGHT_OPACITY = 0.5;
/** Lowest light height given to the hillshade, so low sun still shows relief instead of going black. */
const MIN_LIGHT = 14;
/** The hillshade's strength in sun mode (the plain map's is 0.4): real low sun is harsh, so it is softened to stay readable. */
const SUN_RELIEF = 0.22;
const PLAIN_RELIEF = 0.4;
const NIGHT_LAYER = 'sun-night';

type Listener = (on: boolean) => void;

class MapSun {
  private on = false;
  private map: MapLibreMap | null = null;
  private listeners = new Set<Listener>();
  /** The plain map's shadow colour, kept while the sun is on so it can be put back. */
  private plainShadow: unknown = null;
  private plainHighlight: unknown = null;
  /** True while the sun's lighting is on the hillshade, so it is put back once, not on every redraw. */
  private applied = false;

  enabled(): boolean { return this.on; }
  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.update();
    for (const fn of this.listeners) fn(on);
  }

  /** Adds the night layer under the weather fills (before the hillshade). Called once when the map has loaded. */
  attach(map: MapLibreMap): void {
    this.map = map;
    if (!map.getLayer(NIGHT_LAYER)) {
      map.addLayer({ id: NIGHT_LAYER, type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': '#000000', 'background-opacity': 0 } }, map.getLayer('hillshade') ? 'hillshade' : undefined);
    }
    const refresh = () => this.update();
    map.on('moveend', refresh);
    // Pages without the app's time cursor (the phone test page) have no time to follow.
    S.cursor?.subscribe(refresh);
    this.update();
  }

  /** The time being looked at: the cursor's, or now. */
  private time(): Date { return S.cursor?.time ?? new Date(); }

  update(): void {
    const map = this.map;
    if (!map || !map.getLayer('hillshade')) return;
    if (!this.on) {
      map.setLayoutProperty(NIGHT_LAYER, 'visibility', 'none');
      if (this.applied) {
        this.applied = false;
        map.setPaintProperty('hillshade', 'hillshade-method', 'standard');
        map.setPaintProperty('hillshade', 'hillshade-exaggeration', PLAIN_RELIEF);
        if (this.plainShadow) map.setPaintProperty('hillshade', 'hillshade-shadow-color', this.plainShadow as string);
        this.plainShadow = null;
        if (this.plainHighlight) map.setPaintProperty('hillshade', 'hillshade-highlight-color', this.plainHighlight as string);
        this.plainHighlight = null;
        map.setPaintProperty('hillshade', 'hillshade-illumination-direction', 335);
        map.setPaintProperty('hillshade', 'hillshade-illumination-anchor', 'viewport');
      }
      return;
    }
    this.applied = true;
    const c = map.getCenter();
    const { azimuth, altitude } = sunPosition(this.time(), c.lat, c.lng);
    const theme: Theme = S.settings.theme();
    // Shadows are the ground colour a little darker, not black: real low sun leaves whole slopes dark, which hides the ground.
    if (!this.plainShadow) { this.plainShadow = map.getPaintProperty('hillshade', 'hillshade-shadow-color'); this.plainHighlight = map.getPaintProperty('hillshade', 'hillshade-highlight-color'); }
    // Matte: no white highlight, so lit slopes are just the ground colour, not a shine.
    map.setPaintProperty('hillshade', 'hillshade-highlight-color', 'rgba(0, 0, 0, 0)');
    map.setPaintProperty('hillshade', 'hillshade-shadow-color', mix(mapGround(theme), theme === 'dark' ? colorToken('water', 'dark') : colorToken('ink', 'light'), theme === 'dark' ? 0.4 : 0.25));
    map.setPaintProperty('hillshade', 'hillshade-method', 'basic');
    map.setPaintProperty('hillshade', 'hillshade-exaggeration', SUN_RELIEF);
    map.setPaintProperty('hillshade', 'hillshade-illumination-anchor', 'map');
    map.setPaintProperty('hillshade', 'hillshade-illumination-direction', azimuth);
    map.setPaintProperty('hillshade', 'hillshade-illumination-altitude', Math.max(MIN_LIGHT, Math.min(90, altitude)));
    map.setLayoutProperty(NIGHT_LAYER, 'visibility', 'visible');
    // The wash is the dark water token on the dark theme, the ink token on light.
    map.setPaintProperty(NIGHT_LAYER, 'background-color', theme === 'dark' ? colorToken('water', 'dark') : colorToken('ink', 'light'));
    map.setPaintProperty(NIGHT_LAYER, 'background-opacity', NIGHT_OPACITY * nightAmount(altitude));
  }
}

/** The one sun for the map. The panel's switch calls `mapSun.setEnabled`. */
export const mapSun = new MapSun();
