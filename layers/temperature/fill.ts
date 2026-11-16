// Temperature colours: one continuous diverging ramp from the tokens, neutral
// at 0 °C, saturating at −20 and +25 °C. The device colours raw values.
import tokens from '../../design/tokens.json';
import { lookupStrip, type Ramp } from '../../core/color/ramp';

const t = tokens.data.temperature;
export const TEMP_RANGE = t.range as [number, number];

/**
 * The token's stops pair each value with one colour (the token's positions
 * are where they sit on the linear −20 to +25 bar), so 0 °C lands exactly on
 * the neutral colour.
 */
export function temperatureRamp(): Ramp {
  const n = t.dark.length;
  return { valueStops: (t.valueStops as [number, number][]).map(([v], i) => [v, i / (n - 1)] as [number, number]), colors: t.dark };
}

/** Overall strength of the fill, so the hillshade and contours read through. */
export const TEMP_OPACITY = 0.62;

export function temperatureRenderStyle() {
  return { strip: lookupStrip(temperatureRamp(), TEMP_RANGE[0], TEMP_RANGE[1], 512), min: TEMP_RANGE[0], max: TEMP_RANGE[1], opacity: TEMP_OPACITY };
}

/** CSS gradient of the ramp, for the legend and the layer menu. */
export function temperatureGradient(): string {
  const stops = (t.valueStops as [number, number][]).map(([, pos], i) => `${t.dark[i]} ${(pos * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
