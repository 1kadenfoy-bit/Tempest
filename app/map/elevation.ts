// Ground elevation at a point, read from the same Mapterhorn terrain tiles the
// hillshade uses (zoom 12, about 12 m per pixel here).
import { pixelAt, terrariumElevation } from '../../core/geo/terrain';
import { terrainSource } from './terrain';

const Z = 12;
const SIZE = 512;
// A view needs up to 16 tiles; keep a few views' worth.
const cache = new Map<string, Promise<ImageData>>();

async function tilePixels(z: number, x: number, y: number): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const url = terrainSource.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`terrain ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height);
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return p;
}

export async function elevationAt(lng: number, lat: number): Promise<number> {
  const t = pixelAt(lng, lat, Z, SIZE);
  const img = await tilePixels(t.z, t.x, t.y);
  const i = (t.py * img.width + t.px) * 4;
  return terrariumElevation(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
}

/**
 * Ground height over a box, from terrain tiles at a zoom that gives about one
 * value per screen point (at most zoom 12, at most 5 × 5 tiles: the screen plus a margin). Rows run
 * north to south, in Web Mercator like the tiles. Tiles that fail (no signal,
 * not saved) read as sea level.
 */
export interface Mosaic { merc: [number, number, number, number]; width: number; height: number; data: Float32Array; key: string }

export async function elevationMosaic(bbox: [number, number, number, number], mapZoom: number, reuse?: Mosaic | null): Promise<Mosaic> {
  const [w, s, e, n] = bbox;
  let z = Math.max(3, Math.min(Z, Math.round(mapZoom)));
  const tileRange = (zz: number) => {
    const a = pixelAt(w, n, zz, SIZE);
    const b = pixelAt(e, s, zz, SIZE);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  };
  let r = tileRange(z);
  while (z > 3 && ((r.x1 - r.x0 + 1) > 5 || (r.y1 - r.y0 + 1) > 5)) r = tileRange(--z);
  const key = `${z}/${r.x0}/${r.y0}/${r.x1}/${r.y1}`;
  if (reuse?.key === key) return reuse;
  const nx = r.x1 - r.x0 + 1;
  const ny = r.y1 - r.y0 + 1;
  const width = nx * SIZE;
  const height = ny * SIZE;
  const data = new Float32Array(width * height);
  const jobs: Promise<void>[] = [];
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      jobs.push(tilePixels(z, tx, ty).then((img) => {
        const ox = (tx - r.x0) * SIZE;
        const oy = (ty - r.y0) * SIZE;
        const d = img.data;
        for (let y = 0; y < SIZE; y++) {
          const row = (oy + y) * width + ox;
          for (let x = 0; x < SIZE; x++) {
            const i = (y * img.width + x) * 4;
            data[row + x] = terrariumElevation(d[i]!, d[i + 1]!, d[i + 2]!);
          }
        }
      }).catch(() => undefined));
    }
  }
  await Promise.all(jobs);
  const N = 2 ** z;
  return { merc: [r.x0 / N, r.y0 / N, (r.x1 + 1) / N, (r.y1 + 1) / N], width, height, data, key };
}
