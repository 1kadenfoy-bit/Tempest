import { describe, expect, it } from 'vitest';
import { HeightGrid } from './height-grid';
import { ParticleSim, TRAIL_POINTS, VERTEX_FLOATS, VERTS_PER_SEGMENT, type ParticleLook, type ParticleView, type WindFn } from './particles';

const look: ParticleLook = { count: 50, trailSeconds: 0.7, pxPerKmh: 2.2, speedScale: 1, clearance: 50, widthPx: 2, brightness: 1 };
const flat = () => 100;
const unitsPerPx = 1 / (512 * 2 ** 11);
const windOf = (u: number, v: number): WindFn => (_x, _y, out) => { out[0] = u; out[1] = v; };

/** A flat top-down screen showing a square of the world: its middle and half-width, in mercator units. */
function screenOf(cx: number, cy: number, half: number): ParticleView {
  const m = new Float32Array(16);
  m[0] = 1 / half; m[12] = -cx / half;
  m[5] = -1 / half; m[13] = cy / half;
  m[15] = 1;
  // A fixed sequence, so every run of the tests is the same.
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return {
    matrix: m,
    topNdcY: 1,
    spawn: (out) => { out[0] = cx + (rand() * 2 - 1) * half; out[1] = cy + (rand() * 2 - 1) * half; },
  };
}

function run(sim: ParticleSim, wind: WindFn, seconds: number, view: ParticleView, l: ParticleLook = look) {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60, l, wind, flat, unitsPerPx, view);
}

function make(max: number) {
  const sim = new ParticleSim(max);
  sim.setView(2.6e7);
  return sim;
}

describe('particles', () => {
  it('drift downwind: a west wind moves them east, a south wind moves them north (smaller y)', () => {
    const view = screenOf(0.5, 0.5, 0.1);
    const sim = make(41);
    const l = { ...look, count: 41 };
    sim.step(1 / 60, l, windOf(0, 0), flat, unitsPerPx, view);
    const before = Array.from({ length: 41 }, (_, i) => sim.position(i));
    run(sim, windOf(40, 0), 0.2, view, l);
    const dx = before.map(([x], i) => sim.position(i)[0] - x).sort((a, b) => a - b)[20]!;
    expect(dx).toBeGreaterThan(0);
    const mid = Array.from({ length: 41 }, (_, i) => sim.position(i));
    run(sim, windOf(0, 40), 0.2, view, l);
    const dy = mid.map(([, y], i) => sim.position(i)[1] - y).sort((a, b) => a - b)[20]!;
    expect(dy).toBeLessThan(0);
  });

  it('a stronger wind carries a particle further in the same time', () => {
    const view = screenOf(0.5, 0.5, 0.1);
    // Median over many particles, so one that was moved to a new spot (old or crowded) does not decide it.
    const dist = (kmh: number) => {
      const sim = make(41);
      const l = { ...look, count: 41 };
      sim.step(1 / 60, l, windOf(0, 0), flat, unitsPerPx, view);
      const x0 = Array.from({ length: 41 }, (_, i) => sim.position(i)[0]);
      for (let t = 0; t < 0.2; t += 1 / 60) sim.step(1 / 60, l, windOf(kmh, 0), flat, unitsPerPx, view);
      return x0.map((x, i) => sim.position(i)[0] - x).sort((a, b) => a - b)[20]!;
    };
    expect(dist(60)).toBeGreaterThan(dist(20) * 2.5);
  });

  it('particles that leave the screen come back onto it', () => {
    const half = 0.003;
    const view = screenOf(0.5, 0.5, half);
    const sim = make(40);
    run(sim, windOf(100, 0), 20, view, { ...look, count: 40 });
    for (let i = 0; i < 40; i++) {
      const [x, y] = sim.position(i);
      expect(Math.abs(x - 0.5)).toBeLessThanOrEqual(half * 1.2);
      expect(Math.abs(y - 0.5)).toBeLessThanOrEqual(half * 1.2);
    }
  });

  it('after zooming out, the particles spread over the larger view again', () => {
    const n = 400;
    const l = { ...look, count: n };
    const near = screenOf(0.5, 0.5, 0.002);
    const far = screenOf(0.5, 0.5, 0.004); // twice as wide: four times the area
    const sim = make(n);
    run(sim, windOf(0, 0), 1, near, l);
    run(sim, windOf(0, 0), 2, far, l);
    let inside = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = sim.position(i);
      if (Math.abs(x - 0.5) < 0.002 && Math.abs(y - 0.5) < 0.002) inside++;
    }
    // Evenly spread: a quarter of them in the part that was the old view (not all of them, as before).
    expect(inside / n).toBeGreaterThan(0.18);
    expect(inside / n).toBeLessThan(0.4);
  });

  it('after zooming in, all of them are on the smaller view', () => {
    const n = 200;
    const l = { ...look, count: n };
    const sim = make(n);
    run(sim, windOf(0, 0), 1, screenOf(0.5, 0.5, 0.004), l);
    const near = screenOf(0.5, 0.5, 0.002);
    run(sim, windOf(0, 0), 2, near, l);
    for (let i = 0; i < n; i++) {
      const [x, y] = sim.position(i);
      expect(Math.abs(x - 0.5)).toBeLessThanOrEqual(0.002 * 1.1);
      expect(Math.abs(y - 0.5)).toBeLessThanOrEqual(0.002 * 1.1);
    }
  });

  it('writes streaks that follow the terrain and fit the buffer; calm wind draws fainter streaks', () => {
    const view = screenOf(0.5, 0.5, 0.1);
    const sim = make(50);
    const out = new Float32Array(sim.maxVertices * VERTEX_FLOATS);
    run(sim, windOf(50, 0), 2, view);
    const n = sim.write(out, look, flat);
    expect(n).toBeGreaterThan(0);
    expect(n % VERTS_PER_SEGMENT).toBe(0);
    expect(n).toBeLessThanOrEqual(sim.maxVertices);
    // Height above the ground, in mercator z: (100 m ground + up to 1.5 × 50 m) / 2.6e7.
    expect(out[2]).toBeGreaterThan(100 / 2.6e7);
    expect(out[2]).toBeLessThan(180 / 2.6e7);
    const alphaMax = (arr: Float32Array, count: number) => { let m = 0; for (let v = 0; v < count; v++) m = Math.max(m, arr[v * VERTEX_FLOATS + 7]!); return m; };
    const strong = alphaMax(out, n);
    const calm = make(50);
    run(calm, windOf(4, 0), 2, view);
    const out2 = new Float32Array(calm.maxVertices * VERTEX_FLOATS);
    expect(alphaMax(out2, calm.write(out2, look, flat))).toBeLessThan(strong);
    expect(TRAIL_POINTS).toBeGreaterThan(2);
  });
});

describe('height grid', () => {
  it('reads heights between cells and the slope', () => {
    const g = new HeightGrid(16);
    g.fill([0, 0, 1, 1], (x) => x * 1000);
    expect(g.heightAt(0.5, 0.5)).toBeGreaterThan(450);
    expect(g.heightAt(0.5, 0.5)).toBeLessThan(550);
    expect(g.gx).toBeGreaterThan(900);
    expect(Math.abs(g.gy)).toBeLessThan(1);
    expect(g.contains(2, 2)).toBe(false);
  });
  it('counts unknown heights as sea level', () => {
    const g = new HeightGrid(4);
    g.fill([0, 0, 1, 1], () => NaN);
    expect(g.heightAt(0.3, 0.3)).toBe(0);
  });
});
