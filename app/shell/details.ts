// The point details (Interface section, v8 06/07, 15/16, 20/21): the subject,
// the active layer's cards in the standard order, In view, the footer with the
// model and run, and the layer's settings panel. Drawn when the sheet is
// pulled up and kept fresh while it is. Moved out of app/main.ts; it reads the
// shared state in app/state.ts.
import { S, app, $ } from '../state';
import type { DetailContext } from '../../layers/contract';
import { bandsAt } from '../../core/elevation/bands';
import { windowRange } from '../../core/time/window';
import { formatRunAge } from '../../core/time/run-age';
import { formatElevation } from '../../core/units/format';
import { MODELS } from '../../adapters/openmeteo-maps/point-series';
import { airQuality } from '../../layers/air-quality';
import { renderCard } from './cards';
import { icons } from './icons';
import { closePanel, isOpenFrom, openPanel } from './panel';
import { nameNear } from './pin';
import { openSummaryFrom } from '../summary/wiring';

// Point details (v8 06/07, 15/16, 20/21): the subject, the layer's cards in the
// standard order, In view, and the footer with Layer settings.
let detailsFrame = 0;
const openExpandables = new Set<string>();
export function scheduleDetails() {
  if (detailsFrame || S.sheet?.get() !== 'up') return;
  detailsFrame = requestAnimationFrame(() => { detailsFrame = 0; renderDetails(); });
}
export function renderDetails() {
  const box = document.querySelector<HTMLElement>('.details');
  const t = S.cursor.time;
  const p = S.pin?.get();
  if (!box || !t || !p) return;
  const bands = bandsAt(p.lat, p.lng);
  const { start, end } = windowRange(t, S.scrubber.windowHours);
  const ctx: DetailContext = { pin: app.pinData(), index: app.seriesIndex(), cursor: t, start, end, now: new Date(), bands, settings: app.settingsFor(S.active) };
  const nodes: HTMLElement[] = [$('subject')];
  for (const c of S.active.details(ctx)) {
    const el = renderCard(c, bands, start, end);
    if (c.kind === 'expandable') {
      const d = el as HTMLDetailsElement;
      d.open = openExpandables.has(c.title);
      d.addEventListener('toggle', () => { if (d.open) openExpandables.add(c.title); else openExpandables.delete(c.title); });
    }
    nodes.push(el);
  }
  const line = S.active.inView({ ...S.view, nameAt: (lon, lat) => nameNear(S.map, S.map.project([lon, lat]), 60) }, ctx);
  if (line) { const iv = document.createElement('div'); iv.className = 'in-view'; iv.textContent = line; nodes.push(iv); }
  // Footer: model, run and its age, elevation used, method; Layer settings on the right.
  const foot = document.createElement('div');
  foot.className = 'details-footer';
  const lines = document.createElement('div');
  lines.className = 'footer-lines';
  const runText = S.run ? formatRunAge(S.run.referenceTime, new Date()).replace(' · ', ', ') + (S.usingSaved ? ', saved' : '') : '';
  const model = S.run ? MODELS[S.run.model]?.label ?? S.run.model : '';
  const elev = p.elevation === null ? '' : ` · ${formatElevation(p.elevation)}`;
  const extra = S.active.footer(ctx);
  // A layer's own first line (precipitation: the snow ratio) sits above the model line.
  const own = S.active.id === 'precipitation' ? extra : [];
  const after = S.active.id === 'precipitation' ? [] : extra;
  // Radar is observed and an avalanche bulletin is issued: their own lines only (no model, run or bands of the app's).
  const footLines = S.active.frames || S.active.id === 'avalanche' || S.active.id === airQuality.id ? extra : [...own, `${model} · ${runText}${elev}`, ...after, `Elevation bands approximate (${bands.region})`];
  for (const text of footLines) {
    const l = document.createElement('span');
    l.textContent = text;
    lines.append(l);
  }
  const btn = document.createElement('button');
  btn.className = 'secondary-button';
  btn.id = 'layer-settings';
  btn.innerHTML = `${icons.gear}<span>Layer settings</span>`;
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.addEventListener('click', () => openLayerSettings(btn));
  foot.append(lines, btn);
  // The forecast summary window: every chosen layer at the pin (also press-and-hold on the map).
  const full = document.createElement('button');
  full.className = 'secondary-button summary-open';
  full.id = 'summary-open';
  full.setAttribute('aria-haspopup', 'dialog');
  full.innerHTML = `${icons['pin-small']}<span>Forecast summary for this point</span>`;
  full.addEventListener('click', () => openSummaryFrom(full));
  nodes.push(foot, full);
  box.replaceChildren(...nodes);
  document.body.dataset.details = 'ready';
}
/** The active layer's settings panel (v8 17-PrecipSettings, 22-TempSettings), remembered between sessions. */
export function openLayerSettings(origin: HTMLElement) {
  if (isOpenFrom(origin)) { closePanel(); return; }
  const layer = S.active;
  const values = app.settingsFor(layer);
  const body = document.createElement('div');
  body.className = 'panel-groups';
  const change = (key: string, v: string | boolean) => app.setLayerSetting(layer, key, v);
  for (const st of layer.settings) {
    if (st.kind === 'segmented') {
      const g = document.createElement('div');
      g.className = 'group';
      const title = document.createElement('span');
      title.className = 'group-title';
      title.textContent = st.title;
      const seg = document.createElement('div');
      seg.className = 'segmented';
      for (const o of st.options) {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.setAttribute('aria-pressed', String(values[st.key] === o.value));
        b.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          change(st.key, o.value);
        });
        seg.append(b);
      }
      g.append(title, seg);
      body.append(g);
    } else {
      const row = document.createElement('button');
      row.className = 'switch-row';
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', String(values[st.key] === true));
      row.innerHTML = '<span class="switch-label"></span><span class="switch" aria-hidden="true"><span></span></span>';
      row.querySelector('.switch-label')!.textContent = st.title;
      row.addEventListener('click', () => {
        const next = row.getAttribute('aria-checked') !== 'true';
        row.setAttribute('aria-checked', String(next));
        change(st.key, next);
      });
      body.append(row);
    }
  }
  const note = document.createElement('p');
  note.className = 'panel-note';
  note.textContent = layer.settingsNote;
  body.append(note);
  openPanel({ origin, icon: icons.gear, title: `${layer.title} settings`, caption: 'Remembered on this phone', body });
}
