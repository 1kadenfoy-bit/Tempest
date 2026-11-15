import type { TerrainProvider } from './providers';

/**
 * Ground elevation from the AWS Terrain Tiles (Terrarium PNG encoding).
 * In British Columbia these come from NRCan's Canadian Digital Elevation Model (CDEM).
 * Free, no API key, served with CORS headers.
 */
const TILE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const TILE_SIZE = 256;
/** Native detail of the dataset in BC; finer zooms add nothing. */
const MAX_ZOOM = 14;
const MAX_CACHED_TILES = 120;
const EARTH_CIRCUMFERENCE = 40075016.686;

export class TerrariumTerrainProvider implements TerrainProvider {
    private tiles = new Map<string, Promise<Float32Array>>();

    async getElevations(rowLats: Float64Array, colLons: Float64Array, metresPerPixel: number): Promise<Float32Array> {
        const midLat = rowLats[Math.floor(rowLats.length / 2)];
        const z = zoomFor(metresPerPixel, midLat);
        const n = 2 ** z;
        const ys = Array.from(rowLats, lat => latToTileY(lat, n) * TILE_SIZE);
        const xs = Array.from(colLons, lon => lonToTileX(lon, n) * TILE_SIZE);

        // Load every tile the raster touches, in parallel.
        const needed = new Map<string, Promise<Float32Array>>();
        const tx0 = Math.floor(Math.min(...xs) / TILE_SIZE);
        const tx1 = Math.floor(Math.max(...xs) / TILE_SIZE);
        const ty0 = Math.floor(Math.min(...ys) / TILE_SIZE);
        const ty1 = Math.floor(Math.max(...ys) / TILE_SIZE);
        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                needed.set(`${tx}/${ty}`, this.tile(z, tx, ty));
            }
        }
        const loaded = new Map<string, Float32Array>();
        await Promise.all(Array.from(needed, async ([k, p]) => loaded.set(k, await p)));

        const out = new Float32Array(rowLats.length * colLons.length);
        for (let r = 0; r < ys.length; r++) {
            for (let c = 0; c < xs.length; c++) {
                out[r * xs.length + c] = sample(loaded, xs[c], ys[r]);
            }
        }
        return out;
    }

    async getElevation(lat: number, lon: number): Promise<number> {
        const n = 2 ** MAX_ZOOM;
        const x = lonToTileX(lon, n) * TILE_SIZE;
        const y = latToTileY(lat, n) * TILE_SIZE;
        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        const tiles = new Map([[`${tx}/${ty}`, await this.tile(MAX_ZOOM, tx, ty)]]);
        return sample(tiles, Math.min(x, (tx + 1) * TILE_SIZE - 1), Math.min(y, (ty + 1) * TILE_SIZE - 1));
    }

    private tile(z: number, x: number, y: number): Promise<Float32Array> {
        const key = `${z}/${x}/${y}`;
        let entry = this.tiles.get(key);
        if (entry) {
            // Refresh its position so the least recently used tile is evicted first.
            this.tiles.delete(key);
        } else {
            entry = loadTile(z, x, y);
            entry.catch(() => this.tiles.delete(key));
        }
        this.tiles.set(key, entry);
        while (this.tiles.size > MAX_CACHED_TILES) {
            this.tiles.delete(this.tiles.keys().next().value as string);
        }
        return entry;
    }
}

const loadTile = async (z: number, x: number, y: number): Promise<Float32Array> => {
    const n = 2 ** z;
    const wrappedX = ((x % n) + n) % n;
    const url = TILE_URL.replace('{z}', String(z)).replace('{x}', String(wrappedX)).replace('{y}', String(y));
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Elevation tile ${z}/${x}/${y}: HTTP ${res.status}`);
    }
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    const elev = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < elev.length; i++) {
        // Terrarium encoding; negative values are sea floor, so clamp to sea level.
        elev[i] = Math.max(0, px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768);
    }
    return elev;
};

/** Bilinear sample at global pixel coordinates (x, y) from the loaded tiles. */
const sample = (tiles: Map<string, Float32Array>, x: number, y: number): number => {
    const x0 = Math.floor(x - 0.5);
    const y0 = Math.floor(y - 0.5);
    const fx = x - 0.5 - x0;
    const fy = y - 0.5 - y0;
    const at = (gx: number, gy: number): number => {
        const tx = Math.floor(gx / TILE_SIZE);
        const ty = Math.floor(gy / TILE_SIZE);
        // Neighbours across a tile edge that isn't loaded fall back to the nearest loaded pixel.
        const t = tiles.get(`${tx}/${ty}`) ?? tiles.get(`${Math.floor(x / TILE_SIZE)}/${Math.floor(y / TILE_SIZE)}`);
        if (!t) {
            return 0;
        }
        const lx = Math.min(TILE_SIZE - 1, Math.max(0, gx - tx * TILE_SIZE));
        const ly = Math.min(TILE_SIZE - 1, Math.max(0, gy - ty * TILE_SIZE));
        return t[ly * TILE_SIZE + lx];
    };
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
};

/** Tile zoom whose pixel size is closest to (not coarser than) the requested resolution. */
const zoomFor = (metresPerPixel: number, lat: number): number => {
    const metresPerTilePixelZ0 = (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / TILE_SIZE;
    const z = Math.ceil(Math.log2(metresPerTilePixelZ0 / Math.max(metresPerPixel, 1)));
    return Math.min(MAX_ZOOM, Math.max(0, z));
};

const lonToTileX = (lon: number, n: number): number => ((lon + 180) / 360) * n;

const latToTileY = (lat: number, n: number): number => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};
