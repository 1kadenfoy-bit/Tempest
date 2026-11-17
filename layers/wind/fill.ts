// Wind colours: one continuous ramp from the tokens, saturating at 60 km/h
// so strong wind stands out without washing out everyday values. The device
// colours raw speeds; readouts always show the real value.
import tokens from '../../design/tokens.json';
import { lookupStrip, type Ramp } from '../../core/color/ramp';

const t = tokens.data.wind;
export const WIND_RANGE = t.range as [number, number];

/** Each token value paired with its own colour (the token's positions are where it sits on the 0 to 60 bar). */
export function windRamp(): Ramp {
  const n = t.dark.length;
  return { valueStops: (t.valueStops as [number, number][]).map(([v], i) => [v, i / (n - 1)] as [number, number]), colors: t.dark };
}

/** Overall strength of the fill, so the hillshade and the flow read through. */
export const WIND_OPACITY = 0.62;

export function windRenderStyle() {
  return { strip: lookupStrip(windRamp(), WIND_RANGE[0], WIND_RANGE[1], 512), min: WIND_RANGE[0], max: WIND_RANGE[1], opacity: WIND_OPACITY };
}

/** CSS gradient of the ramp, for the legend and the layer menu. */
export function windGradient(): string {
  const stops = (t.valueStops as [number, number][]).map(([, pos], i) => `${t.dark[i]} ${(pos * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
