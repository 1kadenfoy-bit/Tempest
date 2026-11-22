// The "Save for offline" card (docs/plans/offline-save.md, Kaden Nov 22). It
// slides up from the bottom and looks and acts like the weather card: it shows
// only a little at first (most of the screen is map), can be pushed down, and
// pulled up shows the time frame and every layer. The user traces the area on
// the map first; there is no starting area.
//
// The drawing tool (Maps) and the saving engine (Data) are called through
// save-stubs.ts, so this file does not change when the real ones arrive.
import type { LayerChoice, LayerEstimate, LayerTimeRange, SaveEstimate, SaveRequest, SaveShape } from '../../core/offline/save-request';
import { formatCursorTime } from '../../core/units/format';
import { MODELS as REGISTRY } from '../../adapters/openmeteo-maps/models';
import { modelsFor } from '../data/forecast';
import { trackSave } from '../notify/track-save';
import { S } from '../state';
import { icons } from './icons';
import { clampFrame, dragFrame, formatArea, formatBytes, ringAreaKm2, type Frame } from './save-math';
import { estimateSave, layerTimeRange, showShape, startDrawing, startSave, type Drawing } from './save-stubs';

const H = 3_600_000;
const MIN_SPAN = 2 * H;

type CardState = 'tucked' | 'peek' | 'up';

interface RowState { layer: string; title: string; on: boolean; model: string }

export function openSaveCard(onShowSaved: () => void): void {
  if (document.querySelector('.ofl-card')) return;
  document.body.dataset.saving = 'true';

  const card = document.createElement('section');
  card.className = 'ofl-card';
  card.setAttribute('aria-label', 'Save for offline');
  card.innerHTML = `
    <button class="sheet-handle ofl-handle" aria-label="Pull up to choose layers and time"><span></span></button>
    <div class="ofl-head">
      <span class="ofl-title">Save for offline</span>
      <button class="ofl-redraw" type="button">Redraw</button>
      <button class="ofl-close" type="button" aria-label="Close">${icons.close}</button>
    </div>
    <p class="ofl-summary" role="status"></p>
    <div class="ofl-scroll">
      <div class="ofl-time">
        <span class="group-title">TIME TO SAVE</span>
        <div class="ofl-axis"><div class="ofl-days"></div><div class="ofl-frame" data-part="move"><span class="ofl-grip" data-part="from"></span><span class="ofl-grip" data-part="to"></span></div></div>
        <p class="ofl-span panel-note"></p>
      </div>
      <div class="ofl-layers"><span class="group-title">LAYERS</span><div class="ofl-rows"></div></div>
    </div>
    <div class="ofl-foot"><button class="ofl-go" type="button"></button></div>`;
  document.body.append(card);

  const $q = <T extends HTMLElement>(s: string) => card.querySelector<T>(s)!;
  const summary = $q('.ofl-summary');
  const go = $q<HTMLButtonElement>('.ofl-go');

  // ── State ───────────────────────────────────────────────────────────
  let shape: SaveShape | null = null;
  let drawing: Drawing | null = null;
  let cardState: CardState = 'peek';
  let est: SaveEstimate | null = null;
  const rows: RowState[] = S.layers.map((l) => ({ layer: l.id, title: l.title, on: l.id === S.active.id, model: 'auto' }));
  const ranges = new Map<string, LayerTimeRange>();
  const now = Date.now();
  let axis: Frame = { from: now - 48 * H, to: now + 72 * H };
  let frame: Frame = { from: now, to: now + 48 * H };

  // ── Placing the card (same three positions as the weather card) ─────
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:var(--bottom-inset)';
  document.body.append(probe);
  const heights = () => {
    const inset = probe.offsetHeight;
    const peekH = $q('.ofl-handle').offsetHeight + $q('.ofl-head').offsetHeight + summary.offsetHeight + 4 + inset;
    return { tucked: $q('.ofl-handle').offsetHeight + 8 + inset, peek: peekH };
  };
  const offsetFor = (s: CardState) => {
    if (s === 'up') return 0;
    return Math.max(0, card.offsetHeight - heights()[s]);
  };
  const place = () => {
    if (card.dataset.dragging) return;
    card.style.transform = `translateY(${offsetFor(cardState)}px)`;
  };
  const setCard = (s: CardState) => { cardState = s; card.dataset.state = s; place(); };

  // Drag the handle or the header: follows the finger, then snaps to the nearest position.
  let startY = 0, startOff = 0, lastY = 0, lastT = 0, vel = 0, moved = false;
  const dragStart = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button:not(.ofl-handle)')) return;
    startY = lastY = e.clientY; startOff = offsetFor(cardState); lastT = e.timeStamp; vel = 0; moved = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    card.dataset.dragging = 'true';
  };
  const dragMove = (e: PointerEvent) => {
    if (!card.dataset.dragging) return;
    if (Math.abs(e.clientY - startY) > 4) moved = true;
    const off = Math.max(0, Math.min(offsetFor('tucked'), startOff + (e.clientY - startY)));
    card.style.transform = `translateY(${off}px)`;
    const dt = e.timeStamp - lastT;
    if (dt > 0) vel = (e.clientY - lastY) / dt;
    lastY = e.clientY; lastT = e.timeStamp;
  };
  const dragEnd = (e: PointerEvent) => {
    if (!card.dataset.dragging) return;
    delete card.dataset.dragging;
    if (!moved) {
      // A tap on the handle: tucked, peek, up, peek.
      if ((e.currentTarget as HTMLElement).classList.contains('ofl-handle')) setCard(cardState === 'tucked' ? 'peek' : cardState === 'peek' ? 'up' : 'peek');
      else place();
      return;
    }
    const off = Math.max(0, Math.min(offsetFor('tucked'), startOff + (e.clientY - startY))) + vel * 120;
    const options: CardState[] = ['up', 'peek', 'tucked'];
    setCard(options.reduce((best, s) => (Math.abs(offsetFor(s) - off) < Math.abs(offsetFor(best) - off) ? s : best)));
  };
  for (const el of [$q('.ofl-handle'), $q('.ofl-head')]) {
    el.addEventListener('pointerdown', dragStart);
    el.addEventListener('pointermove', dragMove);
    el.addEventListener('pointerup', dragEnd);
    el.addEventListener('pointercancel', dragEnd);
  }

  // ── The request, the estimate ───────────────────────────────────────
  const request = (): SaveRequest | null => {
    if (!shape) return null;
    const layers: LayerChoice[] = rows.filter((r) => r.on).map((r) => ({ layer: r.layer, model: r.model }));
    return { shape, layers, from: new Date(frame.from), to: new Date(frame.to) };
  };
  let estTimer = 0;
  let estSeq = 0;
  const refreshEstimate = () => {
    clearTimeout(estTimer);
    estTimer = window.setTimeout(async () => {
      const req = request();
      if (!req) { est = null; paint(); return; }
      const mine = ++estSeq;
      card.dataset.estimating = 'true';
      const e = await estimateSave(req);
      if (mine !== estSeq) return;
      delete card.dataset.estimating;
      est = e;
      paint();
    }, 250);
  };

  // ── Painting the parts ──────────────────────────────────────────────
  const spanText = () => {
    const hours = Math.round((frame.to - frame.from) / H);
    const len = hours >= 48 ? `${Math.round(hours / 24)} d` : `${hours} h`;
    return `${formatCursorTime(new Date(frame.from))} to ${formatCursorTime(new Date(frame.to))} · ${len}`;
  };
  const rowEls = new Map<string, HTMLElement>();
  const paintRows = () => {
    for (const r of rows) {
      const el = rowEls.get(r.layer);
      if (!el) continue;
      el.dataset.on = String(r.on);
      el.querySelector('.ofl-tick')!.setAttribute('aria-checked', String(r.on));
      const range = ranges.get(r.layer);
      const e: LayerEstimate | undefined = est?.layers.find((x) => x.layer === r.layer);
      const bits = [range?.age, range ? `reaches ${formatCursorTime(range.latest)}` : null, e?.note].filter(Boolean);
      el.querySelector('.ofl-note')!.textContent = bits.join(' · ');
      el.querySelector('.ofl-size')!.textContent = r.on && e ? formatBytes(e.bytes) : '';
    }
  };
  const paintAxis = () => {
    const span = axis.to - axis.from;
    const pct = (t: number) => `${((t - axis.from) / span) * 100}%`;
    const f = $q('.ofl-frame');
    f.style.left = pct(frame.from);
    f.style.width = `${((frame.to - frame.from) / span) * 100}%`;
    $q('.ofl-span').textContent = spanText();
  };
  const axisEl = $q('.ofl-axis');
  const paintDays = () => {
    const days = $q('.ofl-days');
    days.replaceChildren();
    const span = axis.to - axis.from;
    const d = new Date(axis.from);
    d.setHours(24, 0, 0, 0);
    // A label every few days when the axis is long, so they never run together (about 40 px each).
    const perDay = (axisEl.clientWidth || 358) / (span / (24 * H));
    const every = Math.max(1, Math.ceil(40 / perDay));
    let n = 0;
    for (let t = d.getTime(); t < axis.to; t += 24 * H, n++) {
      if (n % every) continue;
      const tick = document.createElement('span');
      tick.style.left = `${((t - axis.from) / span) * 100}%`;
      tick.textContent = formatCursorTime(new Date(t)).split(' ')[0]!;
      days.append(tick);
    }
  };
  const paint = () => {
    if (!shape) summary.textContent = drawing ? 'Trace a closed shape on the map with one finger.' : 'Draw the area to save on the map.';
    else {
      const km2 = ringAreaKm2(shape.outline);
      summary.textContent = `Area ${formatArea(km2)}${est ? ` · map ${formatBytes(est.mapBytes)}` : ''}${cardState === 'peek' ? ' · pull up for layers and time' : ''}`;
    }
    $q('.ofl-redraw').textContent = drawing ? 'Cancel drawing' : 'Redraw';
    go.disabled = !shape;
    go.textContent = shape ? `Save data${est ? ` · ${formatBytes(est.totalBytes)}` : ''}` : 'Draw the area first';
    paintAxis();
    paintRows();
    requestAnimationFrame(place);
  };

  // ── The time frame: two handles and the frame itself ────────────────
  let dragPart: 'from' | 'to' | 'move' | null = null;
  let dragStartFrame = frame;
  let dragX = 0;
  axisEl.addEventListener('pointerdown', (e) => {
    const part = (e.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part as 'from' | 'to' | 'move' | undefined;
    if (!part) return;
    dragPart = part; dragStartFrame = frame; dragX = e.clientX;
    axisEl.setPointerCapture(e.pointerId);
  });
  axisEl.addEventListener('pointermove', (e) => {
    if (!dragPart) return;
    const ms = ((e.clientX - dragX) / axisEl.clientWidth) * (axis.to - axis.from);
    frame = dragFrame(dragStartFrame, dragPart, ms, axis, MIN_SPAN);
    paintAxis();
  });
  const frameDone = () => { if (!dragPart) return; dragPart = null; refreshEstimate(); };
  axisEl.addEventListener('pointerup', frameDone);
  axisEl.addEventListener('pointercancel', frameDone);

  // ── Layer rows ──────────────────────────────────────────────────────
  const rowsEl = $q('.ofl-rows');
  const loadRange = async (r: RowState) => {
    const range = await layerTimeRange(r.layer, r.model);
    ranges.set(r.layer, range);
    // The axis spans every layer's reach; the frame stays inside it.
    const all = [...ranges.values()];
    axis = { from: Math.min(...all.map((x) => x.earliest.getTime())), to: Math.max(...all.map((x) => x.latest.getTime())) };
    frame = clampFrame(frame, axis, MIN_SPAN);
    paintDays();
    paint();
  };
  for (const r of rows) {
    const layer = S.layers.find((l) => l.id === r.layer)!;
    const el = document.createElement('div');
    el.className = 'ofl-row';
    el.dataset.layer = r.layer;
    const choices = layer.frames ? [] : modelsFor(layer);
    el.innerHTML = `
      <button class="ofl-tick" type="button" role="checkbox" aria-checked="false" aria-label="Save ${r.title}">${icons.check}</button>
      <span class="ofl-name"></span>
      <span class="ofl-model"></span>
      <span class="ofl-note"></span>
      <span class="ofl-size"></span>`;
    el.querySelector('.ofl-name')!.textContent = r.title;
    const slot = el.querySelector('.ofl-model')!;
    if (choices.length) {
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `${r.title}: model`);
      sel.append(new Option('Auto', 'auto'), ...choices.map((m) => new Option(REGISTRY[m].label, m)));
      sel.value = r.model;
      sel.addEventListener('change', () => { r.model = sel.value; void loadRange(r).then(refreshEstimate); });
      slot.append(sel);
    } else slot.textContent = 'Auto';
    el.querySelector('.ofl-tick')!.addEventListener('click', () => { r.on = !r.on; paint(); refreshEstimate(); });
    rowEls.set(r.layer, el);
    rowsEl.append(el);
  }
  void Promise.all(rows.map(loadRange)).then(() => {
    // Start with the next two days; the frame can then be moved anywhere in the axis.
    frame = clampFrame({ from: now, to: now + 48 * H }, axis, MIN_SPAN);
    paintDays();
    paint();
  });

  // ── Drawing the area, closing, saving ───────────────────────────────
  const begin = () => {
    drawing?.cancel();
    const d = startDrawing(S.map);
    drawing = d;
    setCard('peek');
    paint();
    void d.shape.then((s) => {
      if (drawing !== d) return;
      drawing = null;
      if (s) { shape = s; showShape(S.map, s); refreshEstimate(); }
      paint();
    });
  };
  $q('.ofl-redraw').addEventListener('click', () => {
    if (drawing) { drawing.cancel(); return; }
    begin();
  });
  const close = () => {
    drawing?.cancel();
    drawing = null;
    clearTimeout(estTimer);
    showShape(S.map, null);
    probe.remove();
    card.remove();
    delete document.body.dataset.saving;
  };
  $q('.ofl-close').addEventListener('click', close);
  go.addEventListener('click', () => {
    const req = request();
    if (!req) return;
    const name = 'Saved area';
    const job = startSave(req);
    trackSave(job, name, onShowSaved);
    close();
  });
  addEventListener('resize', place);

  setCard('peek');
  paint();
  begin();
}
