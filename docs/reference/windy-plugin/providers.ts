/**
 * Data sources sit behind these two interfaces, so that an offline forecast-caching
 * source can be added later without touching the rendering code.
 */
import type { ProfileSeries } from './toposcale';

export interface LatLonPoint {
    lat: number;
    lon: number;
}

/** What the forecast source returned for one grid node. */
export interface NodeForecast {
    series: ProfileSeries;
    /** Model run (reference) time, ISO string, as reported by the source. */
    refTime: string | null;
    /**
     * Last timestamp that really comes from the requested model. Some Windy point
     * forecasts (e.g. HRDPS) append another model after the end of their own data;
     * that part is cut off and never shown.
     */
    dataEnd: number;
}

export interface ForecastProvider {
    /**
     * Pressure-level profile series for a grid node. Rejects with a ModelDataError when
     * the model has no pressure-level data for this location.
     */
    getNodeForecast(model: string, point: LatLonPoint): Promise<NodeForecast>;
}

export interface TerrainProvider {
    /**
     * Ground elevation (m) for each pixel of a raster whose rows are at `rowLats`
     * and columns at `colLons`. `metresPerPixel` lets the provider choose a matching resolution.
     */
    getElevations(rowLats: Float64Array, colLons: Float64Array, metresPerPixel: number): Promise<Float32Array>;
    /** Ground elevation (m) at a single point, at the provider's best resolution. */
    getElevation(lat: number, lon: number): Promise<number>;
}

/** Thrown when the selected model can't provide what the method needs. */
export class ModelDataError extends Error {}
