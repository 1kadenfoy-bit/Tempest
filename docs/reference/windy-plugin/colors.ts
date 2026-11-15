/** Colour scale for temperature (°C), tuned for ski touring: detail around freezing. */
export const TEMP_STOPS: [number, [number, number, number]][] = [
    [-40, [115, 30, 125]],
    [-30, [70, 50, 170]],
    [-20, [40, 95, 215]],
    [-12, [55, 150, 235]],
    [-6, [110, 200, 240]],
    [-2, [185, 230, 250]],
    [0, [245, 245, 245]],
    [2, [250, 235, 160]],
    [6, [250, 200, 90]],
    [12, [245, 140, 55]],
    [20, [220, 60, 45]],
    [30, [145, 20, 50]],
];

/**
 * Layer opacity, so the Windy base map stays readable underneath. Applied to the whole
 * overlay (the image itself is opaque, so it can be encoded quickly as JPEG).
 */
export const FILL_OPACITY = 0.75;

/** 1 entry per 0.1 °C from -40 to +30 °C, as packed RGBA (little-endian ABGR). */
const LUT_MIN = -40;
const LUT_STEP = 0.1;
const LUT = (() => {
    const n = Math.round((30 - LUT_MIN) / LUT_STEP) + 1;
    const lut = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        const t = LUT_MIN + i * LUT_STEP;
        let j = 1;
        while (j < TEMP_STOPS.length - 1 && TEMP_STOPS[j][0] < t) {
            j++;
        }
        const [t0, c0] = TEMP_STOPS[j - 1];
        const [t1, c1] = TEMP_STOPS[j];
        const w = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        const [r, g, b] = [0, 1, 2].map(k => Math.round(c0[k] + w * (c1[k] - c0[k])));
        lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    return lut;
})();

/** Packed RGBA for a temperature in kelvin (canvas ImageData byte order on little-endian devices). */
export const colorFor = (tempK: number): number => {
    const i = Math.round((tempK - 273.15 - LUT_MIN) / LUT_STEP);
    return LUT[Math.min(LUT.length - 1, Math.max(0, i))];
};

/** CSS gradient for the legend, from coldest to warmest. */
export const legendGradient = (): string =>
    `linear-gradient(to right, ${TEMP_STOPS.map(([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${(((t + 40) / 70) * 100).toFixed(1)}%`).join(', ')})`;
