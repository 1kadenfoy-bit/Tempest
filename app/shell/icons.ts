// Icons from the v8 boards (24 px grid, stroked with currentColor).
const svg = (size: number, body: string, stroke = 1.8, fill = 'none') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  locate: svg(24, '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/>'),
  layers: svg(24, '<path d="m12 3.5 8 4.5-8 4.5-8-4.5 8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16 8 4.5 8-4.5"/>'),
  layersPanel: svg(22, '<path d="m12 3.5 8 4.5-8 4.5-8-4.5 8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16 8 4.5 8-4.5"/>'),
  // Reset to flat and north up: a compass needle, the north half filled.
  compass: svg(24, '<path d="M12 3.5 15.5 12h-7L12 3.5z" fill="currentColor"/><path d="M8.5 12h7L12 20.5 8.5 12z"/>'),
  close: svg(22, '<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg(16, '<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.4),
  play: svg(20, '<path d="M8 5.5v13l11-6.5-11-6.5z"/>', 0, 'currentColor'),
  pause: svg(20, '<path d="M8 5.5h3v13H8zM13 5.5h3v13h-3z"/>', 0, 'currentColor'),
  chevron: svg(16, '<path d="m6 9 6 6 6-6"/>', 2.2),
  chevronUp: svg(16, '<path d="m6 15 6-6 6 6"/>', 2.2),
  gear: svg(20, '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  snowflake: svg(20, '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>'),
  shift: svg(20, '<path d="M19 12a7 7 0 0 1-12 4.9M5 12a7 7 0 0 1 12-4.9"/><path d="M17 3.5v3.6h-3.6M7 20.5v-3.6h3.6"/>'),
  calm: svg(20, '<path d="M5 10c2-1.5 4-1.5 7 0s5 1.5 7 0M5 14.5c2-1.5 4-1.5 7 0s5 1.5 7 0"/>'),
  // The Notification Centre at rest; the warning triangle replaces it while an alert is in force.
  bell: svg(24, '<path d="M6 9.5a6 6 0 0 1 12 0c0 4.8 2 6.3 2 6.3H4s2-1.5 2-6.3z"/><path d="M10 19.2a2 2 0 0 0 4 0"/>'),
  gearLarge: svg(24, '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  // The layer menu's icons (Kaden approved Nov 21): one per condition layer, keyed by layer id.
  'layer-precipitation': svg(28, '<path d="M7.5 14.5H7a3.5 3.5 0 0 1-.4-6.98 5.5 5.5 0 0 1 10.7-.9A3.9 3.9 0 0 1 17 14.5h-.5"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>'),
  'layer-temperature': svg(28, '<path d="M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z"/><path d="M12 9.5v7"/><path d="M16.8 6h2M16.8 9h2"/><circle cx="12" cy="17.5" r="1.3" fill="currentColor"/>'),
  'layer-wind': svg(28, '<path d="M3.5 8.5h9.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3.5 12.5h14a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3.5 16.5h6a2 2 0 1 1-2 2"/>'),
  'layer-radar': svg(28, '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'),
  'layer-avalanche': svg(28, '<path d="M3 19.5 9.5 7.5l3.8 6.5 1.7-2.8 6 8.3H3z"/><path d="M7.4 11.6 9.5 10l1.9 1.4"/><circle cx="15.2" cy="8" r="0.9" fill="currentColor"/><circle cx="18.3" cy="10.3" r="0.9" fill="currentColor"/><circle cx="19.6" cy="6.6" r="0.9" fill="currentColor"/>'),
  'layer-air-quality': svg(28, '<path d="M3.5 12.5c2-2 3.5 2 5.5 0s3.5 2 5.5 0 3.5 2 5.5 0"/><path d="M3.5 17.5c2-2 3.5 2 5.5 0s3.5 2 5.5 0 3.5 2 5.5 0"/><circle cx="6" cy="7" r="1.1" fill="currentColor"/><circle cx="11" cy="5.2" r="1.1" fill="currentColor"/><circle cx="16" cy="7.4" r="1.1" fill="currentColor"/><circle cx="19.5" cy="5" r="1.1" fill="currentColor"/>'),
  // Settings window icons (Kaden, Nov 22).
  moon: svg(20, '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  sun: svg(20, '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  phone: svg(20, '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>'),
  download: svg(20, '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  degC: svg(20, '<circle cx="6" cy="6.5" r="1.6"/><path d="M19 9.5a5.5 5.5 0 1 0 0 8"/>'),
  degF: svg(20, '<circle cx="6" cy="6.5" r="1.6"/><path d="M18.5 8.5H12v10M12 13h5"/>'),
  // The map panel's button icons (Kaden approved Nov 22).
  mapFlat: svg(22, '<path d="M3 6.5 9 4.5l6 2 6-2v13l-6 2-6-2-6 2z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  mapCube: svg(22, '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/>'),
  mapTerrain: svg(22, '<path d="M2.5 19.5 9 8l4 6.5 2.5-4 6 9z"/><path d="M6.5 14.5c1.5-.8 2.5 1 4 .2"/>'),
  mapSatellite: svg(22, '<circle cx="11" cy="13" r="3.8"/><ellipse cx="11" cy="13" rx="9" ry="3.6" transform="rotate(-28 11 13)"/><circle cx="18.6" cy="6.4" r="1.3" fill="currentColor"/>'),
  mapTrails: svg(22, '<path d="M2.5 19.5 12 5l9.5 14.5z"/><path d="M12 5v14.5M9 19.5l3-5 3 5"/>'),
  mapPeaks: svg(22, '<path d="M3 19.5 10 8l4 6.5 2.5-3.5 4.5 8.5z"/><path d="M10 8V3.5l3.5 1.4L10 6.3"/>'),
  mapContours: svg(22, '<path d="M4 12.5c0-4 2.5-7.5 7.5-7.5 5.2 0 8.5 3 8.5 7 0 4.3-3.6 7-8.2 7-4.6 0-7.8-2.5-7.8-6.5z"/><path d="M8.5 12.5c0-2.2 1.4-4 3.4-4 2.2 0 3.7 1.5 3.7 3.5 0 2.2-1.7 3.6-3.8 3.6-2 0-3.3-1.4-3.3-3.1z"/>'),
  mapRoads: svg(22, '<path d="M6.5 21c0-5.5 11-4 11-10.5 0-3-2.3-5.6-5.8-7.5" stroke-dasharray="3 3"/><path d="M4.5 21c0-6.5 11-4.5 11-10.5" opacity="0"/>'),
  mapSki: svg(22, '<path d="M2.5 5.5 21.5 10"/><path d="M12 7.7v3.3"/><path d="M8.5 11h7v5.5h-7z"/><path d="M8.5 13.7h7"/>'),
  mapPark: svg(22, '<ellipse cx="12" cy="12" rx="9.5" ry="8" stroke-dasharray="3 2.6"/><path d="M12 7.2l3 4.3h-2l2.5 3.5h-7l2.5-3.5H9z"/><path d="M12 15v2"/>'),
  mapRegion: svg(22, '<path d="M4 7.5 11 4l9 3.5-1.2 8.8L11 20 4 16z" stroke-dasharray="3 2.6"/>'),
  mapCity: svg(22, '<path d="M4 20V9.5l5-3V20M9 20V4.5l6 2V20M15 20v-8.5l5 2V20M3 20h18"/>'),
  mapStation: svg(22, '<path d="M12 21V9"/><path d="M9 21h6"/><rect x="9.5" y="13" width="5" height="4" rx="0.8"/><path d="M12 9 6 6.3M12 9l6-2.7M12 9V3.8"/><circle cx="5.2" cy="6" r="1.7"/><circle cx="18.8" cy="6" r="1.7"/><circle cx="12" cy="2.9" r="1.5"/>'),
  mapRainSnow: svg(22, '<path d="M3 12.5h18" stroke-dasharray="3 2.6"/><path d="M16.5 2.8v7M13.9 4.3l5.2 3M19.1 4.3l-5.2 3"/><path d="M7.5 14.6c1.8 2 2.6 3.3 2.6 4.4a2.6 2.6 0 1 1-5.2 0c0-1.1.8-2.4 2.6-4.4z"/>'),
  mapFreezing: svg(22, '<path d="M3 15.5h18" stroke-dasharray="3 2.6"/><path d="M12 3.5v9M8.1 5.8l7.8 4.4M15.9 5.8l-7.8 4.4"/>'),
  mapDayNight: svg(22, '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'),
  mapBuildings: svg(22, '<path d="M5 20V9.5l5-2L15 9.5V20M15 20v-7.5l4-1.5V20M3 20h18M8 12.5h4M8 16h4"/>'),
  mapCloud: svg(22, '<path d="M7.5 18.5a4 4 0 0 1-.6-7.95A6 6 0 0 1 18.2 9.4 4.6 4.6 0 0 1 17.5 18.5z"/>'),
  mapWind: svg(22, '<path d="M3.5 8.5h9.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3.5 12.5h14a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3.5 16.5h6a2 2 0 1 1-2 2"/>'),
  mapWall: svg(22, '<path d="M3 20V10h3.6V7h3v3h4.8V7h3v3H21v10z"/><path d="M3 15h18M9.5 15v5M14.5 15v5"/>'),
  mapWater: svg(22, '<path d="M12 3c2.8 3.2 4.2 5.2 4.2 7.2a4.2 4.2 0 1 1-8.4 0C7.8 8.2 9.2 6.2 12 3z"/><path d="M3 19c2-2 3.5 2 5.5 0s3.5 2 5.5 0 3.5 2 5.5 0"/>'),
  mapTrees: svg(22, '<path d="M12 3.2c-2.4 0-4.2 1.7-4.4 3.9A3.9 3.9 0 0 0 6 14.3c.4 1.7 1.8 2.8 3.6 2.8h4.8c1.8 0 3.2-1.1 3.6-2.8a3.9 3.9 0 0 0-1.6-7.2c-.2-2.2-2-3.9-4.4-3.9z"/><path d="M12 17.1V21M12 13.6l-2.4-2.2M12 15.2l2.4-2.2"/>'),
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
