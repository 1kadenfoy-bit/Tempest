// Model run labels: "12Z run · 3 h old". Pure functions, no UI.

const HOUR = 3_600_000;

/** Hours between the run's reference time and now, floored, never negative. */
export function runAgeHours(referenceTime: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - referenceTime.getTime()) / HOUR));
}

/** "12Z run · 3 h old"; days once a run is 48 h or older. */
export function formatRunAge(referenceTime: Date, now: Date): string {
  const hh = String(referenceTime.getUTCHours()).padStart(2, '0');
  const age = runAgeHours(referenceTime, now);
  const ageText = age >= 48 ? `${Math.floor(age / 24)} d old` : `${age} h old`;
  return `${hh}Z run · ${ageText}`;
}

/** Index of the valid time nearest to `now`, or -1 for an empty list. */
export function nearestStepIndex(validTimes: readonly Date[], now: Date): number {
  let best = -1;
  let bestGap = Infinity;
  validTimes.forEach((t, i) => {
    const gap = Math.abs(t.getTime() - now.getTime());
    if (gap < bestGap) { best = i; bestGap = gap; }
  });
  return best;
}
