// Small DOM helpers shared by the avalanche layer's panels (forecasts,
// reports, terrain ratings).

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * A small anchor for a panel to grow from (removed when the panel closes). It
 * sits at the tap's x and in the lower half of the screen, so the panel
 * stands on the bottom edge and gets the screen's full height to scroll in.
 */
export function anchorAt(x: number, y: number): HTMLElement {
  const a = el('span', 'avy-anchor');
  a.tabIndex = -1;
  a.style.left = `${x}px`;
  a.style.top = `${Math.max(y, window.innerHeight * 0.55)}px`;
  document.body.append(a);
  return a;
}
