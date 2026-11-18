// Which layers the forecast summary window shows, and what their charts need
// at the pin. Pure: no DOM, so it runs in unit tests. Works through the layer
// contract only, so a new layer appears here (off by default) once it is in
// the app's list of layers.
import { isAmount, type VariableName } from '../../core/vocabulary';
import type { LayerSlots } from '../../layers/contract';

/** On until changed (Kaden): precipitation, temperature and wind. Every other layer starts off. */
export const DEFAULT_SUMMARY: readonly string[] = ['precipitation', 'temperature', 'wind'];

/** The window's choice as remembered: on or off by layer id. A layer not in it takes its default. */
export type SummaryChoice = Record<string, boolean>;

type ChartLayer = Pick<LayerSlots, 'id' | 'frames'>;

/**
 * Layers that can have a strip: their chart works at the pin on the forecast's
 * time line. An observed layer with its own frames (radar) is left out: it has
 * only the last few hours, its own 6-minute steps, and its value at the pin is
 * read one frame at a time while it is the layer on the map.
 */
export function summaryCandidates<L extends ChartLayer>(layers: readonly L[]): L[] {
  return layers.filter((l) => !l.frames);
}

/** Is this layer's strip shown, by the remembered choice or its default. */
export function isIncluded(id: string, choice: SummaryChoice | null | undefined): boolean {
  const v = choice?.[id];
  return typeof v === 'boolean' ? v : DEFAULT_SUMMARY.includes(id);
}

/** The strips shown, in the app's layer order. */
export function includedLayers<L extends ChartLayer>(layers: readonly L[], choice: SummaryChoice | null | undefined): L[] {
  return summaryCandidates(layers).filter((l) => isIncluded(l.id, choice));
}

/** The choice with one layer switched on or off (a new object; the old one is left alone). */
export function setIncluded(choice: SummaryChoice | null | undefined, id: string, on: boolean): SummaryChoice {
  return { ...(choice ?? {}), [id]: on };
}

/**
 * What the pin's series must carry for every strip at once: one request asks
 * for all of it. `amounts`: some strip needs amounts (precipitation), which are
 * converted per step, so the request asks for them separately.
 */
export function unionNeeds(layers: readonly Pick<LayerSlots, 'pinNeeds'>[]): { variables: VariableName[]; amounts: boolean } {
  const variables = [...new Set(layers.flatMap((l) => l.pinNeeds))];
  return { variables, amounts: variables.some(isAmount) };
}

/** Does any strip read the pin's forecast series (an issued layer such as avalanche does not). */
export const needsSeries = (layers: readonly Pick<LayerSlots, 'pinNeeds'>[]): boolean => layers.some((l) => l.pinNeeds.length > 0);
