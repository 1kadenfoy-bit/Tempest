// TEMPORARY (Kaden, Nov 21): a slider to try different speeds for the windows
// that grow out of their button. Remove it, and keep the speed Kaden picks as a
// plain constant in panel.ts, once the animation is settled.
const KEY = 'tempest.growMs';
const DEFAULT_MS = 400;
let ms = DEFAULT_MS;
try { const v = Number(localStorage.getItem(KEY)); if (v >= 150 && v <= 4000) ms = v; } catch { /* storage unavailable */ }

/** How long a window takes to grow out of its button, in milliseconds. */
export const growMs = (): number => ms;

/** A small slider above the sheet. */
export function mountSpeedSlider(): void {
  const box = document.createElement('label');
  box.className = 'speed-slider';
  box.innerHTML = '<span class="speed-label"></span><input type="range" min="150" max="3000" step="50" aria-label="Window animation speed (temporary)">';
  const input = box.querySelector('input')!;
  const label = box.querySelector('.speed-label')!;
  const show = () => { label.textContent = `Grow ${(ms / 1000).toFixed(2)} s`; };
  input.value = String(ms);
  show();
  input.addEventListener('input', () => {
    ms = Number(input.value);
    show();
    try { localStorage.setItem(KEY, String(ms)); } catch { /* storage unavailable */ }
  });
  // Taps on it are not taps on the map behind it.
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.append(box);
}
