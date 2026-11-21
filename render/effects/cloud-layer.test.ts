import { describe, expect, it } from 'vitest';
import { cameraFromMatrix, coverThreshold, drawnHeight } from './cloud-layer';

describe('clouds', () => {
  it('more cover needs a lower threshold; none and full are at the ends', () => {
    const t = (c: number) => coverThreshold(c, 3);
    expect(t(0)).toBeGreaterThan(1);
    expect(t(1)).toBeLessThan(-1);
    expect(t(0.2)).toBeGreaterThan(t(0.5));
    expect(t(0.5)).toBeGreaterThan(t(0.8));
    expect(t(0.5)).toBeCloseTo(0.5, 2);
  });

  it('heights are true up to 3 km and squeezed above, still in order', () => {
    expect(drawnHeight(1200)).toBe(1200);
    expect(drawnHeight(3000)).toBe(3000);
    expect(drawnHeight(8000)).toBeLessThan(8000);
    expect(drawnHeight(8000)).toBeGreaterThan(drawnHeight(3500));
    expect(drawnHeight(12000)).toBeGreaterThan(drawnHeight(8000));
  });

  it('finds the camera from the matrix that puts the world on the screen', () => {
    // A camera looking at a point from a tilt: view (look-at) then perspective, column-major, in small mercator-like units.
    const cam = [0.1612, 0.3598, 0.0008];
    const target = [0.1624, 0.3601, 0.00005];
    const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
    const norm = (a: number[]) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
    const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const f = norm(sub(target, cam)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    // view matrix rows: right, up, -forward, with the translation
    const view = [r[0]!, u[0]!, -f[0]!, 0, r[1]!, u[1]!, -f[1]!, 0, r[2]!, u[2]!, -f[2]!, 0, -dot(r, cam), -dot(u, cam), dot(f, cam), 1];
    const fov = 0.6435, aspect = 390 / 844, near = 1e-5, far = 1;
    const t = 1 / Math.tan(fov / 2);
    const proj = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
    const mul = (a: number[], b: number[]) => { const o = new Array<number>(16).fill(0); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) o[c * 4 + rr]! += a[k * 4 + rr]! * b[c * 4 + k]!; return o; };
    const m = mul(proj, view);
    const got = cameraFromMatrix(m)!;
    expect(got[0]).toBeCloseTo(cam[0]!, 6);
    expect(got[1]).toBeCloseTo(cam[1]!, 6);
    expect(got[2]).toBeCloseTo(cam[2]!, 6);
  });
});
