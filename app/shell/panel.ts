// The grow panel: any control that opens something grows from its own
// position into a rounded panel over a 35% scrim. One component serves the
// map panel now and the menus and settings later.
import { icons } from './icons';

export interface PanelOptions {
  origin: HTMLElement;
  icon: string;
  title: string;
  caption: string;
  body: HTMLElement;
  onClose?: () => void;
  /** Show the icon small, after the title (menus that grow from a title, such as the layer menu). */
  iconAfterTitle?: boolean;
}

let current: { close: () => void; origin: HTMLElement } | null = null;

export function isOpenFrom(origin: HTMLElement): boolean {
  return current?.origin === origin;
}

export function closePanel(): void {
  current?.close();
}

export function openPanel(opts: PanelOptions): void {
  closePanel();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', opts.title);
  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-icon">${opts.icon}</span>
      <span class="panel-titles"><span class="panel-title"></span><span class="panel-caption"></span></span>
      <button class="panel-close" aria-label="Close">${icons.close}</button>
    </div>`;
  panel.querySelector('.panel-title')!.textContent = opts.title;
  if (opts.iconAfterTitle) {
    panel.querySelector('.panel-icon')!.remove();
    const after = document.createElement('span');
    after.className = 'panel-title-icon';
    after.innerHTML = opts.icon;
    panel.querySelector('.panel-title')!.append(after);
    panel.querySelector('.panel-header')!.classList.add('panel-header-plain');
  }
  panel.querySelector('.panel-caption')!.textContent = opts.caption;
  const body = document.createElement('div');
  body.className = 'panel-body';
  body.append(opts.body);
  panel.append(body);

  // Anchor to the side of the screen the control is on, and grow from it.
  const r = opts.origin.getBoundingClientRect();
  const fromBottom = r.top > window.innerHeight / 2;
  if (fromBottom) panel.style.bottom = 'calc(var(--bottom-inset) + 16px - var(--viewport-gap))';
  else panel.style.top = `${r.top}px`;
  document.body.append(scrim, panel);
  const p = panel.getBoundingClientRect();
  panel.style.transformOrigin = `${r.left + r.width / 2 - p.left}px ${r.top + r.height / 2 - p.top}px`;
  requestAnimationFrame(() => {
    scrim.dataset.open = 'true';
    panel.dataset.open = 'true';
  });
  opts.origin.setAttribute('aria-expanded', 'true');

  const close = () => {
    if (current?.origin !== opts.origin) return;
    current = null;
    scrim.dataset.open = 'false';
    panel.dataset.open = 'false';
    opts.origin.setAttribute('aria-expanded', 'false');
    setTimeout(() => { scrim.remove(); panel.remove(); }, 260);
    opts.onClose?.();
    opts.origin.focus({ preventScroll: true });
  };
  scrim.addEventListener('click', close);
  panel.querySelector('.panel-close')!.addEventListener('click', close);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  current = { close, origin: opts.origin };
  (panel.querySelector('.panel-close') as HTMLElement).focus({ preventScroll: true });
}
