#!/usr/bin/env python3
"""Build the BC satellite picture as PMTiles files plus a manifest (public/satellite/satellite.json).

Source: EOX Sentinel-2 cloudless (one cloud-free picture per year), served as
WGS84 tiles. The map needs web-mercator tiles, so each one is re-drawn here.

  overview   zoom 0-7 for the whole BC box, from EOX level 9
  pieces     zoom 8-10, one file per zoom-6 tile (like the base map), from EOX level 10
  close      zoom 11-14 inside the boxes in CLOSE below, from EOX level 13

Build tool only (not part of the app). Needs Python 3 with Pillow and numpy.
  python3 -I tools/build-satellite.py [--year=2025] [--cache=DIR] [--dry-run] [--only=overview,pieces,close]
Raw EOX tiles are kept in --cache so a rebuild does not ask the server again.
"""
import gzip, hashlib, io, json, math, os, struct, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

args = dict((a[2:].split('=') + [True])[:2] for a in sys.argv[1:] if a.startswith('--'))
YEAR = args.get('year', '2025')
CACHE = args.get('cache', '/tmp/eox-cache')
OUT = 'public/satellite'
ONLY = set(str(args['only']).split(',')) if 'only' in args else {'overview', 'pieces', 'close'}
BBOX = (-139.1, 48.2, -114.0, 60.0)          # same box as the base map
CLOSE = [                                      # name, box (w, s, e, n)
    ('Cypress Mountain', (-123.28, 49.34, -123.12, 49.44)),
    ('Mt Seymour', (-123.00, 49.32, -122.88, 49.44)),
]
QUALITY = 74
URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-%s/default/WGS84/{l}/{r}/{c}.jpg' % YEAR
UA = 'Tempest-personal-app (one-off BC satellite build)'

# ---------- EOX source tiles (WGS84: level L has 2^(L+1) columns and 2^L rows, 256 px each)
_lock = threading.Lock()
_mem = {}

def fetch(l, r, c):
    path = os.path.join(CACHE, str(YEAR), str(l), str(r), f'{c}.jpg')
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            req = urllib.request.Request(URL.format(l=l, r=r, c=c), headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as resp:
                data = resp.read()
            with open(path + '.part', 'wb') as f:
                f.write(data)
            os.replace(path + '.part', path)
            return path
        except urllib.error.HTTPError as e:
            if e.code == 404:
                open(path, 'wb').close()   # nothing there; remember it
                return path
            time.sleep(1.5 * (attempt + 1))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'could not fetch EOX tile {l}/{r}/{c}')

def source_tile(l, r, c):
    key = (l, r, c)
    with _lock:
        if key in _mem:
            return _mem[key]
    path = fetch(l, r, c)
    if os.path.getsize(path) == 0:
        arr = np.zeros((256, 256, 3), np.uint8)
    else:
        arr = np.asarray(Image.open(path).convert('RGB'))
    with _lock:
        if len(_mem) > 600:
            _mem.clear()
        _mem[key] = arr
    return arr

def prefetch(level, bbox):
    d = 180 / 2 ** level
    c0, c1 = int((bbox[0] + 180) // d), int((bbox[2] + 180) // d)
    r0, r1 = int((90 - bbox[3]) // d), int((90 - bbox[1]) // d)
    todo = [(level, r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]
    todo = [t for t in todo if not os.path.exists(os.path.join(CACHE, str(YEAR), str(t[0]), str(t[1]), f'{t[2]}.jpg'))]
    print(f'level {level}: {len(todo)} tiles to fetch', flush=True)
    done = [0]
    def one(t):
        fetch(*t)
        done[0] += 1
        if done[0] % 500 == 0:
            print(f'  fetched {done[0]}/{len(todo)}', flush=True)
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(one, todo))

# ---------- web-mercator tile drawn from a WGS84 level
def merc_tile(z, x, y, level):
    level = min(level, z + 3)        # zoomed-out tiles use a coarser source level, so the stitch stays small
    n = 2 ** z
    px = (x + (np.arange(256) + 0.5) / 256) / n                        # 0..1 across the world
    py = (y + (np.arange(256) + 0.5) / 256) / n
    lon = px * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py))))
    su = (lon + 180) / 360 * 2 ** (level + 1) * 256 - 0.5               # source pixel columns
    sv = (90 - lat) / 180 * 2 ** level * 256 - 0.5                      # source pixel rows
    u0, v0 = np.floor(su).astype(int), np.floor(sv).astype(int)
    fu, fv = (su - u0)[None, :, None], (sv - v0)[:, None, None]
    cmin, cmax = u0.min() // 256, (u0.max() + 1) // 256
    rmin, rmax = v0.min() // 256, (v0.max() + 1) // 256
    mosaic = np.zeros(((rmax - rmin + 1) * 256, (cmax - cmin + 1) * 256, 3), np.float32)
    for r in range(rmin, rmax + 1):
        for c in range(cmin, cmax + 1):
            if 0 <= r < 2 ** level and 0 <= c < 2 ** (level + 1):
                mosaic[(r - rmin) * 256:(r - rmin + 1) * 256, (c - cmin) * 256:(c - cmin + 1) * 256] = source_tile(level, r, c)
    uu, vv = u0 - cmin * 256, v0 - rmin * 256
    a = mosaic[vv[:, None], uu[None, :]]
    b = mosaic[vv[:, None], (uu + 1)[None, :]]
    cc = mosaic[(vv + 1)[:, None], uu[None, :]]
    d = mosaic[(vv + 1)[:, None], (uu + 1)[None, :]]
    img = (a * (1 - fu) + b * fu) * (1 - fv) + (cc * (1 - fu) + d * fu) * fv
    buf = io.BytesIO()
    Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(buf, 'JPEG', quality=QUALITY, optimize=True)
    return buf.getvalue()

def x_of(lon, z): return int((lon + 180) / 360 * 2 ** z)
def y_of(lat, z):
    s = math.sin(math.radians(lat))
    return int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 2 ** z)
def tile_box(z, x, y):
    n = 2 ** z
    lon = lambda xx: xx / n * 360 - 180
    lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    return [lon(x), lat(y + 1), lon(x + 1), lat(y)]
def range_for(z, bbox):
    return range(x_of(bbox[0], z), x_of(bbox[2], z) + 1), range(y_of(bbox[3], z), y_of(bbox[1], z) + 1)

# ---------- PMTiles v3 writer
def tile_id(z, x, y):
    acc = sum(4 ** i for i in range(z))
    n = 2 ** z
    d = 0
    s = n // 2
    while s > 0:
        rx = 1 if (x & s) > 0 else 0
        ry = 1 if (y & s) > 0 else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        s //= 2
    return acc + d

def varint(v):
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)

def serialize_dir(entries):
    out = bytearray(varint(len(entries)))
    last = 0
    for e in entries:
        out += varint(e[0] - last); last = e[0]
    for e in entries: out += varint(e[3])      # run length
    for e in entries: out += varint(e[2])      # length
    prev = None
    for e in entries:
        if prev is not None and e[1] == prev[1] + prev[2]:
            out += varint(0)
        else:
            out += varint(e[1] + 1)
        prev = e
    return gzip.compress(bytes(out), 9)

def write_pmtiles(path, tiles, minz, maxz, bbox, meta):
    """tiles: {(z,x,y): jpeg bytes}"""
    items = sorted((tile_id(*k), v) for k, v in tiles.items())
    data = bytearray()
    seen = {}
    entries = []                       # (tileid, offset, length, runlength)
    for tid, blob in items:
        h = hashlib.sha1(blob).digest()
        if h in seen:
            off, ln = seen[h]
        else:
            off, ln = len(data), len(blob)
            data += blob
            seen[h] = (off, ln)
        prev = entries[-1] if entries else None
        if prev and prev[1] == off and prev[2] == ln and prev[0] + prev[3] == tid:
            entries[-1] = (prev[0], off, ln, prev[3] + 1)
        else:
            entries.append((tid, off, ln, 1))
    root = serialize_dir(entries)
    leaves = b''
    if len(root) > 16384 - 127:
        size = 4096
        while True:
            leaf_blobs, root_entries = [], []
            for i in range(0, len(entries), size):
                chunk = serialize_dir(entries[i:i + size])
                root_entries.append((entries[i][0], len(leaves) + sum(len(b) for b in leaf_blobs), len(chunk), 0))
                leaf_blobs.append(chunk)
            root = serialize_dir(root_entries)
            if len(root) <= 16384 - 127:
                leaves = b''.join(leaf_blobs)
                break
            size *= 2
    metadata = gzip.compress(json.dumps(meta).encode(), 9)
    root_off = 127
    meta_off = root_off + len(root)
    leaf_off = meta_off + len(metadata)
    data_off = leaf_off + len(leaves)
    e7 = lambda v: int(round(v * 1e7))
    head = b'PMTiles' + bytes([3])
    head += struct.pack('<QQQQQQQQQQQ', root_off, len(root), meta_off, len(metadata), leaf_off, len(leaves),
                        data_off, len(data), len(items), len(entries), len(seen))
    head += bytes([1, 2, 1, 3, minz, maxz])        # clustered, internal gzip, tiles uncompressed, JPEG
    head += struct.pack('<iiiibii', e7(bbox[0]), e7(bbox[1]), e7(bbox[2]), e7(bbox[3]), min(maxz, 10), 0, 0)
    assert len(head) == 127, len(head)
    with open(path, 'wb') as f:
        f.write(head + root + metadata + leaves + bytes(data))
    return os.path.getsize(path)

# ---------- build
def draw_all(addresses, level, workers=4):
    out = {}
    def one(a):
        return a, merc_tile(a[0], a[1], a[2], level)
    with ThreadPoolExecutor(workers) as ex:
        for i, (a, blob) in enumerate(ex.map(one, addresses)):
            out[a] = blob
            if (i + 1) % 1000 == 0:
                print(f'  drew {i + 1}/{len(addresses)}', flush=True)
    return out

ATTR = ('Contains modified Copernicus Sentinel data %s, <a href="https://cloudless.eox.at">Sentinel-2 cloudless</a> '
        'by <a href="https://eox.at">EOX IT Services GmbH</a> (CC BY-NC-SA 4.0)') % YEAR

def main():
    os.makedirs(OUT, exist_ok=True)
    dry = 'dry-run' in args
    files = []
    def meta(name, minz, maxz):
        return {'name': name, 'format': 'jpg', 'type': 'baselayer', 'attribution': ATTR, 'minzoom': minz, 'maxzoom': maxz}
    if 'overview' in ONLY:
        addr = [(z, x, y) for z in range(0, 8) for x in range_for(z, BBOX)[0] for y in range_for(z, BBOX)[1]]
        print('overview tiles', len(addr))
        if not dry:
            prefetch(9, BBOX)
            tiles = draw_all(addr, 9)
            size = write_pmtiles(f'{OUT}/bc-overview.pmtiles', tiles, 0, 7, BBOX, meta('BC satellite overview', 0, 7))
            files.append({'file': 'bc-overview.pmtiles', 'minzoom': 0, 'maxzoom': 7, 'tile': None, 'bytes': size})
    if 'pieces' in ONLY:
        pieces = [(x, y) for x in range_for(6, BBOX)[0] for y in range_for(6, BBOX)[1]]
        total = 0
        if not dry:
            prefetch(10, BBOX)
        for px, py in pieces:
            addr = []
            for z in (8, 9, 10):
                k = 2 ** (z - 6)
                for x in range(px * k, (px + 1) * k):
                    for y in range(py * k, (py + 1) * k):
                        b = tile_box(z, x, y)
                        if b[2] > BBOX[0] and b[0] < BBOX[2] and b[3] > BBOX[1] and b[1] < BBOX[3]:
                            addr.append((z, x, y))
            total += len(addr)
            if dry or not addr:
                continue
            tiles = draw_all(addr, 10)
            name = f'bc-6-{px}-{py}.pmtiles'
            bb = tile_box(6, px, py)
            size = write_pmtiles(f'{OUT}/{name}', tiles, 8, 10, bb, meta('BC satellite zoom 8-10', 8, 10))
            files.append({'file': name, 'minzoom': 8, 'maxzoom': 10, 'tile': [6, px, py], 'bytes': size})
            print(f'  {name}: {size / 1e6:.1f} MB ({len(addr)} tiles)', flush=True)
        print('piece tiles', total)
    if 'close' in ONLY:
        addr = set()
        for _, bb in CLOSE:
            for z in range(11, 15):
                xs, ys = range_for(z, bb)
                addr.update((z, x, y) for x in xs for y in ys)
        addr = sorted(addr)
        print('close tiles', len(addr))
        if not dry:
            for _, bb in CLOSE:
                prefetch(13, bb)
            tiles = draw_all(addr, 13)
            w = min(b[0] for _, b in CLOSE); s = min(b[1] for _, b in CLOSE)
            e = max(b[2] for _, b in CLOSE); n = max(b[3] for _, b in CLOSE)
            size = write_pmtiles(f'{OUT}/close-cypress-seymour.pmtiles', tiles, 11, 14, (w, s, e, n),
                                 meta('BC satellite close-up: Cypress and Seymour', 11, 14))
            files.append({'file': 'close-cypress-seymour.pmtiles', 'minzoom': 11, 'maxzoom': 14, 'tile': None,
                          'areas': [{'name': nme, 'bbox': list(bb)} for nme, bb in CLOSE], 'bytes': size})
    if dry:
        return
    manifest_path = f'{OUT}/satellite.json'
    old = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {'files': []}
    keep = {f['file']: f for f in old.get('files', [])}
    for f in files:
        keep[f['file']] = f
    manifest = {
        'version': 1,
        'source': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-%s' % YEAR,
        'year': int(YEAR),
        'attribution': ATTR,
        'licence': 'CC BY-NC-SA 4.0 (non-commercial, share-alike); for commercial use see https://cloudless.eox.at',
        'season': 'one cloud-free picture for the whole year (not a summer or winter version)',
        'bbox': list(BBOX), 'tileSize': 256, 'format': 'jpg', 'maxzoom': 14,
        'files': sorted(keep.values(), key=lambda f: (f['minzoom'], f['file'])),
    }
    json.dump(manifest, open(manifest_path, 'w'), indent=1)
    print('wrote', manifest_path, 'total', sum(f['bytes'] for f in manifest['files']) / 1e6, 'MB')

main()
