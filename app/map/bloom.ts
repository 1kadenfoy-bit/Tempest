// The bloom (Maps section, rule 23): a soft glow on bright things. It was part of
// the temporary Tune panel, which is gone (Kaden, Nov 27); the glow stays, at the
// strength settled in app/map/tuning.ts.
import { S } from '../state';
import { tuning, type Tuning } from './tuning';

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
  map.on('render', () => { if (tuning.get().bloom > 0) copy(); });
  const apply = (t: Tuning) => {
    el.style.opacity = String(t.bloom);
    el.style.display = t.bloom > 0 ? 'block' : 'none';
    if (t.bloom > 0) map.triggerRepaint(); // one draw to take a copy of
  };
  tuning.onChange(apply);
  apply(tuning.get());
}

