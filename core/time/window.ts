// The one window control: it sets the chart span and the week-strip box
// together. The window is centred on the cursor (the needle sits mid-chart).

export const WINDOW_OPTIONS = [
  { hours: 12, label: '12 h' },
  { hours: 24, label: '24 h' },
  { hours: 48, label: '48 h' },
  { hours: 72, label: '3 d' },
  { hours: 168, label: '7 d' },
] as const;

export const DEFAULT_WINDOW_HOURS = 48;

const H = 3_600_000;

export function windowRange(cursor: Date, hours: number): { start: Date; end: Date } {
  const half = (hours / 2) * H;
  return { start: new Date(cursor.getTime() - half), end: new Date(cursor.getTime() + half) };
}

/** Start of the BC calendar day holding t, as a UTC instant. */
export function dayStart(t: Date, timeZone = 'America/Vancouver'): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const sinceMidnight = (get('hour') * 60 + get('minute')) * 60_000 + t.getUTCSeconds() * 1000 + t.getUTCMilliseconds();
  return new Date(t.getTime() - sinceMidnight);
}

/** The week strip: 2 days back to 4 days ahead of today (7 days). */
export function weekRange(now: Date, timeZone = 'America/Vancouver'): { start: Date; end: Date; days: Date[] } {
  const today = dayStart(now, timeZone);
  const days: Date[] = [];
  for (let d = -2; d <= 4; d++) days.push(dayStart(new Date(today.getTime() + d * 24 * H + 12 * H), timeZone));
  const end = dayStart(new Date(today.getTime() + 5 * 24 * H + 12 * H), timeZone);
  return { start: days[0]!, end, days };
}
