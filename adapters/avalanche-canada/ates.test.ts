// Contract tests against real ATES files saved from
// avcan-services-api.prod.avalanche.ca on Nov 17, 2026: 24 Mile (id 350) and
// Longworth (id 533, which has every kind of piece: three classes, a rated
// line, avalanche paths, a decision point and a cabin).
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  areaUrl, kmlColour, parseAtesKml, parseAtesKmz, parseXml, pointKindOfStyle, ratingOfStyle, ratingOfWords, readDescription, source, unzip,
} from './ates';
import { ATES_COLOURS, ATES_ZONE_OPACITY, atesFeatures } from '../../core/avalanche/ates';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

/** A zip built here: one stored and one deflated entry, so both paths of the reader run. */
function makeZip(files: { name: string; data: Uint8Array; deflate: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, f.deflate ? 8 : 0, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(10, f.deflate ? 8 : 0, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

describe('zip reader', () => {
  it('reads stored and deflated entries', async () => {
    const text = new TextEncoder().encode('hello hello hello hello');
    const files = await unzip(makeZip([{ name: 'a.txt', data: text, deflate: false }, { name: 'dir/b.txt', data: text, deflate: true }]));
    expect([...files.keys()]).toEqual(['a.txt', 'dir/b.txt']);
    expect(new TextDecoder().decode(files.get('dir/b.txt'))).toBe('hello hello hello hello');
  });

  it('refuses what is not a zip', async () => {
    await expect(unzip(new TextEncoder().encode('<kml/> not a zip, just text that is long enough'))).rejects.toThrow('Not a zip');
  });

  it('reads a real KMZ: doc.kml and the icons', async () => {
    const files = await unzip(fixture('ates-350-2026-11-17.kmz'));
    expect([...files.keys()].sort()).toEqual(['doc.kml', 'icons/decision-point-icon.png', 'icons/destination.png', 'icons/dot.png', 'icons/parking.png', 'icons/shelter.png']);
    expect(files.get('doc.kml')!.length).toBe(201_824);
    // PNG signature
    expect([...files.get('icons/parking.png')!.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

describe('XML and KML reading', () => {
  it('reads elements, text, CDATA and entities, and drops prefixes', () => {
    const x = parseXml('<?xml version="1.0"?><kml xmlns:gx="x"><a id="s1"><gx:b>1 &amp; 2</gx:b><c><![CDATA[<p>hi</p>]]></c><d/></a></kml>');
    const a = x.children[0]!.children[0]!;
    expect(a.name).toBe('a');
    expect(x.ids.get(a)).toBe('s1');
    expect(a.children.map((c) => [c.name, c.text])).toEqual([['b', '1 & 2'], ['c', '<p>hi</p>'], ['d', '']]);
  });

  it('turns KML colours (aabbggrr) into CSS', () => {
    expect(kmlColour('8800ff55')).toEqual({ hex: '#55FF00', alpha: 0x88 / 255 });
    expect(kmlColour('88ff0000').hex).toBe('#0000FF');
  });

  it('maps the publisher’s styles to the scale’s classes', () => {
    expect(ratingOfStyle('zone_green_style')).toBe('simple');
    expect(ratingOfStyle('zone_blue_style')).toBe('challenging');
    expect(ratingOfStyle('zone_black_style')).toBe('complex');
    expect(ratingOfStyle('ates_line_black_style')).toBe('complex');
    expect(ratingOfStyle('area_styles')).toBeNull();
    expect(ratingOfWords('Class 2 – Challenging')).toBe('challenging');
    expect(ratingOfWords('Class 0 – Non-avalanche')).toBe('non-avalanche');
    expect(ratingOfWords('Class 4 – Extreme')).toBe('extreme');
    expect(pointKindOfStyle('point_of_interest_cabin_styles')).toBe('cabin');
    expect(pointKindOfStyle('point_of_interest_parking_styles')).toBe('parking');
    expect(pointKindOfStyle('decision_point_styles')).toBe('decision-point');
    expect(pointKindOfStyle('access_road_styles')).toBeNull();
  });

  it('reads a decision point’s table as headed lists, words unchanged', () => {
    const raw = '<meta http-equiv="Content-Type" content="text/html"><style type="text/css"><!-- .x {} --></style><table><tbody><tr><th class="first">Concern</th></tr><tr><td><span class="red-x">&#x2717;</span>Known as &amp;#8220;Avalanche Alley&amp;#8221;.</td></tr><tr><th>Managing risk</th></tr><tr><td><span>&#x2717;</span>Stop only in safe areas.</td></tr></tbody></table>';
    expect(readDescription(raw)).toEqual({
      text: 'Concern\nKnown as “Avalanche Alley”.\nManaging risk\nStop only in safe areas.',
      parts: [{ heading: 'Concern', items: ['Known as “Avalanche Alley”.'] }, { heading: 'Managing risk', items: ['Stop only in safe areas.'] }],
    });
    // A description that is only a cut-off style block has no words.
    expect(readDescription('<html>\n\t<head>\n\t\t<style>\n\t\t<!--\n\t\ttable.te*').text).toBe('');
    expect(readDescription('Trail').text).toBe('Trail');
  });
});

describe('Avalanche Canada ATES adapter', () => {
  it('asks the services API for one area file', () => {
    expect(areaUrl(350)).toBe('https://avcan-services-api.prod.avalanche.ca/ates/en/areas/350.kmz');
    expect(areaUrl(350, 'fr')).toBe('https://avcan-services-api.prod.avalanche.ca/ates/fr/areas/350.kmz');
    expect(source.attribution).toContain('Avalanche Canada');
  });

  it('reads 24 Mile: outline, zones, routes and points, as published', async () => {
    const { area, images, parsed } = await parseAtesKmz(350, fixture('ates-350-2026-11-17.kmz'));
    expect(area.id).toBe(350);
    expect(area.name).toBe('24 Mile');
    expect(area.boundary).toHaveLength(10);
    expect(area.zones.filter((z) => z.rating === 'simple')).toHaveLength(10);
    expect(area.zones.filter((z) => z.rating === 'challenging')).toHaveLength(7);
    expect(area.routes).toHaveLength(15);
    expect(area.routes.map((r) => r.name)).toContain('Shields Road');
    expect(area.points.map((p) => p.kind).sort()).toEqual(['cabin', 'destination', 'destination', 'destination', 'destination', 'destination', 'destination', 'parking', 'parking', 'parking']);
    expect(area.points.find((p) => p.kind === 'cabin')).toMatchObject({ name: 'Cabin', icon: 'icons/shelter.png' });
    expect(images.has('icons/shelter.png')).toBe(true);
    expect(parsed.unknown).toBe(0);
    // The scale's own words for a class, as the file gives them.
    expect(area.zones[0]!.description).toMatch(/^Exposure to low angle or primarily forested terrain/);
    // Rings are closed and in lon, lat.
    const ring = area.zones[0]!.polygons[0]![0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring[0]![0]).toBeLessThan(-117);
    expect(ring[0]![1]).toBeGreaterThan(49);
  });

  it('reads Longworth: all three classes, a rated line, paths and a decision point', async () => {
    const { area, parsed } = await parseAtesKmz(533, fixture('ates-533-2026-11-17.kmz'));
    expect(area.name).toBe('Longworth');
    expect(new Set(area.zones.map((z) => z.rating))).toEqual(new Set(['simple', 'challenging', 'complex']));
    expect(area.ratedLines.length).toBeGreaterThan(0);
    expect(area.paths.length).toBe(16);
    const dp = area.points.find((p) => p.kind === 'decision-point')!;
    expect(dp.icon).toBe('icons/decision-point-icon.png');
    expect(dp.parts.map((p) => p.heading)).toEqual(['Concern', 'Managing risk']);
    expect(dp.parts[1]!.items[0]).toBe('Regroup, assess conditions, and reassess trip plans.');
    expect(parsed.unknown).toBe(0);
  });

  it('draws with the colours the files publish', async () => {
    const files = await unzip(fixture('ates-533-2026-11-17.kmz'));
    const { fills } = parseAtesKml(new TextDecoder().decode(files.get('doc.kml')));
    for (const [style, rating] of [['zone_green_style', 'simple'], ['zone_blue_style', 'challenging'], ['zone_black_style', 'complex']] as const) {
      const c = kmlColour(fills.get(style)!);
      expect(c.hex, style).toBe(ATES_COLOURS[rating]);
      expect(c.alpha, style).toBeCloseTo(ATES_ZONE_OPACITY, 5);
    }
  });

  it('becomes map features with plain properties', async () => {
    const { area } = await parseAtesKmz(533, fixture('ates-533-2026-11-17.kmz'));
    const fs = atesFeatures(area);
    expect(fs[0]!.properties.kind).toBe('boundary');
    const dp = fs.find((f) => f.properties.pointKind === 'decision-point')!;
    expect(dp.geometry.type).toBe('Point');
    expect(dp.properties.icon).toBe('ates-decision-point');
    expect(JSON.parse(dp.properties.parts!)[0].heading).toBe('Concern');
    for (const f of fs) for (const v of Object.values(f.properties)) expect(['string', 'number']).toContain(typeof v);
  });
});
