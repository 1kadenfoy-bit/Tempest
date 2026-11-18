// A minimal GeoTIFF reader for what GeoMet's WCS sends: one band of 32-bit
// floats, uncompressed, in strips, on a latitude/longitude grid (checked Nov
// 18, 2026: Compression 1, BitsPerSample 32, SampleFormat 3, ModelPixelScale
// and ModelTiepoint, no GDAL nodata tag). Anything else is refused rather
// than guessed. Written here instead of adding a library: about 80 lines.

export interface Raster {
  width: number;
  height: number;
  /** The grid's outer edges in degrees. */
  west: number;
  north: number;
  /** Cell size in degrees. */
  dx: number;
  dy: number;
  /** Rows north to south, as stored. Missing values are NaN. */
  data: Float32Array;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };

export function readGeoTiff(buf: ArrayBuffer): Raster {
  const v = new DataView(buf);
  const order = v.getUint16(0, false);
  if (order !== 0x4949 && order !== 0x4d4d) throw new Error('not a TIFF');
  const le = order === 0x4949;
  if (v.getUint16(2, le) !== 42) throw new Error('not a classic TIFF');
  const ifd = v.getUint32(4, le);
  const n = v.getUint16(ifd, le);
  const tags = new Map<number, number[]>();
  const ascii = new Map<number, string>();
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    const tag = v.getUint16(e, le);
    const type = v.getUint16(e + 2, le);
    const count = v.getUint32(e + 4, le);
    const size = (TYPE_SIZE[type] ?? 1) * count;
    const at = size <= 4 ? e + 8 : v.getUint32(e + 8, le);
    if (type === 2) {
      ascii.set(tag, new TextDecoder().decode(new Uint8Array(buf, at, Math.max(0, count - 1))));
      continue;
    }
    const vals: number[] = [];
    for (let i = 0; i < count; i++) {
      if (type === 3) vals.push(v.getUint16(at + i * 2, le));
      else if (type === 4) vals.push(v.getUint32(at + i * 4, le));
      else if (type === 12) vals.push(v.getFloat64(at + i * 8, le));
      else if (type === 1) vals.push(v.getUint8(at + i));
      else if (type === 11) vals.push(v.getFloat32(at + i * 4, le));
    }
    tags.set(tag, vals);
  }
  const one = (t: number) => tags.get(t)?.[0];
  const width = one(256)!, height = one(257)!;
  if (!width || !height) throw new Error('TIFF without a size');
  if ((one(259) ?? 1) !== 1) throw new Error('compressed TIFF not supported');
  if (one(258) !== 32 || one(339) !== 3 || (one(277) ?? 1) !== 1) throw new Error('only one band of 32-bit floats is supported');
  if (tags.has(322)) throw new Error('tiled TIFF not supported');
  const offsets = tags.get(273) ?? [];
  const counts = tags.get(279) ?? [];
  const data = new Float32Array(width * height);
  let o = 0;
  offsets.forEach((start, i) => {
    const bytes = counts[i] ?? 0;
    for (let b = 0; b + 4 <= bytes && o < data.length; b += 4) data[o++] = v.getFloat32(start + b, le);
  });
  if (o !== data.length) throw new Error('TIFF strips shorter than the image');
  const scale = tags.get(33550);
  const tie = tags.get(33922);
  if (!scale || !tie) throw new Error('TIFF without a place on the earth');
  // The tie point ties pixel (i, j) to (x, y); GeoMet ties the top-left corner.
  const [ti, tj, , x, y] = tie as [number, number, number, number, number];
  const dx = scale[0]!, dy = scale[1]!;
  const nodata = ascii.has(42113) ? Number(ascii.get(42113)) : null;
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!;
    if (!Number.isFinite(d) || (nodata !== null && d === nodata) || Math.abs(d) > 1e30) data[i] = NaN;
  }
  return { width, height, west: x - ti * dx, north: y + tj * dy, dx, dy, data };
}
