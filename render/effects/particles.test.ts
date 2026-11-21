import { describe, expect, it } from 'vitest';
import { HeightGrid } from './height-grid';
import { ParticleSim, TRAIL_POINTS, VERTEX_FLOATS, VERTS_PER_SEGMENT, type ParticleLook, type WindFn } from './particles';

const look: ParticleLook = { count: 50, trailSeconds: 0.7, pxPerKmh: 2.2, speedScale: 1, clearance: 50, widthPx: 2, brightness: 1 };
const flat = () => 100;
const unitsPerPx = 1 / (512 * 2 ** 11);
const windOf = (u: number, v: number): WindFn => (_x, _y, out) => { out[0] = u; out[1] = v; };

function run(sim: ParticleSim, wind: WindFn, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60, look, wind, flat, unitsPerPx);
}

describe('particles', () => {
  it('drift downwind: a west wind moves them east, a south wind moves them north (smaller y)', () => {
    const sim = new ParticleSim(50);
    sim.setView([0.4, 0.4, 0.6, 0.6], 2.6e7);
    sim.step(1 / 60, look, windOf(0, 0), flat, unitsPerPx);
    const [x0, y0] = sim.position(0);
    run(sim, windOf(40, 0), 0.5);
    expect(sim.position(0)[0]).toBeGreaterThan(x0);
    const [x1, y1] = sim.position(1);
    run(sim, windOf(0, 40), 0.3);
    expect(sim.position(1)[1]).toBeLessThan(y1);
    expect(y0).toBeGreaterThan(0);
    expect(x1).toBeGreaterThan(0);
  });

  it('a stronger wind carries a particle further in the same time', () => {
    const dist = (kmh: number) => {
      const sim = new ParticleSim(1);
      sim.setView([0.4, 0.4, 0.6, 0.6], 2.6e7);
      sim.step(1 / 60, { ...look, count: 1 }, windOf(0, 0), flat, unitsPerPx);
      const [x0] = sim.position(0);
      for (let t = 0; t < 0.5; t += 1 / 60) sim.step(1 / 60, { ...look, count: 1 }, windOf(kmh, 0), flat, unitsPerPx);
      return sim.position(0)[0] - x0;
    };
    expect(dist(60)).toBeGreaterThan(dist(20) * 2.5);
  });

  it('particles that leave the view or grow old come back inside it', () => {
    const sim = new ParticleSim(20);
    const box: [number, number, number, number] = [0.4, 0.4, 0.5, 0.5];
    sim.setView(box, 2.6e7);
    run(sim, windOf(100, 0), 20);
    for (let i = 0; i < 20; i++) {
      const [x, y] = sim.position(i);
      expect(x).toBeGreaterThanOrEqual(box[0] - 1e-3);
      expect(y).toBeGreaterThanOrEqual(box[1]);
      expect(y).toBeLessThanOrEqual(box[3]);
    }
  });

  it('writes streaks that follow the terrain and fit the buffer; calm wind draws fainter streaks', () => {
    const sim = new ParticleSim(50);
    sim.setView([0.4, 0.4, 0.6, 0.6], 2.6e7);
    const out = new Float32Array(sim.maxVertices * VERTEX_FLOATS);
    run(sim, windOf(50, 0), 2);
    const n = sim.write(out, look, flat);
    expect(n).toBeGreaterThan(0);
    expect(n % VERTS_PER_SEGMENT).toBe(0);
    expect(n).toBeLessThanOrEqual(sim.maxVertices);
    // Height above the ground, in mercator z: (100 m ground + up to 1.5 × 50 m) / 2.6e7.
    expect(out[2]).toBeGreaterThan(100 / 2.6e7);
    expect(out[2]).toBeLessThan(180 / 2.6e7);
    const alphaMax = (arr: Float32Array, count: number) => { let m = 0; for (let v = 0; v < count; v++) m = Math.max(m, arr[v * VERTEX_FLOATS + 7]!); return m; };
    const strong = alphaMax(out, n);
    const calm = new ParticleSim(50);
    calm.setView([0.4, 0.4, 0.6, 0.6], 2.6e7);
    run(calm, windOf(4, 0), 2);
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
