// The one place values become text. Everything inside the app is metric
// (°C, mm, cm, km/h, m), UTC and plain latitude/longitude; this file turns it
// into what the screen shows, in the unit system chosen in app settings:
// metric by default, or imperial (°F, in, mph, ft, mi). Only text changes:
// data, colours and thresholds stay metric underneath.

export type UnitSystem = 'metric' | 'imperial';
export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];

let current: UnitSystem = 'metric';

/** The unit system every formatter uses when none is passed. Set once from app settings, and on change. */
export function setUnitSystem(u: UnitSystem): void {
  current = u === 'imperial' ? 'imperial' : 'metric';
}
export function unitSystem(): UnitSystem {
  return current;
}

// ---- Conversions (exact factors) -------------------------------------------
export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const kmhToMph = (kmh: number): number => kmh / 1.609344;
export const mToFt = (m: number): number => m / 0.3048;
export const mmToIn = (mm: number): number => mm / 25.4;
export const cmToIn = (cm: number): number => cm / 2.54;
export const kmToMi = (km: number): number => km / 1.609344;

/** A temperature in the shown unit (°C or °F), unrounded: for chart axes and scales. */
export function tempValue(c: number, u: UnitSystem = current): number {
  return u === 'imperial' ? cToF(c) : c;
}
/** A wind speed in the shown unit (km/h or mph), unrounded. */
export function speedValue(kmh: number, u: UnitSystem = current): number {
  return u === 'imperial' ? kmhToMph(kmh) : kmh;
}
/** A height in the shown unit (m or ft), unrounded. */
export function elevationValue(m: number, u: UnitSystem = current): number {
  return u === 'imperial' ? mToFt(m) : m;
}

export type UnitKind = 'temp' | 'rate' | 'rain' | 'snow' | 'speed' | 'elevation' | 'distance';
const LABELS: Record<UnitSystem, Record<UnitKind, string>> = {
  metric: { temp: '°C', rate: 'mm/h', rain: 'mm', snow: 'cm', speed: 'km/h', elevation: 'm', distance: 'km' },
  imperial: { temp: '°F', rate: 'in/h', rain: 'in', snow: 'in', speed: 'mph', elevation: 'ft', distance: 'mi' },
};
/** The unit's symbol for stat cards and legends: "km/h" or "mph". */
export function unitLabel(kind: UnitKind, u: UnitSystem = current): string {
  return LABELS[u][kind];
}

const intl = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const threeDecimals = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const upToOne = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 });
const upToTwo = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 });
const upToThree = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 3 });

/** "1,180" or "3,871": a height's number in the shown unit, whole. */
export function formatElevationNumber(metres: number, u: UnitSystem = current): string {
  return intl.format(Math.round(elevationValue(metres, u)));
}

/** "1,180 m" or "3,871 ft". Rounds to the metre (or foot). */
export function formatElevation(metres: number, u: UnitSystem = current): string {
  return `${formatElevationNumber(metres, u)} ${unitLabel('elevation', u)}`;
}

/** "2.5" or "1.6": a distance's number in the shown unit; one decimal under 10 unless `whole`. */
export function formatDistanceNumber(km: number, u: UnitSystem = current, whole = false): string {
  const v = u === 'imperial' ? kmToMi(km) : km;
  return !whole && Math.abs(v) < 10 ? upToOne.format(v) : intl.format(Math.round(v));
}
/** "2.5 km" or "1.6 mi". */
export function formatDistance(km: number, u: UnitSystem = current, whole = false): string {
  return `${formatDistanceNumber(km, u, whole)} ${unitLabel('distance', u)}`;
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

/** Minutes for recent frames (radar): "now" under 3 minutes, "18 min ago", then "2 h 6 min ago". */
export function formatMinutesAgo(target: Date, now: Date): string {
  const min = Math.round((now.getTime() - target.getTime()) / 60_000);
  if (min < 3) return min < -2 ? formatRelative(target, now) : 'now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}

const oneDecimal = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "2.4" mm/h, or "0.09" in/h (three decimals under 0.01 in/h): a liquid rate's number. */
export function formatRateNumber(mmPerHour: number, u: UnitSystem = current): string {
  if (u === 'metric') return oneDecimal.format(mmPerHour);
  const v = mmToIn(mmPerHour);
  return v > 0 && v < 0.01 ? threeDecimals.format(v) : twoDecimals.format(v);
}

/** "2.4 mm/h" or "0.09 in/h" (liquid rate). */
export function formatRate(mmPerHour: number, u: UnitSystem = current): string {
  return `${formatRateNumber(mmPerHour, u)} ${unitLabel('rate', u)}`;
}

/** A legend's span of rates: "0.1 to 6+ mm/h", or "0.004 to 0.24+ in/h". */
export function formatRateRange(lo: number, hi: number, u: UnitSystem = current): string {
  const n = (mm: number) => (u === 'metric' ? upToOne.format(mm) : upToThree.format(mmToIn(mm)));
  return `${n(lo)} to ${u === 'metric' ? n(hi) : upToTwo.format(mmToIn(hi))}+ ${unitLabel('rate', u)}`;
}

/** "0.7 cm/h" or "0.28 in/h": a snowfall rate (radar's snow product). */
export function formatSnowRate(cmPerHour: number, u: UnitSystem = current): string {
  const n = u === 'metric' ? oneDecimal.format(cmPerHour) : twoDecimals.format(cmToIn(cmPerHour));
  return `${n} ${unitLabel('snow', u)}/h`;
}

/** A legend's span of snowfall rates: "0.1 to 20+ cm/h", or "0.04 to 7.9+ in/h". */
export function formatSnowRateRange(lo: number, hi: number, u: UnitSystem = current): string {
  const n = (cm: number) => (u === 'metric' ? upToOne.format(cm) : upToTwo.format(cmToIn(cm)));
  return `${n(lo)} to ${u === 'metric' ? n(hi) : upToOne.format(cmToIn(hi))}+ ${unitLabel('snow', u)}/h`;
}

/** Rain's number: "12", "0.4" below 1 mm; inches "0.47", "1.2" from 1 in. `whole` rounds metric to the mm (tables). */
export function formatMmNumber(mm: number, u: UnitSystem = current, whole = false): string {
  if (u === 'metric') return (whole || !(mm < 1 && mm > 0)) ? intl.format(Math.round(mm)) : oneDecimal.format(mm);
  const v = mmToIn(mm);
  return v < 1 ? twoDecimals.format(v) : oneDecimal.format(v);
}

/** "12 mm", or "0.4 mm" below 1; "0.47 in". */
export function formatMm(mm: number, u: UnitSystem = current): string {
  return `${formatMmNumber(mm, u)} ${unitLabel('rain', u)}`;
}

/** Snow's number: "21", "0.7" below 1 cm; inches "8", "0.3" below 1 in. `whole` rounds metric to the cm (tables). */
export function formatCmNumber(cm: number, u: UnitSystem = current, whole = false): string {
  const v = u === 'imperial' ? cmToIn(cm) : cm;
  if (u === 'metric' && whole) return intl.format(Math.round(v));
  return v < 1 && v > 0 ? oneDecimal.format(v) : intl.format(Math.round(v));
}

/** "21 cm", or "0.7 cm" below 1; "8 in". */
export function formatCm(cm: number, u: UnitSystem = current): string {
  return `${formatCmNumber(cm, u)} ${unitLabel('snow', u)}`;
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

const MINUS = '−';
const signed = (n: number, plus: boolean) => (n < 0 ? `${MINUS}${Math.abs(n)}` : plus && n > 0 ? `+${n}` : String(n));

/** "−6", "+2" with `plus`: a temperature's number in the shown unit, whole, with a real minus. */
export function formatTempNumber(c: number, plus = false, u: UnitSystem = current): string {
  const n = Math.round(tempValue(c, u)) || 0;
  return signed(n, plus);
}

/** "−1 °C" or "30 °F" (readout). Rounds to the degree; never shows "−0". */
export function formatTemp(c: number, u: UnitSystem = current): string {
  return `${formatTempNumber(c, false, u)} ${unitLabel('temp', u)}`;
}

/** "0.5 °C" or "32.9 °F": a threshold to one decimal. */
export function formatTempOneDecimal(c: number, u: UnitSystem = current): string {
  const v = tempValue(c, u);
  return `${v < 0 ? MINUS : ''}${oneDecimal.format(Math.abs(v))} ${unitLabel('temp', u)}`;
}

/** "+2 °C" (stat values and In view lines, sign shown). */
export function formatTempSigned(c: number, u: UnitSystem = current): string {
  return `${formatTempNumber(c, true, u)} ${unitLabel('temp', u)}`;
}

/** "+2°", "−5°", "0°" (summaries and the week strip, sign shown). */
export function formatDegrees(c: number, plus = true, u: UnitSystem = current): string {
  return `${formatTempNumber(c, plus, u)}°`;
}

/** "Thu 5 PM – Sat 5 PM". */
export function formatTimeRange(a: Date, b: Date, timeZone = TIME_ZONE): string {
  return `${formatCursorTime(a, timeZone)} – ${formatCursorTime(b, timeZone)}`;
}

/** "Thu Oct 1, 4 PM": a time that may be weeks away (issued bulletins). */
export function formatDateTime(d: Date, timeZone = TIME_ZONE): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(d).replace(',', '');
  const full = formatCursorTime(d, timeZone);
  return `${p}, ${full.slice(full.indexOf(' ') + 1)}`;
}

/** "4 PM" on the same BC day as `ref`, else "Fri 4 PM". */
export function formatWhen(t: Date, ref: Date, timeZone = TIME_ZONE): string {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(d);
  const full = formatCursorTime(t, timeZone);
  return day(t) === day(ref) ? full.slice(full.indexOf(' ') + 1) : full;
}

/** "2.4" (one decimal, for stat cards whose unit sits under the value). */
export function formatOneDecimal(n: number): string {
  return oneDecimal.format(n);
}

/** "1,180" (whole number with separators, for stat cards). */
export function formatWhole(n: number): string {
  return intl.format(Math.round(n));
}

/** Wind speed: "28 km/h" or "17 mph". Whole units; model wind is not finer than that. */
export function formatSpeed(kmh: number, unit = true, u: UnitSystem = current): string {
  const v = String(Math.round(speedValue(kmh, u)) || 0);
  return unit ? `${v} ${unitLabel('speed', u)}` : v;
}

/** Where the wind blows from, with its bearing: "SW 230°". `name` is the compass name. */
export function formatBearing(name: string, degrees: number): string {
  return `${name} ${Math.round(degrees) % 360}°`;
}

/** How old a measurement is: "just now", "25 min ago", "3 h ago", "2 d ago" (minutes under an hour, days from 48 h). */
export function formatAgo(t: Date, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - t.getTime()) / 60_000));
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h >= 48 ? `${Math.round(h / 24)} d ago` : `${h} h ago`;
}
