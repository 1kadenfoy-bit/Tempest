import { describe, expect, it } from 'vitest';
import { HOLD_MS, PressTracker } from './press';

describe('press-and-hold on the map', () => {
  it('fires once a lone finger has been held still for half a second', () => {
    const p = new PressTracker();
    p.down(1, 100, 200, 0);
    expect(p.due(HOLD_MS - 1)).toBeNull();
    p.move(1, 104, 203); // a little drift is still holding
    expect(p.due(HOLD_MS)).toEqual({ x: 100, y: 200 });
    // Used up: it does not fire twice.
    expect(p.due(HOLD_MS + 100)).toBeNull();
  });

  it('a quick tap is not a press', () => {
    const p = new PressTracker();
    p.down(1, 100, 200, 0);
    p.up(1);
    expect(p.due(HOLD_MS)).toBeNull();
  });

  it('a pan is not a press', () => {
    const p = new PressTracker();
    p.down(1, 100, 200, 0);
    p.move(1, 120, 200);
    expect(p.due(HOLD_MS)).toBeNull();
  });

  it('a second finger (pinch, two-finger tilt) is not a press, even once the first lifts', () => {
    const p = new PressTracker();
    p.down(1, 100, 200, 0);
    p.down(2, 160, 260, 50);
    expect(p.due(HOLD_MS)).toBeNull();
    p.up(1);
    expect(p.due(HOLD_MS + 50)).toBeNull();
    expect(p.dueAt()).toBeNull();
  });

  it('the map moving (zoom, inertia, tilt) cancels it', () => {
    const p = new PressTracker();
    p.down(1, 100, 200, 0);
    p.cancel();
    expect(p.due(HOLD_MS)).toBeNull();
  });

  it('a new press after a lift starts fresh', () => {
    const p = new PressTracker();
    p.down(1, 100, 200, 0);
    p.up(1);
    p.down(2, 50, 60, 1000);
    expect(p.dueAt()).toBe(1000 + HOLD_MS);
    expect(p.due(1000 + HOLD_MS)).toEqual({ x: 50, y: 60 });
  });
});
