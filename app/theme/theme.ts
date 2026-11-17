// The app's theme: dark (default), light, or matching the phone. Applying a
// theme swaps the token variables, the status bar colour and the page's
// colour scheme; the map and canvases are redrawn by their owners.
import { applyTokens, solidToken, type Theme } from './tokens';

export type ThemeChoice = 'dark' | 'light' | 'system';
export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];

/** The theme to show for a choice; "system" follows the phone's light or dark setting. */
export function resolveTheme(choice: ThemeChoice | undefined, prefersLight: boolean): Theme {
  if (choice === 'light') return 'light';
  if (choice === 'system') return prefersLight ? 'light' : 'dark';
  return 'dark';
}

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function prefersLight(win: Window = window): boolean {
  return win.matchMedia?.(LIGHT_QUERY).matches ?? false;
}

/** Call `onChange` when the phone switches between light and dark. Returns a stop function. */
export function watchPhoneTheme(onChange: () => void, win: Window = window): () => void {
  const mq = win.matchMedia?.(LIGHT_QUERY);
  if (!mq) return () => undefined;
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function meta(doc: Document, name: string): HTMLMetaElement {
  let m = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!m) {
    m = doc.createElement('meta');
    m.name = name;
    doc.head.append(m);
  }
  return m;
}

/** Tokens, `data-theme` on the root, and the status bar colour for the theme. */
export function applyTheme(doc: Document, theme: Theme): void {
  applyTokens(doc, theme);
  doc.documentElement.dataset.theme = theme;
  // Android's status bar takes this colour; the map ground runs up under it.
  meta(doc, 'theme-color').content = solidToken('map-ground', theme);
  // iOS reads this when the installed app starts: light text on the dark
  // map, dark text on the light one.
  meta(doc, 'apple-mobile-web-app-status-bar-style').content = theme === 'light' ? 'default' : 'black-translucent';
}
