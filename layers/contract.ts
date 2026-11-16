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
  /** Observed precipitation at the pin (analysis totals), oldest first; online only. */
  observed?: { end: Date; hours: number; mm: number; prelim: boolean }[] | undefined;
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

export interface LayerSlots extends DetailSlots {
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
  readout(pin: PinData, i: number, settings: Record<string, string | boolean>): Readout;
  summary(pin: PinData, start: Date, cursor: Date, end: Date, settings: Record<string, string | boolean>): WindowSummary;
  drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, pin: PinData, start: Date, end: Date): void;
  /** Small values under a week-strip day (temperature: high and low), or null. */
  weekDay?(pin: PinData, dayStart: Date, dayEnd: Date): string | null;
}

// ---- Point details (M5): the standard cards, in the fixed order --------------
// A layer describes its cards as data; the shell draws them, so every layer's
// cards look alike and keep the same order: headline, key stats, table or
// visual, second visual, status lines, expandables, coming later. The shell
// adds the subject, In view and footer.

export interface Stat { label: string; value: string; unit?: string | undefined; sub?: string | undefined }

/** The elevation bands, as the shell gives them (approximate until agreed). */
export interface BandsInfo { valleyTop: number; alpineBottom: number; approximate: boolean; region: string }

export type Card =
  | { kind: 'headline'; value: string; sentence: string }
  | { kind: 'stats'; title: string; meta?: string | undefined; stats: Stat[]; note?: string | undefined }
  | {
      kind: 'table'; title: string; meta?: string | undefined;
      groups: { label: string; columns: string[] }[];
      rows: { label: string; you: boolean; cells: { parts: { text: string; color: string }[]; partial?: boolean }[] }[];
      note: { text: string; color?: string | undefined }[];
    }
  | {
      /** Elevation over time: a level line (freezing level, snow line) with shading above and below. */
      kind: 'elevation-time'; title: string; meta?: string | undefined;
      times: Date[]; level: (number | null)[];
      above: { label: string; color: string }; below: { label: string; color: string };
      you: { elevation: number; label: string };
      marker?: { time: Date; text: string } | undefined;
    }
  | {
      /** Value against elevation: the profile at the cursor, with a "You" dot. */
      kind: 'value-elevation'; title: string; meta?: string | undefined;
      points: { elevation: number; value: number; color: string }[];
      you: { elevation: number; value: number; label: string };
      zero: boolean; unit: string;
    }
  | { kind: 'status'; icon: 'snowflake' | 'info'; text: string; note?: string | undefined }
  | { kind: 'expandable'; title: string; caption: string; header: string[]; rows: string[][] }
  | { kind: 'later'; text: string };

export interface DetailContext {
  pin: PinData;
  /** Index of the cursor's step in the pin's series, or −1. */
  index: number;
  cursor: Date;
  start: Date;
  end: Date;
  now: Date;
  bands: BandsInfo;
  settings: Record<string, string | boolean>;
}

/** What the map holds now, for the In view line. Sampled over the screen only. */
export interface ViewSample {
  /** Values on a grid over the screen, with each cell's place. */
  cells: { lon: number; lat: number; value: number; second?: number }[];
  /** Freezing level range over the view's nodes, when profiles are loaded. */
  freezing?: [number, number] | undefined;
  /** A short name for a place (peak, locality), or null. */
  nameAt(lon: number, lat: number): string | null;
}

/** One setting in the layer's settings panel. */
export type Setting =
  | { key: string; title: string; kind: 'segmented'; options: { value: string; label: string }[]; default: string }
  | { key: string; title: string; kind: 'toggle'; default: boolean };

export interface DetailSlots {
  /** Cards 2 to 8, in the standard order. */
  details(ctx: DetailContext): Card[];
  /** One line about the whole view, or null while the map has nothing. */
  inView(view: ViewSample, ctx: DetailContext): string | null;
  /** Footer lines: model, run and method; the shell adds the run's age. */
  footer(ctx: DetailContext): string[];
  settings: Setting[];
  /** The panel's last line. */
  settingsNote: string;
}
