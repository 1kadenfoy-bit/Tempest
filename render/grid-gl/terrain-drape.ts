// Draping the grid layers over 3D terrain.
//
// Custom layers draw on the flat map plane, so with 3D terrain on they would
// float under or through the mountains. MapLibre GL JS 6.18 can instead ask a
// custom layer to draw into each terrain tile's texture (renderToTerrainTile,
// marked experimental), which it then drapes over the terrain together with
// the hillshade, contours and lines around the layer. Each grid layer draws
// the same picture there with this matrix in place of the camera's: Web
// Mercator 0..1 to the tile's clip space, (-1, -1) at its south-west corner
// and (1, 1) at its north-east corner.
//
// MapLibre keeps the draped tiles until the layer's terrainTileRevision
// changes, so every change to what a layer shows bumps it (DrapeRevision).
import type { Map as MapLibreMap, UnwrappedTileIDLiteral } from 'maplibre-gl';

/** Column-major 4 × 4 matrix taking Web Mercator 0..1 (z = 0) to the tile's clip space. */
export function tileMatrix(tile: UnwrappedTileIDLiteral): Float32Array {
  const { x, y, z } = tile.canonical;
  const n = 2 ** z;
  const tx = x + (tile.wrap ?? 0) * n;
  // clip x = 2 (mx n - tx) - 1; clip y = 1 - 2 (my n - y), north up.
  return new Float32Array([
    2 * n, 0, 0, 0,
    0, -2 * n, 0, 0,
    0, 0, 1, 0,
    -2 * tx - 1, 2 * y + 1, 0, 1,
  ]);
}

/** Repaints a layer, and tells MapLibre to redraw its draped terrain tiles too. */
export class DrapeRevision {
  /** Read by MapLibre as the layer's terrainTileRevision. */
  value = 0;
  changed(map: MapLibreMap | null): void {
    this.value++;
    map?.triggerRepaint();
  }
}
