// TEMPORARY design tuning panel (Maps section), only for judging the map's look on a
// phone: a small "Tune" button opens a panel of switches and sliders. Delete this file
// and its one call in setup.ts once the look is settled.
//
//   Overlays off   hides the map's overlays (peaks, trails, huts and so on)
//   Weather layers off   hides the weather: fills, wind flow, lines, avalanche, smoke, radar
//   Satellite      the Satellite ground
//   Sun & shadows  the time of day from the scrubber, with mountain shadows
//   Haze           background haze and fog in 3D
//   Relief, Shadow tint, Mountain shadows   how strong the lighting is
//   Bloom          a soft glow on bright things (a blurred, brightened copy of the map laid over it)
import { S } from '../state';
import { precipLayer, tempLayer, windLayer } from '../weather/fills';
import { mapSettings, type MapSettings } from './map-settings';
import { tuning, type Tuning } from './tuning';

const OVERLAY_KEYS: (keyof MapSettings)[] = ['trails', 'trailNames', 'huts', 'camps', 'peaks', 'peakHeights', 'contours', 'smallRoads', 'skiLifts', 'parkBoundaries', 'regionBoundaries', 'municipalBoundaries'];
/** Map layers the weather and safety sections draw, by id: lines, fills and radar pictures. */
const WEATHER_STYLE = /^(avy-|ates-|air-|freezing-line|radar-)/;

/**
 * Hides every weather drawing: the colour fills (custom layers that decide their own
 * visibility, so it is overridden on the layer itself), the wind flow canvas, and the
 * lines, avalanche, smoke and radar layers. Kept hidden while on, even if the weather
 * code shows one again, by checking after each draw.
 */
let weatherHidden = false;
function setWeatherHidden(hide: boolean): void {
  weatherHidden = hide;
  for (const layer of [precipLayer, tempLayer, windLayer] as unknown as { visible: boolean; __real?: boolean }[]) {
    if (!('__real' in layer)) {
      layer.__real = layer.visible;
      Object.defineProperty(layer, 'visible', { get: () => (weatherHidden ? false : layer.__real!), set: (v: boolean) => { layer.__real = v; }, configurable: true });
    }
  }
  const flowCanvas = document.querySelector<HTMLElement>('.flow-canvas');
  if (flowCanvas) flowCanvas.style.visibility = hide ? 'hidden' : '';
  enforce();
  S.map.triggerRepaint();
}
function enforce(): void {
  if (!weatherHidden) return;
  for (const l of S.map.getStyle().layers) {
    if (WEATHER_STYLE.test(l.id) && (S.map.getLayoutProperty(l.id, 'visibility') ?? 'visible') !== 'none') S.map.setLayoutProperty(l.id, 'visibility', 'none');
  }
}

const css = (el: HTMLElement, styles: Record<string, string>) => Object.assign(el.style, styles);

function button(label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  css(b, { minHeight: '44px', padding: '0 12px', border: '1px solid var(--stroke-strong)', borderRadius: 'var(--radius-button-tile-row)', background: 'var(--fill-control)', color: 'var(--ink)', font: 'var(--type-body)', cursor: 'pointer' });
  b.addEventListener('click', () => onClick(b));
  return b;
}

function pressed(b: HTMLButtonElement, on: boolean) {
  b.setAttribute('aria-pressed', String(on));
  b.style.background = on ? 'var(--ink)' : 'var(--fill-control)';
  b.style.color = on ? 'var(--surface)' : 'var(--ink)';
}

function slider(label: string, key: keyof Tuning, min: number, max: number): HTMLElement {
  const row = document.createElement('label');
  css(row, { display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 8px', font: 'var(--type-secondary)', color: 'var(--ink-2)' });
  const value = document.createElement('span');
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '0.05';
  input.value = String(tuning.get()[key]);
  css(input, { gridColumn: '1 / 3', width: '100%', minHeight: '32px' });
  const show = () => { value.textContent = Number(input.value).toFixed(2); };
  input.addEventListener('input', () => { show(); tuning.set({ [key]: Number(input.value) }); });
  tuning.onChange((t) => { input.value = String(t[key]); show(); });
  show();
  row.append(label, value, input);
  return row;
}

/**
 * The bloom: a small, blurred, brightened copy of the map laid over it with the screen
 * blend, so bright things glow. The copy is taken after every drawn frame, so it always
 * matches the map exactly: a copy taken only a few times a second lagged behind a moving
 * map and showed as a fuzzy white pulse while panning. At rest nothing is drawn, so
 * nothing is copied.
 */
function bloomOverlay(): void {
  const map = S.map;
  const el = document.createElement('canvas');
  css(el, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1', display: 'none',
    // Keep only the bright parts (darken, push contrast), blur them, and add them back.
    filter: 'brightness(0.62) contrast(2.6) blur(9px) saturate(1.3)', mixBlendMode: 'screen',
  });
  document.getElementById('map')?.append(el);
  const g = el.getContext('2d')!;
  /** The copy is this many times smaller than the map: the blur hides the difference, and it is cheap to take every frame. */
  const SHRINK = 8;
  const copy = () => {
    const src = map.getCanvas();
    const w = Math.max(1, Math.round(src.width / SHRINK)), h = Math.max(1, Math.round(src.height / SHRINK));
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
    try { g.drawImage(src, 0, 0, w, h); } catch { /* the picture was not available this frame */ }
  };
  // `render` fires after each frame is drawn, so the copy is of that same frame.
  map.on('render', () => { if (tuning.get().bloom > 0) copy(); });
  const apply = (t: Tuning) => {
    el.style.opacity = String(t.bloom);
    el.style.display = t.bloom > 0 ? 'block' : 'none';
    if (t.bloom > 0) map.triggerRepaint(); // one draw to take a copy of
  };
  tuning.onChange(apply);
  apply(tuning.get());
}

export function setupTuner(): void {
  const open = button('Tune', () => { panel.style.display = panel.style.display === 'none' ? 'grid' : 'none'; });
  css(open, { position: 'fixed', left: '8px', top: 'calc(env(safe-area-inset-top, 0px) + 150px)', zIndex: '30', minWidth: '44px', background: 'var(--surface)' });
  const panel = document.createElement('div');
  css(panel, {
    position: 'fixed', left: '8px', top: 'calc(env(safe-area-inset-top, 0px) + 200px)', zIndex: '30', width: 'min(260px, calc(100vw - 16px))', maxHeight: '40vh', overflowY: 'auto',
    display: 'none', gap: '8px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--stroke)', borderRadius: 'var(--radius-grow-panel)', color: 'var(--ink)', font: 'var(--type-body)',
  });
  const title = document.createElement('div');
  title.textContent = 'Map tuning (temporary)';
  css(title, { font: 'var(--type-panel-title)' });

  // Switches
  let savedOverlays: Partial<MapSettings> | null = null;
  const overlays = button('Overlays off', (b) => {
    if (!savedOverlays) {
      const now = mapSettings.get();
      savedOverlays = Object.fromEntries(OVERLAY_KEYS.map((k) => [k, now[k]]));
      mapSettings.set(Object.fromEntries(OVERLAY_KEYS.map((k) => [k, false])));
    } else { mapSettings.set(savedOverlays); savedOverlays = null; }
    pressed(b, savedOverlays !== null);
  });
  const weather = button('Weather layers off', (b) => {
    setWeatherHidden(!weatherHidden);
    pressed(b, weatherHidden);
  });
  S.map.on('render', enforce);
  const satellite = button('Satellite', (b) => {
    const on = mapSettings.get().ground !== 'satellite';
    mapSettings.set({ ground: on ? 'satellite' : 'shaded' });
    pressed(b, on);
  });
  pressed(satellite, mapSettings.get().ground === 'satellite');
  const sun = button('Sun & shadows', (b) => { const on = !mapSettings.get().sun; mapSettings.set({ sun: on }); pressed(b, on); });
  pressed(sun, mapSettings.get().sun);
  const switches = document.createElement('div');
  css(switches, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' });
  switches.append(overlays, weather, satellite, sun);

  const reset = button('Reset sliders', () => tuning.reset());
  panel.append(title, switches,
    slider('Haze (3D background)', 'haze', 0, 1),
    slider('Relief strength', 'relief', 0, 1.8),
    slider('Shadow and light tint', 'tint', 0, 2.5),
    slider('Mountain shadows', 'cast', 0, 1.5),
    slider('Bloom', 'bloom', 0, 1),
    reset);
  document.body.append(open, panel);
  bloomOverlay();
}
