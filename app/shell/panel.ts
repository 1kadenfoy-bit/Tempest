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
   * The button itself grows into the panel's shape, and shrinks back into the
   * button on close (Kaden, Nov 21). On for every window; `false` opts one out.
   */
  morph?: boolean;
  /**
   * The shape the window grows from, when it is bigger than the button that opens it
   * (the layer button sits inside the top bar, which also holds the source button).
   * Defaults to `origin`.
   */
  shape?: HTMLElement;
}

// A calmer curve than the pop-up's, so the button can be seen turning into the window.
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** How long a window takes to grow out of its button (Kaden settled on 0.4 s, Nov 21). Closing takes 80% of it. */
const GROW_MS = 400;

let current: { close: (instant?: boolean) => void; origin: HTMLElement } | null = null;

export function isOpenFrom(origin: HTMLElement): boolean {
  return current?.origin === origin;
}

export function closePanel(): void {
  current?.close();
}

/** The button's corner radius in pixels: a round button's is half its size, and a button with no shape of its own is drawn as a pill. */
function originRadiusPx(el: HTMLElement, box: DOMRect): number {
  const r = getComputedStyle(el).borderTopLeftRadius;
  const max = Math.min(box.width, box.height) / 2;
  const px = r.endsWith('%') ? max : parseFloat(r) || 0;
  return Math.min(px > 0 ? px : max, max);
}

/**
 * One frame of the growth: the panel's real box and real corner radius. Animating the box itself (not
 * a scaled copy) keeps the corners true all the way: they ease from the button's radius to the window's.
 */
const box = (r: DOMRect, radius: number): Keyframe => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${radius}px` });

/** A shape the window can grow from: on screen and big enough to see. */
function growsFrom(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width >= 16 && r.height >= 16 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

export function openPanel(opts: PanelOptions): void {
  // A window that opens over another takes its place at once, so two animations never overlap.
  const replacing = current !== null;
  current?.close(true);
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
  // A button can ask for its window at the top of the screen (the search button's data-panel-anchor).
  if (opts.origin.dataset.panelAnchor === 'top') panel.style.top = 'calc(var(--safe-top) + 8px)';
  // The map layers button asks for the bottom, so the panel opens the same wherever the sheet has put the button.
  else if (fromBottom || opts.origin.dataset.panelAnchor === 'bottom') panel.style.bottom = 'calc(var(--bottom-inset) + 16px - var(--viewport-gap))';
  else panel.style.top = `${r.top}px`;
  const shape = opts.shape ?? opts.origin;
  const morph = opts.morph !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches && growsFrom(shape);
  if (morph) panel.dataset.morph = 'true';
  document.body.append(scrim, panel);
  const p = panel.getBoundingClientRect();
  panel.style.transformOrigin = `${r.left + r.width / 2 - p.left}px ${r.top + r.height / 2 - p.top}px`;
  if (morph) {
    // The button grows into the window: the panel starts exactly on the button (same box, same corners)
    // and its box and corners ease to the window's.
    const from = shape.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    const rb = originRadiusPx(shape, from);
    const ms = GROW_MS;
    // The content keeps its final width while the box grows, so text does not re-wrap on the way.
    const kids = [...panel.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    kids.forEach((c) => { c.style.width = `${to.width - 2}px`; });
    panel.animate([box(from, rb), box(to, parseFloat(getComputedStyle(panel).borderRadius) || 28)], { duration: ms, easing: EASE })
      .finished.then(() => kids.forEach((c) => { c.style.width = ''; })).catch(() => undefined);
    const inner = [...panel.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    inner.forEach((c) => c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: ms, easing: 'linear' }));
    // What was on the button fades away over the first part of the growth.
    const ghost = shape.cloneNode(true) as HTMLElement;
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.removeAttribute('id');
    ghost.style.cssText = `position:fixed;z-index:12;left:${from.left}px;top:${from.top}px;margin:0;width:${from.width}px;height:${from.height}px;pointer-events:none;background:transparent;border-color:transparent;`;
    document.body.append(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(ms * 0.35, 400), fill: 'forwards' }).finished.then(() => ghost.remove()).catch(() => ghost.remove());
    shape.style.visibility = 'hidden';
    if (replacing) scrim.style.transition = 'none';
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
  const close = (instant = false) => {
    if (current?.close !== close) return;
    current = null;
    document.removeEventListener('keydown', onKey);
    scrim.dataset.open = 'false';
    panel.dataset.open = 'false';
    opts.origin.setAttribute('aria-expanded', 'false');
    if (morph) {
      // Shrink back into the button, then show the button again.
      if (instant) { scrim.remove(); panel.remove(); shape.style.visibility = ''; opts.onClose?.(); return; }
      const back = shape.getBoundingClientRect();
      const now = panel.getBoundingClientRect();
      const rb = originRadiusPx(shape, back);
      const ms = Math.round(GROW_MS * 0.8);
      [...panel.children].forEach((c) => { (c as HTMLElement).style.width = `${now.width - 2}px`; (c as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(ms * 0.4, 300), fill: 'forwards' }); });
      const shrink = panel.animate([box(now, parseFloat(getComputedStyle(panel).borderRadius) || 28), box(back, rb)], { duration: ms, easing: EASE, fill: 'forwards' });
      // A window that replaced this one on the same button keeps the button hidden.
      const done = () => { scrim.remove(); panel.remove(); if (current?.origin !== opts.origin) { shape.style.visibility = ''; opts.origin.focus({ preventScroll: true }); } };
      shrink.finished.then(done).catch(done);
      opts.onClose?.();
      return;
    }
    setTimeout(() => { scrim.remove(); panel.remove(); }, 260);
    opts.onClose?.();
    opts.origin.focus({ preventScroll: true });
  };
  scrim.addEventListener('click', () => close());
  panel.querySelector('.panel-close')!.addEventListener('click', () => close());
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  current = { close, origin: opts.origin };
  (panel.querySelector('.panel-close') as HTMLElement).focus({ preventScroll: true });
}
