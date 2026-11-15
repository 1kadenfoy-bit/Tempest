// Ground elevation at a point, read from the same Mapterhorn terrain tiles the
// hillshade uses (zoom 12, about 12 m per pixel here).
import { pixelAt, terrariumElevation } from '../../core/geo/terrain';
import { terrainSource } from './terrain';

const Z = 12;
const SIZE = 512;
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
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return p;
}

export async function elevationAt(lng: number, lat: number): Promise<number> {
  const t = pixelAt(lng, lat, Z, SIZE);
  const img = await tilePixels(t.z, t.x, t.y);
  const i = (t.py * img.width + t.px) * 4;
  return terrariumElevation(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
}
