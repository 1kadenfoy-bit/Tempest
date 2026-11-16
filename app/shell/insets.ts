// Safe areas come from the device (env(safe-area-inset-*)). For screenshot
// tests at the artboard size, ?insets=47,34 sets them to the v8 artboard's
// status bar and home indicator so the layout can be compared one to one.
export function applyInsetOverride(doc: Document, search: string): void {
  const m = /[?&]insets=(\d+),(\d+)/.exec(search);
  if (!m) return;
  doc.documentElement.style.setProperty('--safe-top', `${m[1]}px`);
  doc.documentElement.style.setProperty('--safe-bottom', `${m[2]}px`);
}
