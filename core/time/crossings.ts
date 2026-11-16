// When a value crosses a level between model hours, by straight-line
// interpolation: freeze-thaw at the pin (0 °C), or a snow line passing the
// pin's height. Times are approximate ("about"), to the minute.

export interface Crossing { time: Date; dir: 'down' | 'up' }

export function crossings(times: readonly Date[], values: readonly (number | null)[], level = 0): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < times.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a === null || b === null || a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const da = a - level, db = b - level;
    if ((da >= 0 && db < 0) || (da < 0 && db >= 0)) {
      const f = da / (da - db);
      const t0 = times[i - 1]!.getTime(), t1 = times[i]!.getTime();
      out.push({ time: new Date(Math.round((t0 + f * (t1 - t0)) / 60_000) * 60_000), dir: db < 0 ? 'down' : 'up' });
    }
  }
  return out;
}
