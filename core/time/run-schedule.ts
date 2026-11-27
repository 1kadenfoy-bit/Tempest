// When a model's next run could be there (Data rule 1, docs/wishes/data.md):
// the app asks Open-Meteo for a model's newest run only once a newer one
// could exist, and uses what it has in between.
//
// Measured Nov 27, 2026 from Open-Meteo's own map-file bucket (the time each
// run's last file and its latest.json were written, every run Nov 20 to 27)
// and the point API's meta.json (update_interval_seconds 21600 for HRDPS):
//
// | Model          | Runs (UTC)     | Complete after the run time |
// | HRDPS          | 00, 06, 12, 18 | 3.3 to 5.4 h (most 3.3 to 4.5) |
// | RDPS           | 00, 06, 12, 18 | 3.9 to 4.9 h |
// | GDPS           | 00, 12         | 4.8 to 5.9 h |
// | GDPS profile   | 00, 12         | 4.8 to 5.9 h |
// | ECMWF IFS      | 00, 06, 12, 18 | 6.0 to 7.0 h |
//
// `earliestHours` sits below the fastest run seen, so a new run is never
// shown later than before: from then on the app looks every 10 minutes, as
// it always did. A model not listed is asked every time.

export interface RunSchedule {
  /** Hours between runs. */
  everyHours: number;
  /** Hours after a run's time before its files could be complete (a margin below the fastest seen). */
  earliestHours: number;
}

export const RUN_SCHEDULE: Record<string, RunSchedule> = {
  cmc_gem_hrdps: { everyHours: 6, earliestHours: 3 },
  cmc_gem_rdps_10km: { everyHours: 6, earliestHours: 3.5 },
  cmc_gem_gdps_15km: { everyHours: 12, earliestHours: 4.5 },
  cmc_gem_gdps_15km_upper_level: { everyHours: 12, earliestHours: 4.5 },
  ecmwf_ifs: { everyHours: 6, earliestHours: 5.5 },
};

const H = 3_600_000;

/** The earliest moment the run after `run` could be complete; null when the model's timetable is not known. */
export function nextRunPossibleAt(model: string, run: Date): Date | null {
  const s = RUN_SCHEDULE[model];
  return s ? new Date(run.getTime() + (s.everyHours + s.earliestHours) * H) : null;
}

/** True when a newer run than `run` could be there by `now` (always true for a model without a timetable). */
export function newerRunPossible(model: string, run: Date, now: Date): boolean {
  const at = nextRunPossibleAt(model, run);
  return !at || now.getTime() >= at.getTime();
}
