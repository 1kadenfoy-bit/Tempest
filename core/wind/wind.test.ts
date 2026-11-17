import { describe, expect, it } from 'vitest';
import { angleBetween, compass, directionShift, fromUV, gustAt, nextCalm, smoothGround, terrainWind, toUV, windAtHeight, type WindProfile } from './wind';

describe('wind parts', () => {
  it('turns a direction into parts and back', () => {
    for (const dir of [0, 45, 90, 180, 230, 300]) {
      const [u, v] = toUV(20, dir);
      const back = fromUV(u, v);
      expect(back.speed).toBeCloseTo(20, 6);
      expect(back.dir).toBeCloseTo(dir, 6);
    }
    // From the west blows towards the east.
    const [u, v] = toUV(10, 270);
    expect(u).toBeCloseTo(10, 6);
    expect(v).toBeCloseTo(0, 6);
  });
  it('names compass points', () => {
    expect(compass(230)).toBe('SW');
    expect(compass(300)).toBe('NW');
    expect(compass(359)).toBe('N');
    expect(compass(22)).toBe('N');
    expect(compass(23)).toBe('NE');
    expect(angleBetween(350, 10)).toBe(20);
  });
});

const profile = (): WindProfile => {
  // Levels at 100, 500, 1500, 3000 m; wind from the west, 10 → 60 km/h.
  const gh = [100, 500, 1500, 3000];
  const sp = [10, 20, 40, 60];
  const parts = sp.map((s) => toUV(s, 270));
  return { gh, u: parts.map((p) => p[0]), v: parts.map((p) => p[1]), u10: toUV(8, 250)[0], v10: toUV(8, 250)[1], speed10: 8, gust10: 20 };
};

describe('wind at the terrain', () => {
  it('keeps the 10 m wind at and below the model’s ground', () => {
    const p = profile();
    for (const z of [0, 400, 600, 610]) {
      const w = terrainWind(p, z, 600);
      expect(w.speed).toBeCloseTo(8, 6);
      expect(w.dir).toBeCloseTo(250, 6);
      expect(w.gust).toBeCloseTo(20, 6);
    }
  });
  it('blends from the 10 m wind to the first level above the ground, then level to level', () => {
    const p = profile();
    // Ground 490 m: base 500 m, first level above is 1500 m.
    const [u1] = windAtHeight(p, 1000, 490);
    expect(u1).toBeGreaterThan(toUV(8, 250)[0]);
    expect(u1).toBeLessThan(40);
    expect(terrainWind(p, 1500, 490).speed).toBeCloseTo(40, 6);
    expect(terrainWind(p, 2250, 490).speed).toBeCloseTo(50, 6);
    // Above the top level it holds.
    expect(terrainWind(p, 4000, 490).speed).toBeCloseTo(60, 6);
  });
  it('a ridge above the model’s ground gets more wind than a valley below it', () => {
    const p = profile();
    expect(terrainWind(p, 1400, 700).speed).toBeGreaterThan(terrainWind(p, 300, 700).speed);
  });
});

describe('gusts', () => {
  it('gives back the 10 m gust at the 10 m wind', () => {
    expect(gustAt(20, 20, 35)).toBeCloseTo(35, 6);
    expect(gustAt(3, 3, 12)).toBeCloseTo(12, 6);
  });
  it('scales with stronger wind aloft, within limits', () => {
    expect(gustAt(40, 20, 28)).toBeCloseTo(56, 6);
    // A gusty 10 m wind: the factor is capped at 1.5, the 10 m excess kept.
    expect(gustAt(40, 20, 35)).toBeCloseTo(60, 6);
    expect(gustAt(40, 6, 30)).toBeCloseTo(64, 6);
    expect(gustAt(40, 20, 10)).toBe(40);
  });
});

describe('model ground', () => {
  it('smooths terrain over a box, sea counted as sea level', () => {
    const w = 5, h = 1;
    const out = smoothGround([0, 0, 900, 0, -50], w, h, 1);
    expect(Array.from(out)).toEqual([0, 300, 300, 300, 0]);
    expect(Array.from(smoothGround([5, -3], 2, 1, 0))).toEqual([5, 0]);
  });
});

describe('calm and shifts', () => {
  const hours = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 17, i)));
  it('finds the next calm stretch and its length', () => {
    const t = hours(8);
    const c = nextCalm(t, [30, 20, 12, 9, 14, 22, 8, 7], 15, 0)!;
    expect(c.start).toEqual(t[2]);
    expect(c.hours).toBe(3);
    expect(nextCalm(t, [30, 30, 30, 30, 30, 30, 30, 30], 15, 0)).toBeNull();
  });
  it('finds a lasting change of direction, skipping light wind', () => {
    const t = hours(10);
    const dir = [230, 235, 120, 240, 300, 305, 300, 310, 300, 300];
    const sp = [20, 20, 2, 20, 20, 20, 20, 20, 20, 20];
    const s = directionShift(t, dir, sp, 0)!;
    expect(s.at).toEqual(t[4]);
    expect(s.fromDir).toBe(230);
    expect(compass(s.toDir)).toBe('NW');
    expect(directionShift(t, dir.map(() => 230), sp, 0)).toBeNull();
  });
});
