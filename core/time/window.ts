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

/**
 * The time strip: 2 days back, then ahead to the end of the forecast (the
 * chosen model's last hour, `until`), never less than 4 days ahead (7 days in
 * all). It grows with longer models (GDPS about 12 days, ECMWF about 17).
 */
export function weekRange(now: Date, timeZone = 'America/Vancouver', until?: Date | null): { start: Date; end: Date; days: Date[] } {
  const today = dayStart(now, timeZone);
  const ahead = until ? Math.max(4, Math.ceil((until.getTime() - today.getTime()) / (24 * H)) - 1) : 4;
  const days: Date[] = [];
  for (let d = -2; d <= ahead; d++) days.push(dayStart(new Date(today.getTime() + d * 24 * H + 12 * H), timeZone));
  const end = dayStart(new Date(today.getTime() + (ahead + 1) * 24 * H + 12 * H), timeZone);
  return { start: days[0]!, end, days };
}
