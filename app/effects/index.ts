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
// The wind streaks follow the forecast (Nov 27): `setForecastWind` takes the
// wind layer's own wind at the terrain over the view, so each streak moves in
// the direction and at the speed the forecast gives where it is, for the hour
// on the scrubber. Before the first forecast arrives the streaks wait (no
// made-up wind is shown). Their look comes from app/effects/wind-look.ts (the
// Tune panel's wind sliders). The clouds are still a stand-in: `setCloudWeather`
// takes plain numbers (cloud cover as a share of the sky, base heights in
// metres), so the forecast only has to call it once cloud cover is available.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CloudLayer, type CloudSheet } from '../../render/effects/cloud-layer';
import { WindParticlesLayer } from '../../render/effects/wind-particles-layer';
import { shapeWind } from '../effects-lab/synthetic-wind';
import type { MercatorWind } from '../map/wind-field';
import { windLook, type WindLook } from './wind-look';
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
  /** The forecast's wind over the view, for the streaks (and the clouds' drift). */
  setForecastWind(w: MercatorWind): void;
}

/** The forecast wind at a map position: bilinear between grid cells, the edge's wind outside the grid. */
function sampler(w: MercatorWind) {
  return (x: number, y: number, out: Float32Array) => {
    const gx = Math.max(0, Math.min(w.cols - 1, ((x - w.x0) / (w.x1 - w.x0)) * (w.cols - 1)));
    const gy = Math.max(0, Math.min(w.rows - 1, ((y - w.y0) / (w.y1 - w.y0)) * (w.rows - 1)));
    const c0 = Math.min(w.cols - 2, Math.floor(gx)), r0 = Math.min(w.rows - 2, Math.floor(gy));
    const fx = gx - c0, fy = gy - r0, i = r0 * w.cols + c0;
    const lerp = (a: Float32Array) => (a[i]! * (1 - fx) + a[i + 1]! * fx) * (1 - fy) + (a[i + w.cols]! * (1 - fx) + a[i + w.cols + 1]! * fx) * fy;
    out[0] = lerp(w.u); out[1] = lerp(w.v);
  };
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

  // The forecast wind, shaped by the hills and gusts as the Tune panel sets them.
  let forecast: MercatorWind | null = null;
  let look: WindLook = windLook.get();
  const still = (_x: number, _y: number, out: Float32Array) => { out[0] = 0; out[1] = 0; };
  let base = still;
  const metresPerUnit = () => 40_075_016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180);
  const clock = {
    seconds: () => performance.now() / 1000,
    groundMps: () => (forecast?.meanKmh ?? 0) * 2.2 * look.speedScale * (metresPerUnit() / (512 * 2 ** map.getZoom())),
  };
  wind.setWind(shapeWind((x, y, out) => base(x, y, out), () => look, wind.grid, metresPerUnit, clock));
  const applyLook = (l: WindLook) => {
    look = l;
    wind.setLook({ count: l.count, trailSeconds: l.trailSeconds, widthPx: l.widthPx, brightness: l.brightness, speedScale: l.speedScale, clearance: l.clearance });
    if (on.wind) map.triggerRepaint();
  };
  applyLook(look);
  windLook.onChange(applyLook);
  // Nothing to draw until the forecast's wind has arrived.
  const syncWind = () => wind.setVisible(on.wind && forecast !== null);
  wind.setVisible(false);

  clouds.setVisible(false);
  const setCloudWeather = (w: CloudWeather) => {
    clouds.setSheet('low', w.low);
    clouds.setSheet('mid', w.mid);
    clouds.setSheet('high', w.high);
  };
  setCloudWeather(STAND_IN_CLOUDS);
  clouds.setWind({ fromDeg: 280, speedKmh: 36 });

  map.addLayer(clouds, beforeId);
  map.addLayer(wind, beforeId);
  // The browser tests read the streaks' frame rate here.
  (window as unknown as { tempestWind: WindParticlesLayer }).tempestWind = wind;
  // A frame-rate readout for checking the streaks on a phone: add ?fps to the address.
  if (new URLSearchParams(location.search).has('fps')) {
    const meter = document.createElement('div');
    meter.className = 'fps-meter';
    document.body.append(meter);
    setInterval(() => {
      const st = wind.stats();
      meter.textContent = st.fps ? `${Math.round(st.fps)} fps · ${st.workMs.toFixed(1)} ms a frame` : 'wind paused';
    }, 1000);
  }

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
        syncWind();
        if (value) wind.refreshGround();
      }
    },
    isOn: (id) => on[id],
    setCloudWeather,
    setWindWeather(w) {
      clouds.setWind(w);
    },
    setForecastWind(w) {
      const first = forecast === null;
      forecast = w;
      base = sampler(w);
      clouds.setWind({ fromDeg: w.meanFromDeg, speedKmh: w.meanKmh });
      if (first) syncWind();
    },
  };
}
