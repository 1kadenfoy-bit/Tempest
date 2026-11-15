// The bottom sheet: collapsed or pulled up, by tap on the handle or by drag.
export type SheetState = 'collapsed' | 'up';

export function setupSheet(sheet: HTMLElement, handle: HTMLElement, onChange: (s: SheetState) => void) {
  const scroll = sheet.querySelector<HTMLElement>('.sheet-scroll')!;
  const set = (s: SheetState) => {
    sheet.dataset.state = s;
    document.body.dataset.sheet = s;
    handle.setAttribute('aria-label', s === 'up' ? 'Lower the details' : 'Pull up for details');
    if (s === 'collapsed') scroll.scrollTop = 0;
    onChange(s);
  };
  set('collapsed');

  // How far down the sheet sits when collapsed: its height minus the visible
  // collapsed part (the --sheet-collapsed length, measured with a probe).
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:var(--sheet-collapsed)';
  document.body.append(probe);
  const collapsedOffset = () => Math.max(0, sheet.offsetHeight - probe.offsetHeight);

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
    startOffset = sheet.dataset.state === 'up' ? 0 : collapsedOffset();
    pointerId = e.pointerId;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 6) return;
    if (!moved) sheet.setPointerCapture(pointerId);
    moved = true;
    sheet.dataset.dragging = 'true';
    const max = collapsedOffset();
    const offset = Math.min(max, Math.max(0, startOffset + dy));
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
    const max = collapsedOffset();
    const offset = Math.min(max, Math.max(0, startOffset + (e.clientY - startY)));
    const goUp = velocity < -0.4 || (velocity <= 0.4 && offset < max / 2);
    set(goUp ? 'up' : 'collapsed');
  };
  sheet.addEventListener('pointerdown', onDown);
  sheet.addEventListener('pointermove', onMove);
  sheet.addEventListener('pointerup', onUp);
  sheet.addEventListener('pointercancel', onUp);
  handle.addEventListener('click', () => { if (!moved) set(sheet.dataset.state === 'up' ? 'collapsed' : 'up'); });
  return { set, get: () => sheet.dataset.state as SheetState };
}
