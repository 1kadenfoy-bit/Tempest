import Point from '@mapbox/point-geometry';
import { VectorTile } from '@mapbox/vector-tile';
import { fromVectorTileJs } from '@maplibre/vt-pbf';
import { PbfReader } from 'pbf';
import { describe, expect, it } from 'vitest';
import { overzoomTile } from './overzoom';

function parentTile(): Uint8Array {
  const feats = [
    { type: 1 as const, properties: { name: 'Peak' }, id: 1, extent: 4096, loadGeometry: () => [[new Point(3000, 1000)]] },
    { type: 1 as const, properties: { name: 'Lake' }, id: 2, extent: 4096, loadGeometry: () => [[new Point(500, 3500)]] },
    { type: 2 as const, properties: { kind: 'path' }, id: 3, extent: 4096, loadGeometry: () => [[new Point(1000, 1000), new Point(3000, 1000)]] },
  ];
  return fromVectorTileJs({ layers: { pois: { version: 2, name: 'pois', extent: 4096, length: 3, feature: (i) => feats[i]! } } });
}

describe('overzoom', () => {
  it('scales the top-right quarter into a child tile', () => {
    const child = new VectorTile(new PbfReader(overzoomTile(parentTile(), 2, 1, 0)));
    const layer = child.layers.pois!;
    const names = Array.from({ length: layer.length }, (_, i) => layer.feature(i).properties.name ?? layer.feature(i).properties.kind);
    // The lake sits in the bottom-left quarter, far outside: dropped.
    expect(names).toEqual(['Peak', 'path']);
    const peak = layer.feature(0).loadGeometry()[0]![0]!;
    expect([peak.x, peak.y]).toEqual([3000 * 2 - 4096, 1000 * 2]);
    expect(layer.feature(0).id).toBe(1);
  });
});
