// Weather alerts at the pin: which ones still apply and in what order. Pure
// functions, no UI, no provider. The words, colour and times are kept exactly
// as the issuer wrote them; this file only filters and orders.

/** One alert for one area, as issued. */
export interface IssuedAlert {
  /** The issuer's id for this alert in this area. */
  id: string;
  /** The issuer's id for the alert itself (the same across its areas). */
  alertId: string;
  /** "warning", "watch", "advisory", "statement" (the issuer's word). */
  type: string;
  /** "snowfall warning" (the issuer's words). */
  title: string;
  /** "City of Lethbridge" (the issuer's area name). */
  area: string;
  /** The issuer's colour level, "yellow", "orange" or "red"; null when it gives none (statements). */
  colour: string | null;
  /** "issued", "continued", "ended"… (the issuer's word). */
  status: string;
  issued: Date;
  expires: Date;
  /** Two-letter province or territory, "BC". */
  province: string;
  /** The issuer's own page for it. */
  link: string;
}

/** Highest first. An unknown word sorts after the known ones. */
const COLOUR_ORDER = ['red', 'orange', 'yellow'];
const TYPE_ORDER = ['warning', 'watch', 'advisory', 'statement'];
/** Statuses that mean the alert no longer applies. */
const OVER = new Set(['ended', 'cancelled', 'canceled']);

const rank = (order: string[], v: string | null) => {
  const i = v === null ? -1 : order.indexOf(v.toLowerCase());
  return i === -1 ? order.length : i;
};

/**
 * The alerts that apply now, most severe first (colour level, then type),
 * newest first within a level. Expired and ended alerts are dropped. An alert
 * that covers the pin through two of its areas is listed once, with both areas.
 */
export function currentAlerts(alerts: readonly IssuedAlert[], now: Date): IssuedAlert[] {
  const byAlert = new Map<string, IssuedAlert>();
  for (const a of alerts) {
    if (a.expires.getTime() <= now.getTime() || OVER.has(a.status.toLowerCase())) continue;
    const seen = byAlert.get(a.alertId);
    if (!seen) byAlert.set(a.alertId, { ...a });
    else if (!seen.area.split(' · ').includes(a.area)) seen.area = `${seen.area} · ${a.area}`;
  }
  return [...byAlert.values()].sort((a, b) =>
    rank(COLOUR_ORDER, a.colour) - rank(COLOUR_ORDER, b.colour)
    || rank(TYPE_ORDER, a.type) - rank(TYPE_ORDER, b.type)
    || b.issued.getTime() - a.issued.getTime());
}

/** Pins closer than this (about 100 m) are the same place: one request, one answer. */
const PLACE_STEP = 1000;

/** The place a pin stands for, rounded so nearby pins share one cached answer; the request asks for this point. */
export function placeFor(lat: number, lon: number): { lat: number; lon: number; key: string } {
  const r = (v: number) => Math.round(v * PLACE_STEP) / PLACE_STEP;
  const p = { lat: r(lat), lon: r(lon) };
  return { ...p, key: `${p.lat.toFixed(3)},${p.lon.toFixed(3)}` };
}

/** Whether an answer fetched at `fetchedAt` is still fresh enough not to ask again. */
export function isFresh(fetchedAt: Date, now: Date, maxAgeMs = 5 * 60_000): boolean {
  const age = now.getTime() - fetchedAt.getTime();
  return age >= 0 && age < maxAgeMs;
}
