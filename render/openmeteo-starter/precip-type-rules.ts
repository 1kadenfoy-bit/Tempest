// Derivation rules for the starter library: precipitation split by type, as
// three rates in mm/h (rain, mixed, snow), each zero outside its type. Each is
// drawn as its own fill with its own colour family, so the map shows the type
// without baking colour into the data.
import type { VariableDerivationRule } from '@openmeteo/weather-map-layer';
import { precipType, type PrecipType } from '../../core/precip/type';

export const TYPED_PRECIP = { rain: 'tempest_precip_rain', mixed: 'tempest_precip_mixed', snow: 'tempest_precip_snow' } as const;

function rule(kind: PrecipType): VariableDerivationRule {
  return {
    pattern: new RegExp(`^${TYPED_PRECIP[kind]}$`),
    provides: { directions: false, barbs: false },
    usesDeltaTime: true,
    scaleFactor: 'primary',
    getSourceVars: ({ stored }) =>
      stored.has('precipitation') && stored.has('snowfall_water_equivalent') ? ['precipitation', 'snowfall_water_equivalent'] : null,
    process: ([precip, swe], ctx) => {
      const dt = ctx.deltaTimeHours ?? 1;
      const p = precip!;
      const s = swe!;
      const out = new Float32Array(p.length);
      for (let i = 0; i < p.length; i++) {
        const mm = p[i]!;
        out[i] = mm > 0 && precipType(mm, s[i]!) === kind ? mm / dt : 0;
      }
      return { values: out, directions: undefined };
    },
  };
}

export const precipTypeRules: VariableDerivationRule[] = [rule('rain'), rule('mixed'), rule('snow')];
