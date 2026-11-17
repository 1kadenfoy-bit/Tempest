// The alert badge and the alerts panel. ECCC's public weather alerts for the
// pin, shown exactly as issued: ECCC's words, its colour level and legend
// colour, its issue and expiry times, and a link to its page. Never
// re-scored, recoloured or summarised. Not a layer.
//
// Online only, asked on open and when the pin settles somewhere new; one
// answer per place is kept for five minutes. Without signal (or with "Saved
// data only") nothing is asked: the last answer for the place stays, with its
// age; with no answer at all the badge stays hidden.
import { currentAlerts, isFresh, placeFor, type IssuedAlert } from '../../core/alerts/alerts';
import { savedOnlyActive } from '../data/connection';
import { formatCursorTime, formatRelative, formatWhen } from '../../core/units/format';
import { fetchAlerts, officialColour, source } from '../../adapters/eccc-alerts/alerts';
import { isOpenFrom, openPanel } from '../shell/panel';

const svg = (size: number) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>`;
const TRIANGLE = svg(24);
const TRIANGLE_PANEL = svg(22);

interface Answer { alerts: IssuedAlert[]; fetchedAt: Date; failed: boolean }

const DEBOUNCE_MS = 600;
const answers = new Map<string, Answer>();
let place: ReturnType<typeof placeFor> | null = null;
let timer = 0;
let badge: HTMLButtonElement | null = null;

function setupBadge(): HTMLButtonElement | null {
  if (badge) return badge;
  badge = document.getElementById('alert-badge') as HTMLButtonElement | null;
  if (!badge) return null;
  badge.querySelector('.alert-icon')!.innerHTML = TRIANGLE;
  badge.addEventListener('click', () => { if (!isOpenFrom(badge!)) openAlerts(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.addEventListener('online', () => void refresh());
  return badge;
}

/** The pin is at a new place: show its alerts, asking ECCC once it settles. */
export function alertsAt(lat: number, lon: number): void {
  if (!setupBadge()) return;
  place = placeFor(lat, lon);
  render();
  clearTimeout(timer);
  timer = window.setTimeout(() => void refresh(), DEBOUNCE_MS);
}

async function refresh(): Promise<void> {
  const p = place;
  if (!p) return;
  const had = answers.get(p.key);
  if (had && !had.failed && isFresh(had.fetchedAt, new Date())) { render(); return; }
  if (!navigator.onLine || savedOnlyActive()) { render(); return; }
  try {
    const alerts = await fetchAlerts(p.lat, p.lon);
    answers.set(p.key, { alerts, fetchedAt: new Date(), failed: false });
  } catch {
    // Keep the last answer, shown with its age; ask again next time.
    if (had) had.failed = true;
  }
  if (place?.key === p.key) render();
}

function shown(now = new Date()): { list: IssuedAlert[]; answer: Answer } | null {
  const answer = place ? answers.get(place.key) : undefined;
  return answer ? { list: currentAlerts(answer.alerts, now), answer } : null;
}

function render(): void {
  if (!badge) return;
  const s = shown();
  const n = s?.list.length ?? 0;
  badge.hidden = n === 0;
  badge.querySelector('.alert-count')!.textContent = String(n);
  badge.setAttribute('aria-label', `${n} weather ${n === 1 ? 'alert' : 'alerts'} at the pin`);
  // For tests: 'pending' until there is an answer for the place.
  document.body.dataset.alerts = s ? String(n) : 'pending';
}

/** "Fetched 9:41 PM", with its age once it is an hour old. */
function fetchedText(a: Answer, now: Date): string {
  const age = now.getTime() - a.fetchedAt.getTime() >= 3_600_000 ? ` · ${formatRelative(a.fetchedAt, now)}` : '';
  return `fetched ${formatWhen(a.fetchedAt, now)}${age}`;
}

function row(a: IssuedAlert): HTMLElement {
  const r = document.createElement('article');
  r.className = 'alert-row';
  r.dataset.type = a.type;
  const colour = officialColour(a);
  r.innerHTML = `
    <span class="alert-swatch" aria-hidden="true"></span>
    <div class="alert-text">
      <span class="alert-title"></span>
      <span class="alert-level"></span>
      <span class="alert-area"></span>
      <span class="alert-times"></span>
      <a class="alert-link" target="_blank" rel="noopener noreferrer">Read on weather.gc.ca</a>
    </div>`;
  // ECCC's legend colour for this alert; without one, no colour at all.
  const swatch = r.querySelector<HTMLElement>('.alert-swatch')!;
  if (colour) swatch.style.background = colour;
  else swatch.dataset.none = 'true';
  r.querySelector('.alert-title')!.textContent = a.title;
  r.querySelector('.alert-level')!.textContent = [a.colour ? `${a.colour} ${a.type}` : a.type, a.status && a.status !== 'issued' ? a.status : ''].filter(Boolean).join(' · ');
  r.querySelector('.alert-area')!.textContent = a.area;
  r.querySelector('.alert-times')!.textContent = `Issued ${formatCursorTime(a.issued)} · Expires ${formatCursorTime(a.expires)}`;
  r.querySelector<HTMLAnchorElement>('.alert-link')!.href = a.link;
  return r;
}

function openAlerts(): void {
  const now = new Date();
  const s = shown(now);
  if (!badge || !s) return;
  const body = document.createElement('div');
  body.className = 'panel-groups';
  const list = document.createElement('div');
  list.className = 'group alert-list';
  for (const a of s.list) list.append(row(a));
  const foot = document.createElement('p');
  foot.className = 'panel-note alert-source';
  foot.textContent = `${source.publisher} · ${fetchedText(s.answer, now)}`;
  if (s.answer.failed) foot.textContent += '. Could not reach ECCC just now; this is the last answer.';
  body.append(list, foot);
  openPanel({
    origin: badge,
    icon: TRIANGLE_PANEL,
    title: 'Weather alerts',
    caption: 'At the pin, as issued',
    body,
  });
}
