// Save for offline (v8 08-SaveArea): a dashed box with corner handles over the
// map, an instruction strip where the top bar sits, and a panel with layers,
// time window, sizes and the Save button. The map stays movable under the
// box; the area saved is whatever the box covers.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { estimateSaveBytes } from '../../core/offline/saved-area';

export interface SaveChoice {
  bbox: [number, number, number, number];
  /** Hours from now to save, or null for the model's end. */
  hours: number | null;
}

const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const DOWNLOAD = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const mb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} kB` : `${Math.round(b / 1e6)} MB`);
/** A box bigger than this would take too long and too much space on a phone. */
const MAX_BYTES = 400e6;

export function openSaveMode(map: MapLibreMap, opts: {
  modelHours: number;
  /** Exact base map bytes for a box, from the map files' indexes. */
  basemapBytes(bbox: [number, number, number, number]): Promise<number>;
  save(choice: SaveChoice, onProgress: (text: string) => void): Promise<void>;
  onClose(): void;
}): void {
  document.body.dataset.saveMode = 'true';
  const root = document.createElement('div');
  root.className = 'save-mode';
  root.innerHTML = `
    <div class="save-strip"><span>Drag the corners to cover your area</span><button class="pill-button save-cancel">Cancel</button></div>
    <div class="save-box"><span class="save-handle" data-c="nw"></span><span class="save-handle" data-c="ne"></span><span class="save-handle" data-c="sw"></span><span class="save-handle" data-c="se"></span></div>
    <div class="save-panel" role="dialog" aria-label="Save for offline">
      <div class="panel-header">
        <span class="panel-icon">${DOWNLOAD}</span>
        <span class="panel-titles"><span class="panel-title">Save for offline</span><span class="panel-caption save-area-size"></span></span>
        <button class="panel-close save-close" aria-label="Close">${CLOSE}</button>
      </div>
      <div class="panel-body">
        <div class="group">
          <span class="group-title">LAYERS</span>
          <label class="check-row"><input type="checkbox" checked disabled><span class="check-box">${CHECK}</span><span class="check-text"><span class="check-title">Precipitation</span><span class="check-note save-layer-size"></span></span></label>
        </div>
        <div class="group">
          <span class="group-title">TIME WINDOW</span>
          <div class="segmented save-window"><button data-h="24" aria-pressed="false">24 h</button><button data-h="end" aria-pressed="true">Model end</button></div>
        </div>
        <div class="save-map-line"><span>Map and terrain, finest detail</span><span class="save-map-size"></span></div>
        <button class="primary-button save-go"></button>
      </div>
    </div>`;
  document.body.append(root);
  const box = root.querySelector<HTMLElement>('.save-box')!;
  const go = root.querySelector<HTMLButtonElement>('.save-go')!;
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;

  // The box, in screen pixels: between the strip and the panel, inset from the edges.
  const strip = $('.save-strip').getBoundingClientRect();
  const panel = $('.save-panel').getBoundingClientRect();
  let rect = { x: 44, y: strip.bottom + 24, w: innerWidth - 88, h: Math.max(80, panel.top - strip.bottom - 48) };
  let hours: number | null = null;
  let saving = false;

  const bbox = (): [number, number, number, number] => {
    const a = map.unproject([rect.x, rect.y + rect.h]);
    const b = map.unproject([rect.x + rect.w, rect.y]);
    return [a.lng, a.lat, b.lng, b.lat];
  };
  const render = () => {
    Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    if (saving) return;
    const bb = bbox();
    const kmW = (bb[2] - bb[0]) * 111.32 * Math.cos((((bb[1] + bb[3]) / 2) * Math.PI) / 180);
    const kmH = (bb[3] - bb[1]) * 110.57;
    $('.save-area-size').textContent = `Area · ${Math.round(kmW)} × ${Math.round(kmH)} km`;
    const est = estimateSaveBytes(bb, hours ?? opts.modelHours);
    $('.save-layer-size').textContent = `Grids for this area · about ${mb(est.weather)}`;
    const key = bb.map((v) => v.toFixed(3)).join(',');
    const known = basemapSizes.get(key);
    if (known === undefined) {
      $('.save-map-size').textContent = 'sizing…';
      go.disabled = true;
      go.textContent = 'Save area';
      clearTimeout(sizeTimer);
      sizeTimer = window.setTimeout(() => {
        void opts.basemapBytes(bb).then((b) => { basemapSizes.set(key, b); render(); }).catch(() => { basemapSizes.set(key, 0); render(); });
      }, 250);
      return;
    }
    $('.save-map-size').textContent = `about ${mb(known + est.terrain)}`;
    const total = est.weather + known + est.terrain + est.other;
    const tooBig = total > MAX_BYTES;
    go.disabled = tooBig;
    go.textContent = tooBig ? `Too big (about ${mb(total)}) · make the box smaller` : `Save area · about ${mb(total)}`;
  };
  const basemapSizes = new Map<string, number>();
  let sizeTimer = 0;
  render();
  map.on('move', render);

  // Corner handles
  root.querySelectorAll<HTMLElement>('.save-handle').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const c = h.dataset.c!;
      const start = { ...rect };
      const x0 = e.clientX, y0 = e.clientY;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        const min = 48;
        let { x, y, w, h: hh } = start;
        if (c.includes('w')) { x = Math.min(start.x + start.w - min, start.x + dx); w = start.w + (start.x - x); }
        if (c.includes('e')) w = Math.max(min, start.w + dx);
        if (c.includes('n')) { y = Math.min(start.y + start.h - min, start.y + dy); hh = start.h + (start.y - y); }
        if (c.includes('s')) hh = Math.max(min, start.h + dy);
        rect = { x: Math.max(4, x), y: Math.max(4, y), w: Math.min(innerWidth - 8, w), h: hh };
        render();
      };
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
  });

  // Time window
  root.querySelectorAll<HTMLButtonElement>('.save-window button').forEach((b) => {
    b.addEventListener('click', () => {
      hours = b.dataset.h === 'end' ? null : Number(b.dataset.h);
      root.querySelectorAll('.save-window button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
  });

  const close = () => {
    if (saving) return;
    map.off('move', render);
    root.remove();
    delete document.body.dataset.saveMode;
    opts.onClose();
  };
  $('.save-cancel').addEventListener('click', close);
  $('.save-close').addEventListener('click', close);

  go.addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    go.disabled = true;
    try {
      await opts.save({ bbox: bbox(), hours }, (text) => { go.textContent = text; });
      saving = false;
      close();
    } catch (err) {
      saving = false;
      go.disabled = false;
      go.textContent = `Could not save: ${String((err as Error).message ?? err)} · try again`;
    }
  });
}
