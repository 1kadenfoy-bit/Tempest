// A coarse picture of the ground height over the part of the map in view, so
// effects can hug the terrain without asking the map for a height per
// particle per frame. Filled once per view; read with bilinear blending.
//
// Positions are Web Mercator units (0 to 1 across the world; y grows south),
// the same as the map's own coordinates. Heights are metres.

export class HeightGrid {
  /** Box covered, in mercator units. */
  x0 = 0;
  y0 = 0;
  x1 = 1;
  y1 = 1;
  readonly n: number;
  readonly h: Float32Array;
  /** Gradient of the last `slope` read: metres of height per mercator unit, east and south. */
  gx = 0;
  gy = 0;

  constructor(n = 64) {
    this.n = n;
    this.h = new Float32Array(n * n);
  }

  /** Fill from a height function over a box. `heightAt` may return NaN where unknown (counted as sea level). */
  fill(box: [number, number, number, number], heightAt: (x: number, y: number) => number): void {
    [this.x0, this.y0, this.x1, this.y1] = box;
    const n = this.n;
    for (let j = 0; j < n; j++) {
      const y = this.y0 + ((j + 0.5) / n) * (this.y1 - this.y0);
      for (let i = 0; i < n; i++) {
        const x = this.x0 + ((i + 0.5) / n) * (this.x1 - this.x0);
        const v = heightAt(x, y);
        this.h[j * n + i] = Number.isFinite(v) ? Math.max(0, v) : 0;
      }
    }
  }

  contains(x: number, y: number): boolean {
    return x >= this.x0 && x <= this.x1 && y >= this.y0 && y <= this.y1;
  }

  /** Height (m) at a point, bilinear; clamps outside the box. Also sets `gx` and `gy`. */
  slope(x: number, y: number): number {
    const n = this.n;
    const fx = Math.min(n - 1.001, Math.max(0, ((x - this.x0) / (this.x1 - this.x0)) * n - 0.5));
    const fy = Math.min(n - 1.001, Math.max(0, ((y - this.y0) / (this.y1 - this.y0)) * n - 0.5));
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const a = this.h[j * n + i]!, b = this.h[j * n + i + 1]!, c = this.h[(j + 1) * n + i]!, d = this.h[(j + 1) * n + i + 1]!;
    const cellX = (this.x1 - this.x0) / n, cellY = (this.y1 - this.y0) / n;
    this.gx = ((b - a) * (1 - ty) + (d - c) * ty) / cellX;
    this.gy = ((c - a) * (1 - tx) + (d - b) * tx) / cellY;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  heightAt(x: number, y: number): number {
    return this.slope(x, y);
  }
}
