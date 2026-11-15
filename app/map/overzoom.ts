// Build a higher-zoom vector tile from part of a lower-zoom one, for places
// where the base map stores only up to zoom 13. Geometry is scaled and shifted
// into the child's frame; MapLibre clips what falls outside the tile, and
// drops labels whose anchor lies outside it.
import Point from '@mapbox/point-geometry';
import { VectorTile } from '@mapbox/vector-tile';
import { fromVectorTileJs, type VectorTileFeatureLike, type VectorTileLayerLike } from '@maplibre/vt-pbf';
import { PbfReader } from 'pbf';

export function overzoomTile(parent: Uint8Array, scale: number, dx: number, dy: number): Uint8Array {
  const tile = new VectorTile(new PbfReader(parent));
  const layers: Record<string, VectorTileLayerLike> = {};
  for (const [name, layer] of Object.entries(tile.layers)) {
    const extent = layer.extent;
    const buffer = extent / 8;
    const features: VectorTileFeatureLike[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const rings = f.loadGeometry().map((ring) =>
        ring.map((p) => new Point(Math.round(p.x * scale - dx * extent), Math.round(p.y * scale - dy * extent))),
      );
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const ring of rings) for (const p of ring) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      if (maxX < -buffer || maxY < -buffer || minX > extent + buffer || minY > extent + buffer) continue;
      features.push({
        type: f.type,
        properties: f.properties as Record<string, number | string | boolean>,
        id: f.id,
        extent,
        loadGeometry: () => rings,
      });
    }
    layers[name] = { version: 2, name, extent, length: features.length, feature: (i) => features[i]! };
  }
  return fromVectorTileJs({ layers });
}
