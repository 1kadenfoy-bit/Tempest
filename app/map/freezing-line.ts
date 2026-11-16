// The dashed 0 °C line on the map: where the terrain-corrected temperature
// crosses 0 °C, worked out from the same node profiles and elevation mosaic
// the GPU fill uses, at a coarser grid. Each line is labelled with the
// freezing level's height where it is drawn ("0 °C · 1,150 m").
import { computeField, freezingLevel, isothermSegments, joinSegments, samplePoint, smoothLine, type NodeGrid } from '../../core/temperature/toposcale';
import { formatElevation } from '../../core/units/format';
import type { Mosaic } from './elevation';

const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export function freezingLineFeatures(grid: NodeGrid, m: Mosaic, maxSize = 320) {
  const step = Math.max(1, Math.ceil(Math.max(m.width, m.height) / maxSize));
  const w = Math.floor(m.width / step);
  const h = Math.floor(m.height / step);
  const [x0, y0, x1, y1] = m.merc;
  const colLons = Float64Array.from({ length: w }, (_, c) => (x0 + ((c + 0.5) / w) * (x1 - x0)) * 360 - 180);
  const rowLats = Float64Array.from({ length: h }, (_, r) => latOf(y0 + ((r + 0.5) / h) * (y1 - y0)));
  // Mean height of each block, sea at 0 m (as the fill reads it).
  const elev = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let sum = 0;
      for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) sum += Math.max(0, m.data[(r * step + dy) * m.width + c * step + dx]!);
      elev[r * w + c] = sum / (step * step);
    }
  }
  const temp = computeField(grid, rowLats, colLons, elev);
  // Outside the nodes the profiles are extrapolated: keep the line inside them.
  const inside = (lon: number, lat: number) => lon >= grid.lons[0]! && lon <= grid.lons[grid.lons.length - 1]! && lat >= grid.lats[0]! && lat <= grid.lats[grid.lats.length - 1]!;
  const lines = joinSegments(isothermSegments(temp, w, h, 0));
  const toLonLat = (px: number, py: number): [number, number] => [
    (x0 + (px / w) * (x1 - x0)) * 360 - 180,
    latOf(y0 + (py / h) * (y1 - y0)),
  ];
  const features = [];
  for (const raw of lines) {
    if (raw.length < 8) continue; // specks
    const line = smoothLine(raw, 1.2);
    const coords: [number, number][] = [];
    for (let i = 0; i < line.length; i += 2) coords.push(toLonLat(line[i]!, line[i + 1]!));
    const mid = coords[Math.floor(coords.length / 2)]!;
    if (!inside(mid[0], mid[1])) continue;
    const fl = freezingLevel(samplePoint(grid, mid[1], mid[0], 0).profile);
    features.push({
      type: 'Feature' as const,
      properties: { label: fl === null ? '0 °C' : `0 °C · ${formatElevation(Math.round(fl / 10) * 10)}` },
      geometry: { type: 'LineString' as const, coordinates: coords },
    });
  }
  return { type: 'FeatureCollection' as const, features };
}
