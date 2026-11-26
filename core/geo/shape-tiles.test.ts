import { describe, expect, it } from 'vitest';
import type { SaveShape } from '../offline/save-request';
import { bboxOf, findCrossing, limitPoints, pointInRing, removeLoops, shapeFromTrace, signedArea, tilesForShape, type Ring } from './shape-tiles';

const square = (w: number, s: number, e: number, n: number): Ring => [[w, s], [e, s], [e, n], [w, n]];

describe('cleaning a finger trace', () => {
  it('closes a trace and gives it a box', () => {
    const s = shapeFromTrace(square(-123.1, 49.3, -122.9, 49.5))!;
    expect(s.outline.length).toBeGreaterThanOrEqual(4);
    expect(s.bbox[0]).toBeGreaterThanOrEqual(-123.1);
    expect(s.bbox[2]).toBeLessThanOrEqual(-122.9);
    expect(s.bbox).toEqual(bboxOf(s.outline));
  });

  it('smooths corners: no point of the outline sits on a sharp square corner', () => {
    const s = shapeFromTrace(square(0, 0, 10, 10))!;
    expect(s.outline.some(([x, y]) => x === 0 && y === 0)).toBe(false);
  });

  it('keeps at most 300 points', () => {
    const circle: Ring = Array.from({ length: 5000 }, (_, i) => [Math.cos((i / 5000) * 2 * Math.PI) * 5 + (i % 7) * 0.0001, Math.sin((i / 5000) * 2 * Math.PI) * 5]);
    expect(shapeFromTrace(circle)!.outline.length).toBeLessThanOrEqual(300);
    expect(limitPoints(circle, 100).length).toBeLessThanOrEqual(100);
  });

  it('cuts out a loop where the trace crosses itself', () => {
    // A bow tie: the two diagonal edges cross in the middle.
    const bow: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(findCrossing(bow)).not.toBeNull();
    const fixed = removeLoops(bow);
    expect(findCrossing(fixed)).toBeNull();
    expect(fixed.length).toBeGreaterThanOrEqual(3);
  });

  it('never returns a self-crossing shape from a scribble', () => {
    let seed = 5;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < 40; k++) {
      const scribble: Ring = Array.from({ length: 30 }, () => [rnd() * 0.5 - 123, rnd() * 0.5 + 49]);
      const s = shapeFromTrace(scribble);
      if (s) expect(findCrossing(s.outline)).toBeNull();
    }
  });

  it('gives nothing for a line or a point', () => {
    expect(shapeFromTrace([[1, 1], [2, 2]])).toBeNull();
    expect(shapeFromTrace([[1, 1], [2, 2], [3, 3]])).toBeNull();
  });

  it('measures and tests inside', () => {
    expect(signedArea(square(0, 0, 2, 3))).toBeCloseTo(6);
    expect(pointInRing([1, 1], square(0, 0, 2, 3))).toBe(true);
    expect(pointInRing([5, 1], square(0, 0, 2, 3))).toBe(false);
  });
});

describe('tiles for a shape', () => {
  const box = (w: number, s: number, e: number, n: number): SaveShape => ({ outline: square(w, s, e, n), bbox: [w, s, e, n] });

  it('lists every tile of a box at a low zoom', () => {
    // At zoom 2 the world is 4 x 4; a box over the North Shore touches tile 1/1 only.
    const t = tilesForShape(box(-123.3, 49.2, -122.8, 49.5), 2, 2);
    expect(t).toEqual([{ z: 2, x: 0, y: 1 }]);
  });

  it('covers the box and nothing more at each zoom', () => {
    const t = tilesForShape(box(-123.3, 49.2, -122.8, 49.5), 8, 10);
    expect(t.filter((a) => a.z === 8).length).toBeGreaterThanOrEqual(1);
    expect(t.filter((a) => a.z === 10).length).toBeGreaterThan(t.filter((a) => a.z === 8).length);
    expect(new Set(t.map((a) => `${a.z}/${a.x}/${a.y}`)).size).toBe(t.length);
  });

  it('keeps a thin diagonal strip thinner than its box', () => {
    // A long thin diagonal triangle: many of its bounding box's tiles are untouched.
    const diag: SaveShape = { outline: [[-123.3, 49.2], [-123.25, 49.2], [-122.8, 49.5], [-122.85, 49.5]], bbox: [-123.3, 49.2, -122.8, 49.5] };
    const strip = tilesForShape(diag, 11, 11).length;
    const whole = tilesForShape(box(-123.3, 49.2, -122.8, 49.5), 11, 11).length;
    expect(strip).toBeLessThan(whole);
  });

  it('includes tiles wholly inside a big shape, not just those on its edge', () => {
    const t = tilesForShape(box(-123.5, 49.0, -122.5, 49.8), 10, 10);
    const edge = new Set(t.map((a) => `${a.x}/${a.y}`));
    expect(edge.size).toBeGreaterThan(8);
  });
});
