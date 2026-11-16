// Icons from the v8 boards (24 px grid, stroked with currentColor).
const svg = (size: number, body: string, stroke = 1.8, fill = 'none') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  locate: svg(24, '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/>'),
  layers: svg(24, '<path d="m12 3.5 8 4.5-8 4.5-8-4.5 8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16 8 4.5 8-4.5"/>'),
  layersPanel: svg(22, '<path d="m12 3.5 8 4.5-8 4.5-8-4.5 8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16 8 4.5 8-4.5"/>'),
  close: svg(22, '<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg(16, '<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.4),
  play: svg(20, '<path d="M8 5.5v13l11-6.5-11-6.5z"/>', 0, 'currentColor'),
  pause: svg(20, '<path d="M8 5.5h3v13H8zM13 5.5h3v13h-3z"/>', 0, 'currentColor'),
  chevron: svg(16, '<path d="m6 9 6 6 6-6"/>', 2.2),
  chevronUp: svg(16, '<path d="m6 15 6-6 6 6"/>', 2.2),
  gear: svg(20, '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  snowflake: svg(20, '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>'),
  info: svg(20, '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.6" fill="currentColor"/>'),
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
