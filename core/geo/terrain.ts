// Elevation from Terrarium-encoded terrain tiles (Mapterhorn):
// metres = R * 256 + G + B / 256 - 32768. Pure maths; the app fetches pixels.

export function terrariumElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Tile and pixel holding a point, for square tiles of `size` pixels. */
export function pixelAt(lon: number, lat: number, z: number, size: number) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { z, x, y, px: Math.min(size - 1, Math.floor((fx - x) * size)), py: Math.min(size - 1, Math.floor((fy - y) * size)) };
}
