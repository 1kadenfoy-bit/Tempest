// The bottom sheet has three positions: tucked away (only the handle shows,
// so the map is clear), collapsed (the scrubber), and pulled up (details).
// Drag between them, or tap the handle: tucked → collapsed → up → collapsed.
export type SheetState = 'tucked' | 'collapsed' | 'up';

export function setupSheet(sheet: HTMLElement, handle: HTMLElement, onChange: (s: SheetState) => void) {
  const scroll = sheet.querySelector<HTMLElement>('.sheet-scroll')!;

  // Visible heights of the two lower positions, from CSS lengths.
  const probe = (len: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${len}`;
    document.body.append(el);
    return el;
  };
  const collapsedProbe = probe('var(--sheet-collapsed)');
  const tuckedProbe = probe('var(--sheet-tucked)');
  /** Distance the sheet is moved down for each position. */
  const offsets = (): Record<SheetState, number> => ({
    up: 0,
    collapsed: Math.max(0, sheet.offsetHeight - collapsedProbe.offsetHeight),
    tucked: Math.max(0, sheet.offsetHeight - tuckedProbe.offsetHeight),
  });

  const labels: Record<SheetState, string> = {
    tucked: 'Show the time and pin details',
    collapsed: 'Pull up for details',
    up: 'Lower the details',
  };
  const set = (s: SheetState) => {
    sheet.dataset.state = s;
    document.body.dataset.sheet = s;
    handle.setAttribute('aria-label', labels[s]);
    if (s !== 'up') scroll.scrollTop = 0;
    onChange(s);
  };
  set('collapsed');

  let startY = 0;
  let startOffset = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let moved = false;
  let pointerId = 0;

  const onDown = (e: PointerEvent) => {
    // When pulled up, only the handle drags; the details scroll.
    if (sheet.dataset.state === 'up' && !handle.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('button:not(.sheet-handle)')) return;
    dragging = true;
    moved = false;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    startOffset = offsets()[sheet.dataset.state as SheetState];
    pointerId = e.pointerId;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 6) return;
    if (!moved) sheet.setPointerCapture(pointerId);
    moved = true;
    sheet.dataset.dragging = 'true';
    const offset = Math.min(offsets().tucked, Math.max(0, startOffset + dy));
    sheet.style.transform = `translateY(${offset}px)`;
    velocity = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY;
    lastT = e.timeStamp;
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    delete sheet.dataset.dragging;
    sheet.style.transform = '';
    if (!moved) return;
    const o = offsets();
    const offset = Math.min(o.tucked, Math.max(0, startOffset + (e.clientY - startY)));
    const order: SheetState[] = ['up', 'collapsed', 'tucked'];
    let next: SheetState;
    if (Math.abs(velocity) > 0.5) {
      // A flick moves one position in its direction.
      const from = order.indexOf(sheet.dataset.state as SheetState);
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
    const s = sheet.dataset.state as SheetState;
    set(s === 'collapsed' ? 'up' : 'collapsed');
  });
  return { set, get: () => sheet.dataset.state as SheetState };
}
