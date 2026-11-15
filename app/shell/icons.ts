// Icons from the v8 boards (24 px grid, stroked with currentColor).
const svg = (size: number, body: string, stroke = 1.8, fill = 'none') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  locate: svg(24, '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/>'),
  layers: svg(24, '<path d="m12 3.5 8 4.5-8 4.5-8-4.5 8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16 8 4.5 8-4.5"/>'),
  layersPanel: svg(22, '<path d="m12 3.5 8 4.5-8 4.5-8-4.5 8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16 8 4.5 8-4.5"/>'),
  close: svg(22, '<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg(16, '<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.4),
  'pin-small': svg(14, '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 2),
} as const;

export type IconName = keyof typeof icons;

/** Fill every element carrying data-icon="name". */
export function hydrateIcons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.dataset.icon as IconName;
    if (icons[name]) el.innerHTML = icons[name];
  });
}
