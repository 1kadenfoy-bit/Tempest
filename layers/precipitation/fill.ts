// Precipitation map fill: liquid rate in mm/h, coloured on the device from the
// token ramp. M0 draws the rain family only; colour by type (rain, mixed, snow)
// arrives with the full layer in M2.
import tokens from '../../design/tokens.json';
import { lookupStrip } from '../../core/color/ramp';

const p = tokens.data.precipitation;

export function precipitationStrip() {
  const ramp = { valueStops: p.valueStops as [number, number][], colors: p.rain.dark, cutoff: p.cutoff };
  return { min: 0, max: p.saturatesAt, unit: 'mm/h', colors: lookupStrip(ramp, 0, p.saturatesAt) };
}
