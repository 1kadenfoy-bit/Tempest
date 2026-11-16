// The one place values become text. Metric by default; a units setting comes
// with app settings (M9). Everything inside the app is SI, UTC and plain
// latitude/longitude; this file turns it into what the screen shows.

export type UnitSystem = 'metric';

const intl = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });

/** "1,180 m". Rounds to the metre. */
export function formatElevation(metres: number, units: UnitSystem = 'metric'): string {
  void units; // one system for now; the setting arrives with app settings
  return `${intl.format(Math.round(metres))} m`;
}

const TIME_ZONE = 'America/Vancouver';

function parts(d: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: get('hour'), minute: get('minute'), period: get('dayPeriod').toUpperCase() };
}

/** "Fri 5 PM", or "Fri 5:30 PM" off the hour. Times are shown in BC time. */
export function formatCursorTime(d: Date, timeZone = TIME_ZONE): string {
  const { weekday, hour, minute, period } = parts(d, timeZone);
  return `${weekday} ${hour}${minute === '00' ? '' : `:${minute}`} ${period}`;
}

/** "now", "in 6 h", "3 h ago", "in 2 d". */
export function formatRelative(target: Date, now: Date): string {
  const hours = Math.round((target.getTime() - now.getTime()) / 3_600_000);
  if (hours === 0) return 'now';
  const abs = Math.abs(hours);
  const text = abs >= 48 ? `${Math.round(abs / 24)} d` : `${abs} h`;
  return hours > 0 ? `in ${text}` : `${text} ago`;
}

const oneDecimal = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "2.4 mm/h" (liquid rate). */
export function formatRate(mmPerHour: number): string {
  return `${oneDecimal.format(mmPerHour)} mm/h`;
}

/** "12 mm", or "0.4 mm" below 1. */
export function formatMm(mm: number): string {
  return `${mm < 1 && mm > 0 ? oneDecimal.format(mm) : intl.format(Math.round(mm))} mm`;
}

/** "21 cm", or "0.7 cm" below 1. */
export function formatCm(cm: number): string {
  return `${cm < 1 && cm > 0 ? oneDecimal.format(cm) : intl.format(Math.round(cm))} cm`;
}

/** Chart axis label: "Fri" at midnight, "12 PM" at noon, else "3 PM". */
export function formatAxisTime(d: Date, timeZone = TIME_ZONE): string {
  const { weekday, hour, period } = parts(d, timeZone);
  if (hour === '12' && period === 'AM') return weekday;
  return `${hour} ${period}`;
}

/** Week strip day label: "Today", else "Wed 11". */
export function formatDayLabel(d: Date, today: Date, timeZone = TIME_ZONE): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: 'numeric' });
  const key = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(x);
  if (key(d) === key(today)) return 'Today';
  const p = fmt.formatToParts(d);
  return `${p.find((x) => x.type === 'weekday')?.value} ${p.find((x) => x.type === 'day')?.value}`;
}

/** A span of hours: "6 h", "24 h", "3.5 d". */
export function formatSpan(hours: number): string {
  if (hours < 72) return `${intl.format(hours)} h`;
  const d = hours / 24;
  return `${Number.isInteger(d) ? d : oneDecimal.format(d)} d`;
}
