// Place search: the round button at the right of the top bar grows into a
// panel with a text field and result rows. Choosing a row moves the pin
// there. No v8 design yet (spec section 9): built from the grow panel and
// the existing row parts.
//
// Online only. Names come from BC Geographical Names, asked ~300 ms after
// typing stops, one request at a time (a newer query cancels the older
// one). Answers are kept for the session, so typing back over a query asks
// nothing.
import { fetchPlaces, source } from '../../adapters/bc-geonames/geonames';
import { savedOnlyActive } from '../data/connection';
import { isSearchable, normaliseQuery, placeLine, rankPlaces, type Place } from '../../core/search/search';
import { formatElevation } from '../../core/units/format';
import { closePanel, isOpenFrom, openPanel } from '../shell/panel';

const glass = (size: number) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>`;

export const DEBOUNCE_MS = 300;

export interface SearchOptions {
  /** Move the pin to the chosen place (and the map to it). */
  choose: (place: Place) => void;
  /** Where the map is looking: of places that rank alike, the nearest comes first. */
  near?: () => { lat: number; lon: number } | null;
}

/** Ranked places per tidied query, for the session. */
const answers = new Map<string, Place[]>();
let lastQuery = '';

export function setupSearch(button: HTMLButtonElement, opts: SearchOptions): void {
  button.innerHTML = glass(24);
  button.addEventListener('click', () => { if (!isOpenFrom(button)) open(button, opts); });
}

function open(button: HTMLButtonElement, opts: SearchOptions): void {
  const body = document.createElement('div');
  body.className = 'search-body';
  body.innerHTML = `
    <input class="search-field" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Place name" placeholder="Peak, lake or town in BC">
    <p class="search-status panel-note" role="status" aria-live="polite"></p>
    <div class="search-results" role="list"></div>
    <p class="search-credit panel-note"></p>`;
  const field = body.querySelector<HTMLInputElement>('.search-field')!;
  const status = body.querySelector<HTMLElement>('.search-status')!;
  const list = body.querySelector<HTMLElement>('.search-results')!;
  body.querySelector('.search-credit')!.textContent = `Names from ${source.name}`;

  let timer = 0;
  let inFlight: AbortController | null = null;
  let closed = false;

  const say = (text: string) => { status.textContent = text; status.hidden = !text; };
  const show = (places: Place[]) => {
    list.replaceChildren(...places.map((p) => row(p, () => { closePanel(); opts.choose(p); })));
  };

  const run = async (query: string) => {
    inFlight?.abort();
    inFlight = null;
    if (!isSearchable(query)) { show([]); say('Type a place name'); body.dataset.state = 'idle'; return; }
    const near = opts.near?.() ?? undefined;
    const have = answers.get(query.toLowerCase());
    if (have) { render(have, near); return; }
    if (!navigator.onLine || savedOnlyActive()) {
      show([]);
      say(savedOnlyActive() ? 'Search needs a connection. Saved data only is on.' : 'Search needs a connection');
      body.dataset.state = 'offline';
      return;
    }
    const ctl = new AbortController();
    inFlight = ctl;
    say('Searching…');
    body.dataset.state = 'searching';
    try {
      const places = await fetchPlaces(query, ctl.signal);
      if (ctl.signal.aborted || closed) return;
      answers.set(query.toLowerCase(), places);
      render(places, near);
    } catch (e) {
      if (ctl.signal.aborted || closed || (e as Error).name === 'AbortError') return;
      show([]);
      say(navigator.onLine ? 'Search could not reach BC Geographical Names. Try again in a moment.' : 'Search needs a connection');
      body.dataset.state = 'error';
    } finally {
      if (inFlight === ctl) inFlight = null;
    }
  };
  const render = (places: Place[], near: { lat: number; lon: number } | undefined) => {
    const rows = rankPlaces(field.value, places, undefined, near);
    show(rows);
    say(rows.length ? '' : 'No places found');
    body.dataset.state = rows.length ? 'results' : 'empty';
  };

  field.addEventListener('input', () => {
    clearTimeout(timer);
    const q = normaliseQuery(field.value);
    lastQuery = field.value;
    if (!isSearchable(q)) { void run(q); return; }
    timer = window.setTimeout(() => void run(q), DEBOUNCE_MS);
  });
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    const first = list.querySelector<HTMLButtonElement>('.search-row');
    // Enter picks the top row once results for this text are shown; otherwise it searches now.
    if (first && body.dataset.state === 'results' && !inFlight) first.click();
    else void run(normaliseQuery(field.value));
  });
  const online = () => { if (body.dataset.state === 'offline') void run(normaliseQuery(field.value)); };
  window.addEventListener('online', online);

  openPanel({
    origin: button,
    icon: glass(22),
    title: 'Search',
    caption: 'Choose a place to move the pin there',
    body,
    onClose: () => {
      closed = true;
      clearTimeout(timer);
      inFlight?.abort();
      window.removeEventListener('online', online);
    },
  });
  // Pick up where the last search left off.
  field.value = lastQuery;
  void run(normaliseQuery(field.value));
  // Inside the tap, so a phone shows its keyboard.
  field.focus({ preventScroll: true });
  if (field.value) field.select();
}

function row(p: Place, choose: () => void): HTMLElement {
  const b = document.createElement('button');
  b.className = 'search-row';
  b.setAttribute('role', 'listitem');
  const name = document.createElement('span');
  name.className = 'search-row-name';
  name.textContent = p.name;
  const line = document.createElement('span');
  line.className = 'search-row-line';
  line.textContent = placeLine(p);
  const text = document.createElement('span');
  text.className = 'search-row-text';
  text.append(name, line);
  b.append(text);
  if (p.elevation !== null) {
    const elev = document.createElement('span');
    elev.className = 'search-row-elev';
    elev.textContent = formatElevation(p.elevation);
    b.append(elev);
  }
  b.addEventListener('click', choose);
  return b;
}
