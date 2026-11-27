// The bloom (Maps section, rule 23): a soft glow on bright things. It was part of
// the temporary Tune panel, which is gone (Kaden, Nov 27); the glow stays, at the
// strength settled in app/map/tuning.ts.
import { S } from '../state';
import { tuning } from './tuning';
import type { Theme } from '../theme/tokens';
import { onWeatherCover, weatherCover } from './ground-veil';

/**
 * How much of the bloom each theme takes. On the light theme nearly the whole map is
 * "bright", so a full bloom lays a white haze over everything and washes out the relief,
 * water and labels (rule 18): it keeps only a hint.
 */
const THEME_BLOOM: Record<Theme, number> = { dark: 1, light: 0.2 };

/**
 * Under a weather layer that colours the whole map, the light parts of its colours (near
 * 0 °C, light wind) would glow into a haze over everything: the bloom drops to this share.
 */
const UNDER_WEATHER = 0.35;

/** The bloom's strength for the settled tuning, a theme and how much of the map the weather colours (0 to 1). */
export function bloomStrength(bloom: number, theme: Theme, cover = 0): number {
  return bloom * THEME_BLOOM[theme] * (1 - (1 - UNDER_WEATHER) * cover);
}

let refresh: () => void = () => {};
/** Re-reads the theme (the app calls it when the theme changes). */
export function refreshBloom(): void { refresh(); }

const css = (el: HTMLElement, styles: Record<string, string>) => Object.assign(el.style, styles);

/**
 * The bloom: a small, blurred, brightened copy of the map laid over it with the screen
 * blend, so bright things glow. The copy is taken after every drawn frame, so it always
 * matches the map exactly: a copy taken only a few times a second lagged behind a moving
 * map and showed as a fuzzy white pulse while panning. At rest nothing is drawn, so
 * nothing is copied.
 */
export function setupBloom(): void {
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
  // Pages without the app's settings (the effects and phone test pages) use the dark theme.
  const strength = () => bloomStrength(tuning.get().bloom, S.settings?.theme() ?? 'dark', weatherCover());
  map.on('render', () => { if (strength() > 0) copy(); });
  const apply = () => {
    const b = strength();
    el.style.opacity = String(b);
    el.style.display = b > 0 ? 'block' : 'none';
    if (b > 0) map.triggerRepaint(); // one draw to take a copy of
  };
  tuning.onChange(apply);
  onWeatherCover(apply);
  refresh = apply;
  apply();
}

