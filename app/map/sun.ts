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
import { mapWater } from './style';
import { applySky } from './atmosphere';
import { applyWater } from './water';
import { plainHillshade, satelliteLook, sunHillshade, type Paint } from './look';
import { SATELLITE_LAYER } from './satellite';

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
/** On the light theme the wash is lighter: a heavy one turns the map to grey fog. */
const NIGHT_OPACITY_LIGHT = 0.32;
const NIGHT_LAYER = 'sun-night';

type Listener = (on: boolean) => void;

class MapSun {
  private on = false;
  private map: MapLibreMap | null = null;
  private listeners = new Set<Listener>();
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
    const theme: Theme = S.settings.theme();
    const satellite = map.getLayer(SATELLITE_LAYER) && map.getLayoutProperty(SATELLITE_LAYER, 'visibility') === 'visible' ? SATELLITE_LAYER : null;
    const c = map.getCenter();
    const { azimuth, altitude } = sunPosition(this.time(), c.lat, c.lng);
    // The sky follows the sun only while the sun switch is on; otherwise it is the plain day sky.
    applySky(map, this.on ? altitude : null);
    // Water: its blue and shine follow the sun's height while the sun switch is on; over the satellite picture it is only tinted.
    applyWater(map, theme, this.on ? altitude : null, Boolean(satellite));
    const set = (paint: Paint) => { for (const [k, v] of Object.entries(paint)) map.setPaintProperty('hillshade', k as 'hillshade-method', v as never); };
    const setSat = (paint: Paint) => { if (map.getLayer(SATELLITE_LAYER)) for (const [k, v] of Object.entries(paint)) map.setPaintProperty(SATELLITE_LAYER, k as 'raster-contrast', v as never); };
    if (!this.on) {
      map.setLayoutProperty(NIGHT_LAYER, 'visibility', 'none');
      if (this.applied) {
        this.applied = false;
        set(plainHillshade(theme));
      }
      setSat(satelliteLook(0));
      return;
    }
    this.applied = true;
    if (altitude > 0) set(sunHillshade(theme, azimuth, altitude));
    else set(plainHillshade(theme)); // sun down: nothing lights the slopes, so the even light (a sun below the horizon drew streaks)
    const night = nightAmount(altitude);
    setSat(satelliteLook(night));
    map.setLayoutProperty(NIGHT_LAYER, 'visibility', 'visible');
    // The night wash: on the dark theme the dark water token; on light a deep blue-grey, lighter, because a heavy dark wash over a light map only turns it to grey fog.
    map.setPaintProperty(NIGHT_LAYER, 'background-color', theme === 'dark' ? colorToken('water', 'dark') : mix(colorToken('ink', 'light'), mapWater('dark'), 0.45));
    map.setPaintProperty(NIGHT_LAYER, 'background-opacity', (theme === 'dark' ? NIGHT_OPACITY : NIGHT_OPACITY_LIGHT) * night);
  }
}

/** The one sun for the map. The panel's switch calls `mapSun.setEnabled`. */
export const mapSun = new MapSun();
