// The bottom sheet has three positions: tucked away (only the handle shows,
// so the map is clear), collapsed (the scrubber), and pulled up (details).
// Drag between them, or tap the handle: tucked → collapsed → up → collapsed.
//
// Positions are measured against the visible screen (innerHeight), not the
// sheet's own box: on an installed iPhone app the box can reach below the
// screen, which once tucked the sheet out of sight. The collapsed height is
// measured from the content, so it grows when a layer's summary needs more
// lines.
export type SheetState = 'tucked' | 'collapsed' | 'up';

export function setupSheet(sheet: HTMLElement, handle: HTMLElement, onChange: (s: SheetState) => void) {
  const scroll = sheet.querySelector<HTMLElement>('.sheet-scroll')!;
  const scrubber = sheet.querySelector<HTMLElement>('.sheet-scrubber')!;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:var(--bottom-inset)';
  document.body.append(probe);
  const root = document.documentElement;

  /** The visible part of the sheet in each lower position, in px. */
  const visibleHeights = () => {
    const inset = probe.offsetHeight;
    const handleH = handle.offsetHeight;
    // Measured from the sheet's top (the sheet is the scrubber's offset parent).
    const top = scrubber.offsetTop + scrubber.offsetHeight;
    // v8 leaves 9 px of room under the legend (320 px tall at one line).
    return { collapsed: Math.round(top + 9 + inset), tucked: Math.round(handleH + 8 + inset) };
  };
  /** How far down to move the sheet for a position, from the screen's real height. */
  const offsetFor = (s: SheetState) => {
    if (s === 'up') return 0;
    const v = visibleHeights();
    const sheetTop = parseFloat(getComputedStyle(sheet).top) || 0;
    const screenH = window.visualViewport?.height ?? innerHeight;
    return Math.max(0, screenH - v[s] - sheetTop);
  };

  const labels: Record<SheetState, string> = {
    tucked: 'Show the time and pin details',
    collapsed: 'Pull up for details',
    up: 'Lower the details',
  };
  let state: SheetState = 'collapsed';
  const place = () => {
    if (sheet.dataset.dragging) return;
    sheet.style.transform = `translateY(${offsetFor(state)}px)`;
    const v = visibleHeights();
    root.style.setProperty('--sheet-collapsed-px', `${v.collapsed}px`);
    root.style.setProperty('--sheet-visible', `${state === 'tucked' ? v.tucked : v.collapsed}px`);
  };
  const set = (s: SheetState) => {
    state = s;
    sheet.dataset.state = s;
    document.body.dataset.sheet = s;
    handle.setAttribute('aria-label', labels[s]);
    if (s !== 'up') scroll.scrollTop = 0;
    place();
    onChange(s);
  };
  set('collapsed');
  addEventListener('resize', place);
  window.visualViewport?.addEventListener('resize', place);
  new ResizeObserver(place).observe(scrubber);

  let startY = 0;
  let startX = 0;
  let startOffset = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let moved = false;
  let pointerId = 0;

  const onDown = (e: PointerEvent) => {
    // When pulled up, only the handle drags; the details scroll.
    if (state === 'up' && !handle.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('button:not(.sheet-handle)')) return;
    // A drag that starts on the chart or the week strip moves time, never the
    // sheet, however the finger drifts (Kaden, Nov 16).
    if ((e.target as HTMLElement).closest('.chart, .week')) return;
    dragging = true;
    moved = false;
    startY = lastY = e.clientY;
    startX = e.clientX;
    lastT = e.timeStamp;
    startOffset = offsetFor(state);
    pointerId = e.pointerId;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 6) return;
    // Elsewhere on the sheet, only a clearly vertical drag moves it.
    if (!moved && Math.abs(e.clientX - startX) > Math.abs(dy)) { dragging = false; return; }
    if (!moved) sheet.setPointerCapture(pointerId);
    moved = true;
    sheet.dataset.dragging = 'true';
    const offset = Math.min(offsetFor('tucked'), Math.max(0, startOffset + dy));
    sheet.style.transform = `translateY(${offset}px)`;
    velocity = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY;
    lastT = e.timeStamp;
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    delete sheet.dataset.dragging;
    if (!moved) { place(); return; }
    const o: Record<SheetState, number> = { up: 0, collapsed: offsetFor('collapsed'), tucked: offsetFor('tucked') };
    const offset = Math.min(o.tucked, Math.max(0, startOffset + (e.clientY - startY)));
    const order: SheetState[] = ['up', 'collapsed', 'tucked'];
    let next: SheetState;
    if (Math.abs(velocity) > 0.5) {
      // A flick moves one position in its direction.
      const from = order.indexOf(state);
      next = order[Math.min(2, Math.max(0, from + (velocity > 0 ? 1 : -1)))]!;
    } else {
      next = order.reduce((best, s) => (Math.abs(o[s] - offset) < Math.abs(o[best] - offset) ? s : best), 'up' as SheetState);
    }
    set(next);
  };
  sheet.addEventListener('pointerdown', onDown);
  sheet.addEventListener('pointermove', onMove);
  sheet.addEventListener('pointerup', onUp);
  sheet.addEventListener('pointercancel', onUp);
  handle.addEventListener('click', () => {
    if (moved) return;
    set(state === 'collapsed' ? 'up' : 'collapsed');
  });
  return {
    set,
    get: () => state,
    /** Visible height of the collapsed sheet, for the map's centre. */
    collapsedHeight: () => visibleHeights().collapsed,
    place,
  };
}
