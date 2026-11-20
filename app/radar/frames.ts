// Radar on the map (Weather section): the frames ECCC holds (last 3 h, every
// 6 minutes), the cursor's frame as ECCC's own picture, and what that frame
// shows at the pin. Online only. Moved out of app/main.ts; it reads the shared
// state in app/state.ts.
import { S, app } from '../state';
import type { LayerSlots, RadarAtPin, RadarPoint } from '../../layers/contract';
import { radarLayer, shownOf, type RadarShown } from '../../layers/radar';
import { COVERAGE, PRODUCTS, fetchFrames, radarAt, tileUrl as radarTileUrl } from '../../adapters/eccc-radar/radar';
import { savedOnlyActive } from '../data/connection';
import { ImageFrames } from '../map/image-frames';

// Radar (no v8 design yet): ECCC's pictures in ECCC's colours; the layer gets its legend from here, never from the source.
export const radarShown = (): RadarShown => shownOf(app.settingsFor(radar));
export const radar: LayerSlots = radarLayer((s) => PRODUCTS[s].legend, () => radarShown());
// ---- Radar frames: the times ECCC holds (last 3 h, every 6 min), and what the cursor's frame shows at the pin.
export let radarFrames: Date[] = [];
export let radarFor = '';
export let radarFetchedAt = 0;
export let radarError = false;
export const RADAR_REFRESH_MS = 6 * 60_000;
/** Values at the pin by product, place and frame (each frame is final once issued). */
export const radarPoints = new Map<string, RadarPoint | 'error'>();
export let radarPinTimer = 0;
export let radarRetried = '';
/** Radar is online only: no signal, or saved data only, means none. */
export const radarOffline = () => S.usingSaved || savedOnlyActive() || !navigator.onLine;
export const radarPointKey = (lat: number, lng: number, t: Date) => `${radarShown()}|${lat.toFixed(4)},${lng.toFixed(4)}|${t.toISOString()}`;
// ECCC's pictures sit over the terrain and under the labels; ECCC's colours, a little see-through so the map reads.
let radarImages: ImageFrames;
/** Creates the radar's picture layer once the map exists. */
export function setupRadar(): void {
  radarImages = new ImageFrames(S.map, 'radar', { opacity: 0.85, keep: 12, attribution: 'Radar © Environment and Climate Change Canada', maxzoom: 10 });
}
/** Radar's pictures sit under this map layer (the labels). */
export function radarBefore(id: string | undefined): void { radarImages.setBefore(id); }
/** Another layer fills the map: no radar picture. */
export function hideRadar(): void { radarImages.show(null); radarImages.setCoverage(null); }

export function radarPinData(): RadarAtPin | undefined {
  if (!S.active.frames) return undefined;
  const t = S.cursor.time && radarFrames.length ? S.cursor.time : null;
  const p = S.pin?.get();
  if (radarOffline()) return { frames: radarFrames, time: t, point: 'offline' };
  if (!radarFrames.length) return { frames: [], time: null, point: radarError ? 'error' : null };
  return { frames: radarFrames, time: t, point: p && t ? radarPoints.get(radarPointKey(p.lat, p.lng, t)) ?? null : null };
}

/** The frames the cursor steps through while radar is shown: it stays on the newest unless moved back. */
export function setFrameSteps() {
  const t = S.cursor.time;
  const onFrames = !!t && radarFrames.some((f) => f.getTime() === t.getTime());
  const atNewest = !t || !onFrames || (S.cursor.last && t.getTime() === S.cursor.last.getTime());
  S.cursor.setSteps(radarFrames, atNewest ? radarFrames[radarFrames.length - 1] : t);
  S.scrubber.setTimeline({ seams: [] });
}

/** Ask ECCC which frames it holds (once a frame, or now when `force`). */
export async function loadRadarFrames(force = false) {
  if (!S.active.frames) return;
  const shown = radarShown();
  if (radarOffline()) { app.renderRunAge(); app.renderReadout(); S.scrubber.refresh(); void app.updateFills(); return; }
  if (!force && shown === radarFor && Date.now() - radarFetchedAt < RADAR_REFRESH_MS) return;
  if (shown !== radarFor) { radarFrames = []; setFrameSteps(); }
  try {
    const times = await fetchFrames(PRODUCTS[shown].layer);
    if (shown !== radarShown()) return;
    radarFrames = times;
    radarFor = shown;
    radarFetchedAt = Date.now();
    radarError = false;
  } catch (err) {
    console.warn('radar frames unavailable', err);
    radarError = true;
  }
  if (!S.active.frames) return;
  setFrameSteps();
  app.renderRunAge();
  app.renderReadout();
  S.scrubber.refresh();
  void app.updateFills();
  scheduleRadarPin();
  document.body.dataset.radar = radarFrames.length ? 'ready' : 'error';
}

/** The cursor's frame at the pin, once the cursor rests (not on every frame while playing). */
export function scheduleRadarPin() {
  clearTimeout(radarPinTimer);
  if (S.active.frames) radarPinTimer = window.setTimeout(() => void loadRadarPin(), 800);
}
export async function loadRadarPin() {
  const p = S.pin?.get();
  const t = S.cursor.time;
  if (!S.active.frames || !p || !t || radarOffline() || !radarFrames.some((f) => f.getTime() === t.getTime())) return;
  const key = radarPointKey(p.lat, p.lng, t);
  if (radarPoints.get(key) && radarPoints.get(key) !== 'error') return;
  const v = await radarAt(radarShown(), p.lat, p.lng, t).catch((err) => { console.warn('radar at the pin', err); return 'error' as const; });
  radarPoints.set(key, v);
  if (radarPoints.size > 300) radarPoints.delete(radarPoints.keys().next().value!);
  // A dropped answer is asked for once more, a few seconds later.
  if (v === 'error' && radarRetried !== key) { radarRetried = key; radarPinTimer = window.setTimeout(() => void loadRadarPin(), 3000); }
  app.renderReadout();
  S.scrubber.refresh();
}

/** Show the cursor's frame, with the next ones loading behind it (and the loop's start at the newest). */
export function showRadarFrame() {
  const t = S.cursor.time;
  if (!t || !radarFrames.length || radarOffline()) { radarImages.show(null); radarImages.setCoverage(null); return; }
  const shown = radarShown();
  const prod = PRODUCTS[shown];
  radarImages.setSource(shown, (x) => radarTileUrl(prod.layer, prod.style, x));
  const i = radarFrames.findIndex((f) => f.getTime() === t.getTime());
  const newest = radarFrames[radarFrames.length - 1]!;
  const loopStart = radarFrames.find((f) => f.getTime() >= newest.getTime() - (S.active.frames?.loopHours ?? 1) * 3_600_000) ?? radarFrames[0]!;
  const ahead = i < 0 ? [] : [radarFrames[i + 1] ?? loopStart, radarFrames[i + 2]].filter((x): x is Date => !!x);
  radarImages.show(t, ahead);
  // ECCC's coverage at the newest frame: where its radars reach (grey beyond), so gaps never read as dry.
  radarImages.setCoverage(app.settingsFor(radar).coverage ? radarTileUrl(COVERAGE.layer, COVERAGE.style, newest) : null);
  document.body.dataset.fill = 'ready';
  document.body.dataset.radarFrame = t.toISOString();
}

