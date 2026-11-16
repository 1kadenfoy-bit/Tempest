// The layer contract, extracted in M4 once two layers existed (precipitation
// and temperature). A layer is one folder that fills these slots; the shell
// asks for them and never knows which layer it holds. Layers never import
// each other, and never see a provider: they get values by variable name.
import type { PointSeries, VariableName } from '../core/vocabulary';

/** What the shell knows about the pin when it asks a layer. */
export interface PinData {
  series: PointSeries | null;
  /** Ground height at the pin (m), from the terrain; null until known. */
  elevation: number | null;
}

/** The window summary: split at the needle, or one block for the whole window. */
export type WindowSummary =
  | { kind: 'split'; before: string[]; after: string[] }
  | { kind: 'whole'; lines: string[]; label: string };

export interface Readout {
  /** The bold value: "2.4 mm/h snow", "−1 °C". */
  value: string;
  /** Muted words right after the value: "feels −6". */
  note?: string | undefined;
  /** Muted words after the place and height: "0 °C at 1,150 m". */
  extra?: string | undefined;
}

export interface LayerSlots {
  id: string;
  title: string;
  /** Colours for the layer menu tile (CSS backgrounds, one per bar). */
  swatches: string[];
  /** Variables the pin's series must carry. */
  pinNeeds: readonly VariableName[];
  /** Variables a saved area must keep for this layer to work offline. */
  saveNeeds: readonly VariableName[];
  /** What the chart shows, for screen readers. */
  chartLabel: string;
  legend(doc: Document): HTMLElement;
  readout(pin: PinData, i: number): Readout;
  summary(pin: PinData, start: Date, cursor: Date, end: Date): WindowSummary;
  drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, pin: PinData, start: Date, end: Date): void;
  /** Small values under a week-strip day (temperature: high and low), or null. */
  weekDay?(pin: PinData, dayStart: Date, dayEnd: Date): string | null;
}
