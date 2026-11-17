// Adapter: Mountain Information Network (MIN) field reports, published by
// Avalanche Canada.
//
// Checked Nov 17, 2026:
// - GET https://api.avalanche.ca/min/submissions?fromdate=YYYY-MM-DD&todate=YYYY-MM-DD
//   answers {"items": [...]}, newest first, every report in the window, with
//   no paging and no key; Access-Control-Allow-Origin: *; Cache-Control:
//   public, max-age=60. The window may not exceed 31 days ("the date range
//   can't exceed 31 days"). Avalanche Canada's API page lists this endpoint
//   under its own host with an x-api-key header and says it "is not
//   documented and is subject to change without notice".
// - GET https://api.avalanche.ca/min/submissions/{id} answers the same object
//   as the list item (checked: identical).
// - Fields used: submissionID, title, date, submissionDatetime, username,
//   location.{latitude, longitude}, region, activities[], comments (the
//   observations, plain text), sawAvalanche, instability[],
//   images[].{url, width, height} (Cloudinary, res.cloudinary.com; not
//   reachable from the cloud session, so not opened).
// - Each report's page on avalanche.ca:
//   https://avalanche.ca/mountain-information-network/submissions/{id} (200).

import type { FieldReport } from '../../core/avalanche/danger';

export const source = {
  id: 'avalanche-canada-min',
  name: 'Mountain Information Network',
  publisher: 'Avalanche Canada',
  provides: 'Field reports with photos, shown as their authors wrote them',
  baseUrl: 'https://api.avalanche.ca/min/submissions',
  licence: 'No licence stated; reports and photos belong to their authors. Personal use pending Avalanche Canada’s confirmation',
  terms: 'An undocumented endpoint, subject to change without notice. Shown as written, online only.',
  attribution: 'Field reports from the Mountain Information Network (Avalanche Canada), by their authors',
  link: 'https://avalanche.ca/mountain-information-network',
  offline: false,
} as const;

/** The longest window the service answers, in days, counting both ends. */
export const MAX_DAYS = 31;

/** "2026-11-17" in BC time. */
export const bcDate = (t: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);

/** The list request for the last `days` days to `now` (both ends counted, at most 31). */
export function submissionsUrl(days: number, now: Date): string {
  const n = Math.max(1, Math.min(MAX_DAYS, Math.round(days)));
  const from = new Date(now.getTime() - (n - 1) * 86_400_000);
  return `${source.baseUrl}?${new URLSearchParams({ fromdate: bcDate(from), todate: bcDate(now) })}`;
}

export const submissionUrl = (id: string) => `${source.baseUrl}/${encodeURIComponent(id)}`;
export const reportPage = (id: string) => `https://avalanche.ca/mountain-information-network/submissions/${encodeURIComponent(id)}`;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** One report as published; null without an id or a place. */
export function parseSubmission(json: unknown): FieldReport | null {
  const s = obj(json);
  const id = str(s.submissionID);
  const loc = obj(s.location);
  const lat = Number(loc.latitude), lon = Number(loc.longitude);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const submitted = new Date(str(s.submissionDatetime));
  return {
    id,
    title: str(s.title),
    date: str(s.date),
    submitted: Number.isNaN(submitted.getTime()) ? new Date(`${str(s.date)}T12:00:00Z`) : submitted,
    author: str(s.username) || null,
    lat,
    lon,
    region: str(s.region) || null,
    activities: arr(s.activities).map(str).filter(Boolean),
    text: str(s.comments),
    sawAvalanche: str(s.sawAvalanche) || null,
    instability: arr(s.instability).map(str).filter(Boolean),
    images: arr(s.images).flatMap((i) => {
      const url = str(obj(i).url);
      return url.startsWith('https://') ? [{ url, width: Number(obj(i).width) || 0, height: Number(obj(i).height) || 0 }] : [];
    }),
    link: reportPage(id),
  };
}

export function parseSubmissions(json: unknown): FieldReport[] {
  return arr(obj(json).items).map(parseSubmission).filter((r): r is FieldReport => r !== null);
}

/**
 * A smaller copy of a report photo for a thumbnail or the phone's screen:
 * Cloudinary resizes on request when the size goes after "upload/" (its
 * documented URL form; not opened from the cloud session). Other hosts are
 * left as they are.
 */
export function photoAt(url: string, width: number): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url);
  return m ? `${m[1]}c_limit,w_${Math.round(width)},q_auto/${m[2]}` : url;
}

export async function fetchSubmissions(days: number, now = new Date(), fetchFn: typeof fetch = fetch): Promise<FieldReport[]> {
  const res = await fetchFn(submissionsUrl(days, now));
  if (!res.ok) throw new Error(`MIN reports: HTTP ${res.status}`);
  return parseSubmissions(await res.json());
}

export async function fetchSubmission(id: string, fetchFn: typeof fetch = fetch): Promise<FieldReport | null> {
  const res = await fetchFn(submissionUrl(id));
  if (!res.ok) throw new Error(`MIN report: HTTP ${res.status}`);
  return parseSubmission(await res.json());
}
