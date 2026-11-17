import { describe, expect, it } from 'vitest';
import {
  ATES_COLOURS, ATES_ORDER, areasInView, atesLabel, bboxOfRings, indexAreaAt, inPolygons, ratingsIn, simplifyRing,
  type AtesArea, type AtesIndexArea, type Position,
} from './ates';
import index from '../../public/ates/index.json';

const square = (x: number, y: number, s: number): Position[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

describe('ATES scale', () => {
  it('names the five classes in order with their numbers', () => {
    expect(ATES_ORDER.map(atesLabel)).toEqual(['Non-avalanche (0)', 'Simple (1)', 'Challenging (2)', 'Complex (3)', 'Extreme (4)']);
    expect(ATES_COLOURS.simple).toBe('#55FF00');
    expect(ATES_COLOURS.challenging).toBe('#0000FF');
    expect(ATES_COLOURS.complex).toBe('#000000');
  });

  it('lists the classes present, low to high', () => {
    const a = { zones: [{ rating: 'complex' }, { rating: 'simple' }], ratedLines: [{ rating: 'challenging' }] } as unknown as AtesArea;
    expect(ratingsIn([a])).toEqual(['simple', 'challenging', 'complex']);
  });
});

describe('ATES geometry', () => {
  it('finds a point inside a polygon, outside its hole', () => {
    const poly = [square(0, 0, 10), square(4, 4, 2)];
    expect(inPolygons([poly], 1, 1)).toBe(true);
    expect(inPolygons([poly], 5, 5)).toBe(false);
    expect(inPolygons([poly], 11, 1)).toBe(false);
    expect(bboxOfRings([poly])).toEqual([0, 0, 10, 10]);
  });

  it('simplifies a ring and keeps it closed', () => {
    const ring: Position[] = [];
    for (let i = 0; i <= 100; i++) { const a = (i / 100) * Math.PI * 2; ring.push([Math.cos(a) + (i % 2) * 1e-5, Math.sin(a)]); }
    ring[100] = ring[0]!;
    const s = simplifyRing(ring, 0.01);
    expect(s.length).toBeLessThan(40);
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s[0]).toEqual(s[s.length - 1]);
  });

  it('orders areas in view nearest the centre first', () => {
    const area = (id: number, x: number): AtesIndexArea => ({ id, name: String(id), bbox: [x, 0, x + 1, 1], outline: [[square(x, 0, 1)]], zones: {}, points: 0, bytes: 0 });
    const list = [area(1, 0), area(2, 5), area(3, 2)];
    expect(areasInView(list, [1.5, 0, 6, 1]).map((a) => a.id)).toEqual([3, 2]);
    expect(indexAreaAt(list, 2.5, 0.5)?.id).toBe(3);
    expect(indexAreaAt(list, 4, 0.5)).toBeNull();
  });
});

describe('the shipped ATES index', () => {
  const areas = index.areas as unknown as AtesIndexArea[];
  it('holds BC’s areas with outlines, small enough to ship', () => {
    expect(areas.length).toBeGreaterThan(100);
    expect(JSON.stringify(index).length).toBeLessThan(200_000);
    for (const a of areas) {
      expect(a.outline.length, a.name).toBeGreaterThan(0);
      expect(a.bbox[0], a.name).toBeLessThan(a.bbox[2]);
    }
  });

  it('finds Brandywine and the North Shore areas by place', () => {
    expect(indexAreaAt(areas, -123.15, 50.08)?.name).toBe('Brandywine');
    expect(indexAreaAt(areas, -122.94, 49.39)?.name).toBe('Mt. Seymour');
  });
});
