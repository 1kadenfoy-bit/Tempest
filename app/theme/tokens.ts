// Turns design/tokens.json into CSS variables. The only place tokens are read
// for the interface; components use var(--name).
import tokens from '../../design/tokens.json';

type ColorToken = { dark?: string; darkAlpha?: number; light?: string; lightAlpha?: number };
export type Theme = 'dark' | 'light';
export type ColorName = keyof typeof tokens.color;

function withAlpha(hex: string, alpha: number | undefined): string {
  if (alpha === undefined) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A colour token for the theme. A token with no light value (only "card"
 * today) is a white tint over the dark interface; in light it becomes the
 * same tint of the light ink, as the tokens do for stroke and fill-control.
 */
export function colorToken(name: ColorName, theme: Theme = 'dark'): string {
  const t = tokens.color[name] as ColorToken;
  if (theme === 'light' && t.light === undefined && t.dark?.toUpperCase() === '#FFFFFF') {
    return withAlpha((tokens.color.ink as ColorToken).light!, t.darkAlpha);
  }
  const hex = (theme === 'dark' ? t.dark : t.light) ?? t.dark ?? '#000000';
  return withAlpha(hex, theme === 'dark' ? t.darkAlpha : t.lightAlpha);
}

/** The token's colour with no transparency (for the status bar, which takes no alpha). */
export function solidToken(name: ColorName, theme: Theme = 'dark'): string {
  const t = tokens.color[name] as ColorToken;
  return (theme === 'dark' ? t.dark : t.light ?? t.dark) ?? '#000000';
}

export function tokenCss(theme: Theme = 'dark'): string {
  const lines: string[] = [];
  for (const name of Object.keys(tokens.color) as ColorName[]) {
    lines.push(`--${name}: ${colorToken(name, theme)};`);
  }
  // Rain and snow amounts written as text (the totals table). Dark: the
  // tokens' text accents. Light has none, so the darkest stop of each light
  // ramp, which reads on white. The map's ramps are not themed.
  const precip = tokens.data.precipitation;
  lines.push(
    `--accent-rain: ${theme === 'dark' ? precip.textAccent.rain : precip.rain.light.at(-1)};`,
    `--accent-snow: ${theme === 'dark' ? precip.textAccent.snow : precip.snow.light.at(-1)};`,
  );
  lines.push(`--font-display: ${tokens.font.display};`, `--font-body: ${tokens.font.body};`);
  for (const [name, t] of Object.entries(tokens.type)) {
    lines.push(`--type-${name}: ${t.weight} ${t.size}px var(--font-${t.family});`);
  }
  for (const [name, r] of Object.entries(tokens.radius)) {
    lines.push(`--radius-${name}: ${typeof r === 'number' ? `${r}px` : r};`);
  }
  lines.push(`--screen-edge: ${tokens.space['screen-edge']}px;`, `--gap-controls: ${tokens.space['gap-controls']}px;`);
  lines.push(`--touch-min: ${tokens.size['touch-target-min']}px;`, `--thumb: ${tokens.size['thumb-button']}px;`);
  return `:root{${lines.join('')}}`;
}

/** Put the theme's tokens on the page (replacing the ones there, so the theme can change while the app runs). */
export function applyTokens(doc: Document, theme: Theme = 'dark'): void {
  let style = doc.head.querySelector<HTMLStyleElement>('style[data-tokens]');
  if (!style) {
    style = doc.createElement('style');
    doc.head.prepend(style);
  }
  style.dataset.tokens = theme;
  style.textContent = tokenCss(theme);
}
