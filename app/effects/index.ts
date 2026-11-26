// The animated effects, ready to join the app's map (Effects section).
//
// The lead calls `setupEffects` once, in the map's `load` handler in
// app/main.ts, and connects the Clouds and Wind switches of the map panel to
// `setOn`. Both effects start off and cost nothing while off: a hidden layer
// draws nothing, moves nothing and asks the map for no frames. On, they keep
// the map redrawing (the clouds drift and change, the streaks move), so the
// map is never idle while one is on; the switches default to off for that
// reason, and the browser tests that wait for idle run with them off.
//
// The weather they show is a stand-in until the forecast is connected:
// `setWindWeather` and `setCloudWeather` take plain numbers (cloud cover as a
// share of the sky, base heights in metres, wind from a direction at a speed),
// so the forecast only has to call them. Until then they show the look Kaden
// chose on the test page (effects.html), not real weather.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CloudLayer, type CloudSheet } from '../../render/effects/cloud-layer';
import { WindParticlesLayer } from '../../render/effects/wind-particles-layer';
import { syntheticWind, type SyntheticWind } from '../effects-lab/synthetic-wind';
import { TERRAIN_3D_SOURCE } from '../map/terrain';

export type EffectId = 'clouds' | 'wind';

export interface CloudWeather {
  low: CloudSheet;
  mid: CloudSheet;
  high: CloudSheet;
}

export interface WindWeather {
  /** Direction the wind blows FROM, degrees clockwise from north. */
  fromDeg: number;
  speedKmh: number;
}

export interface Effects {
  /** Turn an effect on or off. */
  setOn(id: EffectId, on: boolean): void;
  isOn(id: EffectId): boolean;
  setCloudWeather(w: CloudWeather): void;
  setWindWeather(w: WindWeather): void;
}

/** What shows until the forecast is connected: the look Kaden chose on the test page. */
const STAND_IN_CLOUDS: CloudWeather = {
  low: { cover: 0.4, baseM: 1200 },
  mid: { cover: 0.3, baseM: 3500 },
  high: { cover: 0.5, baseM: 8000 },
};

/**
 * Add both effects to the map, hidden. `beforeId` is the layer they draw under
 * (the first label), so labels stay on top. Clouds are added first, so the
 * streaks draw over them.
 */
export function setupEffects(map: MapLibreMap, beforeId: string | undefined): Effects {
  const wind = new WindParticlesLayer();
  const clouds = new CloudLayer();
  const on: Record<EffectId, boolean> = { clouds: false, wind: false };

  // Stand-in wind: Kaden's chosen look (docs/wishes/effects.md, rule 3).
  const windSettings: SyntheticWind = { fromDeg: 280, speedKmh: 36, terrain: 0.2, gusty: 0.15, gust: 0.5, gustSize: 1 };
  const metresPerUnit = () => 40_075_016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180);
  const clock = {
    seconds: () => performance.now() / 1000,
    groundMps: () => windSettings.speedKmh * 2.2 * (metresPerUnit() / (512 * 2 ** map.getZoom())),
  };
  wind.setWind(syntheticWind(() => windSettings, wind.grid, metresPerUnit, clock));
  wind.setLook({ count: 700, trailSeconds: 0.4, widthPx: 2, brightness: 0.9, speedScale: 1, clearance: 50 });
  wind.setVisible(false);

  clouds.setVisible(false);
  const setCloudWeather = (w: CloudWeather) => {
    clouds.setSheet('low', w.low);
    clouds.setSheet('mid', w.mid);
    clouds.setSheet('high', w.high);
  };
  setCloudWeather(STAND_IN_CLOUDS);
  clouds.setWind({ fromDeg: windSettings.fromDeg, speedKmh: windSettings.speedKmh });

  map.addLayer(clouds, beforeId);
  map.addLayer(wind, beforeId);

  // The streaks follow the ground's height, read once the view has settled and its terrain has arrived.
  let timer = 0;
  const refreshSoon = () => {
    if (!on.wind) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => wind.refreshGround(), 300);
  };
  map.on('moveend', refreshSoon);
  map.on('sourcedata', (e) => { if (e.sourceId === TERRAIN_3D_SOURCE) refreshSoon(); });

  return {
    setOn(id, value) {
      on[id] = value;
      if (id === 'clouds') clouds.setVisible(value);
      else {
        wind.setVisible(value);
        if (value) wind.refreshGround();
      }
    },
    isOn: (id) => on[id],
    setCloudWeather,
    setWindWeather(w) {
      windSettings.fromDeg = w.fromDeg;
      windSettings.speedKmh = w.speedKmh;
      clouds.setWind(w);
    },
  };
}
