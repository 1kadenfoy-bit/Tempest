/**
 * TopoSCALE downscaling (Fiddes & Gruber 2014), as used by this plugin:
 *
 * 1. Sample pressure-level profiles on a coarse grid of nodes (at most 5x5) covering the viewport.
 * 2. Bilinearly interpolate the PROFILES (height, temperature, wind of each pressure level)
 *    between the four nodes around a pixel.
 * 3. Read temperature and wind from that interpolated profile at the pixel's true DEM elevation.
 *
 * Final temperatures are never interpolated between nodes, so all terrain detail
 * comes from the DEM.
 *
 * Pure functions only, no Windy or DOM dependencies, so this file is unit-testable in Node.
 */

/** Pressure-level profiles of one grid node, for every forecast time step. */
export interface ProfileSeries {
    /** Forecast step timestamps (ms since epoch), ascending. */
    ts: number[];
    /** Pressure levels in hPa, ordered from the ground up (decreasing pressure). */
    levels: number[];
    /** Geopotential height (m) as [step * levels.length + level]. */
    gh: Float32Array;
    /** Air temperature (K), same layout as gh. */
    temp: Float32Array;
    /** Free-air wind speed (m/s), same layout as gh. */
    wind: Float32Array;
}

/** A single profile (one node at one time). */
export interface Profile {
    gh: Float32Array;
    temp: Float32Array;
    wind: Float32Array;
}

/**
 * Linearly interpolate a node's profile series to time t.
 * Returns null when t is outside the time range the model provides.
 */
export const profileAtTime = (s: ProfileSeries, t: number): Profile | null => {
    const n = s.ts.length;
    const nl = s.levels.length;
    if (n === 0 || t < s.ts[0] || t > s.ts[n - 1]) {
        return null;
    }
    let i = 0;
    while (i < n - 2 && s.ts[i + 1] < t) {
        i++;
    }
    const span = n > 1 ? s.ts[i + 1] - s.ts[i] : 0;
    const w = span > 0 ? (t - s.ts[i]) / span : 0;
    const out: Profile = {
        gh: new Float32Array(nl),
        temp: new Float32Array(nl),
        wind: new Float32Array(nl),
    };
    const a = i * nl;
    const b = Math.min(i + 1, n - 1) * nl;
    for (let k = 0; k < nl; k++) {
        out.gh[k] = s.gh[a + k] + w * (s.gh[b + k] - s.gh[a + k]);
        out.temp[k] = s.temp[a + k] + w * (s.temp[b + k] - s.temp[a + k]);
        out.wind[k] = s.wind[a + k] + w * (s.wind[b + k] - s.wind[a + k]);
    }
    return out;
};

/**
 * Grid node coordinates along one axis. Nodes sit on a fixed lattice (spacing a power-of-two
 * multiple of 0.01 deg), so small pans reuse the same nodes and their cached forecasts.
 * Spacing is at least span/3, which keeps the count at 5 or fewer, and never finer than
 * `minSpacing` (the model's own resolution), where extra nodes would add nothing.
 */
export const latticeAxis = (min: number, max: number, minSpacing: number): number[] => {
    const desired = Math.max((max - min) / 3, minSpacing, 1e-4);
    const spacing = 0.01 * 2 ** Math.ceil(Math.log2(desired / 0.01));
    const start = Math.floor(min / spacing);
    let end = Math.ceil(max / spacing);
    if (end === start) {
        end++;
    }
    const out: number[] = [];
    for (let i = start; i <= end; i++) {
        out.push(Math.round(i * spacing * 1e6) / 1e6);
    }
    return out;
};

/** Index of the cell containing v and the weight towards the upper node. */
const cellOf = (axis: number[], v: number): [number, number] => {
    let i = 0;
    while (i < axis.length - 2 && axis[i + 1] < v) {
        i++;
    }
    const w = (v - axis[i]) / (axis[i + 1] - axis[i]);
    return [i, Math.min(1, Math.max(0, w))];
};

/** Nodes of the sampling grid, with each node's profile at the current time. */
export interface NodeGrid {
    /** Node latitudes, ascending. */
    lats: number[];
    /** Node longitudes, ascending. */
    lons: number[];
    /** Profiles, row-major: profiles[latIndex * lons.length + lonIndex]. */
    profiles: Profile[];
}

/** Result of evaluating the interpolated profile at a given elevation. */
export interface Sample {
    /** Temperature in K. */
    temp: number;
    /** Free-air wind speed in m/s. */
    wind: number;
}

/**
 * Reads temperature and wind at elevation z (m) from a profile given as interleaved
 * per-level arrays. Linear in height between the bracketing levels; below the lowest
 * level or above the highest, it extrapolates linearly from the nearest two levels.
 */
export const sampleProfile = (gh: ArrayLike<number>, temp: ArrayLike<number>, wind: ArrayLike<number>, z: number): Sample => {
    const nl = gh.length;
    let k = 1;
    while (k < nl - 1 && gh[k] < z) {
        k++;
    }
    const dz = gh[k] - gh[k - 1];
    const w = dz !== 0 ? (z - gh[k - 1]) / dz : 0;
    return {
        temp: temp[k - 1] + w * (temp[k] - temp[k - 1]),
        // Wind speed can't go negative when extrapolating below the lowest level.
        wind: Math.max(0, wind[k - 1] + w * (wind[k] - wind[k - 1])),
    };
};

/**
 * Bilinear interpolation of the profile at (lat, lon) from the four surrounding nodes.
 * `out` receives gh/temp/wind per level and is reused to avoid allocations per pixel.
 */
export const interpolateProfile = (grid: NodeGrid, iLat: number, wLat: number, iLon: number, wLon: number, out: Profile): void => {
    const nx = grid.lons.length;
    const p00 = grid.profiles[iLat * nx + iLon];
    const p01 = grid.profiles[iLat * nx + iLon + 1];
    const p10 = grid.profiles[(iLat + 1) * nx + iLon];
    const p11 = grid.profiles[(iLat + 1) * nx + iLon + 1];
    const w00 = (1 - wLat) * (1 - wLon);
    const w01 = (1 - wLat) * wLon;
    const w10 = wLat * (1 - wLon);
    const w11 = wLat * wLon;
    for (let k = 0; k < out.gh.length; k++) {
        out.gh[k] = w00 * p00.gh[k] + w01 * p01.gh[k] + w10 * p10.gh[k] + w11 * p11.gh[k];
        out.temp[k] = w00 * p00.temp[k] + w01 * p01.temp[k] + w10 * p10.temp[k] + w11 * p11.temp[k];
        out.wind[k] = w00 * p00.wind[k] + w01 * p01.wind[k] + w10 * p10.wind[k] + w11 * p11.wind[k];
    }
};

const newProfile = (nl: number): Profile => ({
    gh: new Float32Array(nl),
    temp: new Float32Array(nl),
    wind: new Float32Array(nl),
});

/** Temperature and wind for a single point. */
export const samplePoint = (grid: NodeGrid, lat: number, lon: number, elevation: number): Sample & { profile: Profile } => {
    const [iLat, wLat] = cellOf(grid.lats, lat);
    const [iLon, wLon] = cellOf(grid.lons, lon);
    const profile = newProfile(grid.profiles[0].gh.length);
    interpolateProfile(grid, iLat, wLat, iLon, wLon, profile);
    return { ...sampleProfile(profile.gh, profile.temp, profile.wind, elevation), profile };
};

/**
 * Evaluates the whole raster. `rowLats` and `colLons` give the coordinates of each output
 * row and column; `elevation` holds the DEM height of every pixel (row-major).
 */
export const computeField = (
    grid: NodeGrid,
    rowLats: Float64Array,
    colLons: Float64Array,
    elevation: Float32Array,
): { temp: Float32Array; wind: Float32Array } => {
    const width = colLons.length;
    const height = rowLats.length;
    const temp = new Float32Array(width * height);
    const wind = new Float32Array(width * height);
    const colCells = Array.from(colLons, lon => cellOf(grid.lons, lon));
    const profile = newProfile(grid.profiles[0].gh.length);

    for (let r = 0; r < height; r++) {
        const [iLat, wLat] = cellOf(grid.lats, rowLats[r]);
        for (let c = 0; c < width; c++) {
            const [iLon, wLon] = colCells[c];
            // Step 2: interpolate the profiles, never the final temperatures.
            interpolateProfile(grid, iLat, wLat, iLon, wLon, profile);
            // Step 3: read the profile at this pixel's true ground elevation.
            const idx = r * width + c;
            const s = sampleProfile(profile.gh, profile.temp, profile.wind, elevation[idx]);
            temp[idx] = s.temp;
            wind[idx] = s.wind;
        }
    }
    return { temp, wind };
};

/**
 * Feels-like temperature (K), using the Environment and Climate Change Canada wind-chill
 * formula with the free-air wind at the pixel's elevation. Wind chill is defined only for
 * T <= 10 °C and wind >= 4.8 km/h; otherwise the actual temperature is returned.
 */
export const feelsLike = (tempK: number, windMs: number): number => {
    const t = tempK - 273.15;
    const v = windMs * 3.6;
    if (t > 10 || v < 4.8) {
        return tempK;
    }
    const v16 = Math.pow(v, 0.16);
    return 13.12 + 0.6215 * t - 11.37 * v16 + 0.3965 * t * v16 + 273.15;
};

/**
 * Height (m) of the lowest 0 °C crossing in a profile, or null when the whole
 * profile is below or above freezing.
 */
export const freezingLevel = (p: Profile): number | null => {
    const T0 = 273.15;
    for (let k = 1; k < p.gh.length; k++) {
        const a = p.temp[k - 1] - T0;
        const b = p.temp[k] - T0;
        if (a >= 0 && b < 0) {
            return p.gh[k - 1] + (a / (a - b)) * (p.gh[k] - p.gh[k - 1]);
        }
    }
    return null;
};

/**
 * Marching squares for the 0 °C isotherm on a raster of temperatures (K).
 * Returns line segments in pixel coordinates as a flat [x1, y1, x2, y2, ...] list.
 */
export const isothermSegments = (field: Float32Array, width: number, height: number, level = 273.15): number[] => {
    const segs: number[] = [];
    const lerp = (a: number, b: number) => (level - a) / (b - a);
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const tl = field[y * width + x];
            const tr = field[y * width + x + 1];
            const bl = field[(y + 1) * width + x];
            const br = field[(y + 1) * width + x + 1];
            const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
            if (code === 0 || code === 15) {
                continue;
            }
            // Edge crossing points (pixel centres sit at +0.5).
            const top = [x + 0.5 + lerp(tl, tr), y + 0.5];
            const right = [x + 1.5, y + 0.5 + lerp(tr, br)];
            const bottom = [x + 0.5 + lerp(bl, br), y + 1.5];
            const left = [x + 0.5, y + 0.5 + lerp(tl, bl)];
            const add = (p: number[], q: number[]) => segs.push(p[0], p[1], q[0], q[1]);
            switch (code) {
                case 1: case 14: add(left, bottom); break;
                case 2: case 13: add(bottom, right); break;
                case 3: case 12: add(left, right); break;
                case 4: case 11: add(top, right); break;
                case 6: case 9: add(top, bottom); break;
                case 7: case 8: add(left, top); break;
                case 5: add(left, top); add(bottom, right); break;
                case 10: add(top, right); add(left, bottom); break;
            }
        }
    }
    return segs;
};
