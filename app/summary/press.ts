// Press-and-hold, as pure state: one finger (or the mouse) held still for a
// moment. A second finger (pinch, two-finger tilt), a move past a few pixels
// (a pan) or a lift cancels it. No DOM and no timers here, so it runs in unit
// tests; app/summary/long-press.ts wires it to the map.

export const HOLD_MS = 500;
/** How far the finger may drift and still be "held still", in CSS pixels. */
export const SLOP_PX = 10;

export interface Press { x: number; y: number }

export class PressTracker {
  private down_: { id: number; x: number; y: number; t: number } | null = null;
  private pointers = new Set<number>();

  constructor(private holdMs = HOLD_MS, private slop = SLOP_PX) {}

  /** A pointer went down. Only a lone pointer can become a press. */
  down(id: number, x: number, y: number, t: number): void {
    this.pointers.add(id);
    this.down_ = this.pointers.size === 1 ? { id, x, y, t } : null;
  }

  move(id: number, x: number, y: number): void {
    const d = this.down_;
    if (d && d.id === id && Math.hypot(x - d.x, y - d.y) > this.slop) this.down_ = null;
  }

  /** A pointer lifted or was taken by the browser (pointercancel). */
  up(id: number): void {
    this.pointers.delete(id);
    if (this.down_?.id === id) this.down_ = null;
  }

  /** The map began to move (pan, zoom, tilt): not a press. */
  cancel(): void { this.down_ = null; }

  /** The press, once it has been held long enough (then it is used up). */
  due(t: number): Press | null {
    const d = this.down_;
    if (!d || t - d.t < this.holdMs) return null;
    this.down_ = null;
    return { x: d.x, y: d.y };
  }

  /** When the press now being held is due, or null. */
  dueAt(): number | null { return this.down_ ? this.down_.t + this.holdMs : null; }
}
