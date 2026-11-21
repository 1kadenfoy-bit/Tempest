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
  /** A button in the header, before Close (the map panel's settings gear). */
  headerAction?: HTMLElement;
  /**
   * Try-out (Kaden, Nov 21): instead of a panel popping up, the button itself
   * grows into the panel's shape, and shrinks back into the button on close.
   * Off unless asked for, so each window can be compared with the old grow.
   */
  morph?: boolean;
}

// A calmer curve than the pop-up's, so the button can be seen turning into the window.
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const GROW_MS = 400;
const SHRINK_MS = 320;
const frame = (r: DOMRect, radius: string): Keyframe => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius });

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
  if (opts.headerAction) {
    opts.headerAction.classList.add('panel-action');
    panel.querySelector('.panel-close')!.before(opts.headerAction);
  }
  const body = document.createElement('div');
  body.className = 'panel-body';
  body.append(opts.body);
  panel.append(body);

  // Anchor to the side of the screen the control is on, and grow from it.
  const r = opts.origin.getBoundingClientRect();
  const fromBottom = r.top > window.innerHeight / 2;
  if (fromBottom) panel.style.bottom = 'calc(var(--bottom-inset) + 16px - var(--viewport-gap))';
  else panel.style.top = `${r.top}px`;
  const morph = Boolean(opts.morph) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (morph) panel.dataset.morph = 'true';
  document.body.append(scrim, panel);
  const p = panel.getBoundingClientRect();
  panel.style.transformOrigin = `${r.left + r.width / 2 - p.left}px ${r.top + r.height / 2 - p.top}px`;
  const originRadius = getComputedStyle(opts.origin).borderRadius || '0px';
  if (morph) {
    // The button grows into the window: the panel starts exactly on the button and animates to its own size.
    const from = opts.origin.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    const finalRadius = getComputedStyle(panel).borderRadius;
    // Keep the content at its final width so text does not re-wrap while the panel grows.
    const inner = [...panel.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    inner.forEach((c) => { c.style.width = `${to.width - 2}px`; });
    const grow = panel.animate([frame(from, originRadius), frame(to, finalRadius)], { duration: GROW_MS, easing: EASE });
    inner.forEach((c) => c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: GROW_MS, easing: 'linear' }));
    // What was on the button fades away as the window's own content fades in.
    const ghost = opts.origin.cloneNode(true) as HTMLElement;
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.removeAttribute('id');
    ghost.style.cssText = `position:absolute;left:-1px;top:-1px;margin:0;width:${from.width}px;height:${from.height}px;pointer-events:none;background:transparent;border-color:transparent;`;
    panel.append(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished.then(() => ghost.remove()).catch(() => ghost.remove());
    opts.origin.style.visibility = 'hidden';
    void grow.finished.then(() => inner.forEach((c) => { c.style.width = ''; })).catch(() => undefined);
    scrim.dataset.open = 'true';
    panel.dataset.open = 'true';
  } else {
    requestAnimationFrame(() => {
      scrim.dataset.open = 'true';
      panel.dataset.open = 'true';
    });
  }
  opts.origin.setAttribute('aria-expanded', 'true');

  // Only this panel: a panel that replaced it (same button, such as model
  // info opened from the model menu) stays until its own close.
  const close = () => {
    if (current?.close !== close) return;
    current = null;
    document.removeEventListener('keydown', onKey);
    scrim.dataset.open = 'false';
    panel.dataset.open = 'false';
    opts.origin.setAttribute('aria-expanded', 'false');
    if (morph) {
      // Shrink back into the button, then show the button again.
      const nowBox = panel.getBoundingClientRect();
      const back = opts.origin.getBoundingClientRect();
      [...panel.children].forEach((c) => (c as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
      const shrink = panel.animate([frame(nowBox, getComputedStyle(panel).borderRadius), frame(back, originRadius)], { duration: SHRINK_MS, easing: EASE, fill: 'forwards' });
      const done = () => { opts.origin.style.visibility = ''; scrim.remove(); panel.remove(); opts.origin.focus({ preventScroll: true }); };
      shrink.finished.then(done).catch(done);
      opts.onClose?.();
      return;
    }
    setTimeout(() => { scrim.remove(); panel.remove(); }, 260);
    opts.onClose?.();
    opts.origin.focus({ preventScroll: true });
  };
  scrim.addEventListener('click', close);
  panel.querySelector('.panel-close')!.addEventListener('click', close);
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  current = { close, origin: opts.origin };
  (panel.querySelector('.panel-close') as HTMLElement).focus({ preventScroll: true });
}
