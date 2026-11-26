// Press-and-hold on the map (docs/02-design-spec.md, Gestures), and a right
// click on a computer. Either one hands the spot to `onPress`; the tap that a
// lifted finger or mouse would then make is swallowed, so a hold never also
// counts as a tap (no avalanche region or terrain panel opening under it).
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PressTracker } from './press';

export interface LongPressHandle {
  /** True while the click that ends a press-and-hold should be ignored. */
  consumeClick(): boolean;
}

export function setupLongPress(map: MapLibreMap, onPress: (point: { x: number; y: number }) => void): LongPressHandle {
  const box = map.getCanvasContainer();
  const tracker = new PressTracker();
  let timer = 0;
  let firedAt = -Infinity;
  /** The pointer whose hold fired: its lift (and the click after it) is swallowed. */
  let firedPointer: number | null = null;
  let swallowUntil = 0;

  /** Only presses on the map itself, or on the pin: not on a station, report pin or other marker. */
  // Not while an area is being chosen for saving (its box is dragged over the map).
  // Not while an area is being chosen for saving: the old save box (saveMode) or the
  // Save for offline card (saving), where one finger traces the area (Nov 26).
  const choosingArea = () => document.body.dataset.saveMode === 'true' || document.body.dataset.saving === 'true';
  const onMap = (t: EventTarget | null) => !choosingArea() && (t === map.getCanvas() || (t instanceof Element && !!t.closest('.pin')));
  const local = (clientX: number, clientY: number) => {
    const r = box.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const fire = (p: { x: number; y: number }) => {
    const now = performance.now();
    // Android also sends a context menu for a long touch: one press opens once.
    if (now - firedAt < 1000) return false;
    firedAt = now;
    swallowUntil = now + 600;
    onPress(p);
    return true;
  };

  /** Wait for the press now held; a timer that wakes a moment early waits again. */
  const arm = (id: number) => {
    clearTimeout(timer);
    const at = tracker.dueAt();
    if (at === null) return;
    timer = window.setTimeout(() => {
      // Let the finger's waiting moves and lift arrive first. On a busy page
      // the browser holds moves back to the next frame, and a lift can queue
      // behind this timer: a pan or a quick tap would then read as a hold
      // (Nov 21, seen on GitHub's slow test machines). Decide after the next
      // frame, once those have been handled.
      requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          // The tracker works in page pixels; the map's points are inside its box.
          const p = tracker.due(performance.now());
          if (!p) { arm(id); return; }
          // Set before the window opens: its scrim takes the lift.
          firedPointer = id;
          if (!fire(local(p.x, p.y))) firedPointer = null;
        }, 0);
      });
    }, Math.max(0, at - performance.now()) + 5);
  };

  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tracker.down(e.pointerId, e.clientX, e.clientY, performance.now());
    if (!onMap(e.target)) tracker.cancel();
    arm(e.pointerId);
  }, { passive: true });
  box.addEventListener('pointermove', (e) => tracker.move(e.pointerId, e.clientX, e.clientY), { passive: true });
  const lift = (e: PointerEvent) => {
    // A busy page can hand over the lift before the hold timer has decided.
    // When the finger was down, still, for the full hold (by the lift's own
    // time stamp), it was a hold: open now. A lift sooner is a tap.
    const at = tracker.dueAt();
    if (at !== null && tracker.holding(e.pointerId) && e.timeStamp >= at) {
      const p = tracker.due(e.timeStamp);
      clearTimeout(timer);
      if (p && fire(local(p.x, p.y))) swallowUntil = performance.now() + 400;
    }
    tracker.up(e.pointerId);
    if (firedPointer === e.pointerId) {
      firedPointer = null;
      // The tap a lifted finger makes comes just after the lift.
      swallowUntil = performance.now() + 400;
    }
  };
  // The lift can land on the window's scrim (it opens under the finger), so listen on the whole page.
  addEventListener('pointerup', lift, { passive: true, capture: true });
  addEventListener('pointercancel', lift, { passive: true, capture: true });
  map.on('movestart', () => tracker.cancel());

  // A right click (computer), or a long touch on Android: the browser's menu would make no sense over the map.
  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    tracker.cancel();
    if (!onMap(e.target)) return;
    fire(local(e.clientX, e.clientY));
  });

  return {
    consumeClick: () => firedPointer !== null || performance.now() < swallowUntil,
  };
}
