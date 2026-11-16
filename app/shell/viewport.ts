// Screen-edge fixes for the installed iPhone app.
//
// 1. With a translucent status bar, iOS can lay a home-screen app out shorter
//    than the screen, leaving a plain band along the bottom. Measure the gap
//    and let fixed layers reach past it (--viewport-gap). When iOS gets it
//    right the gap is 0 and nothing changes.
// 2. Pinch-zooming the page (not the map) serves no purpose here and leaves
//    the interface stuck enlarged, so it is blocked; the map keeps its own
//    pinch zoom.
export function measureViewportGap(): number {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  if (!standalone) return 0;
  const portrait = innerHeight >= innerWidth;
  const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const gap = Math.round(screenH - innerHeight);
  return gap > 0 && gap <= 80 ? gap : 0;
}

export function setupViewport(doc: Document): void {
  const apply = () => doc.documentElement.style.setProperty('--viewport-gap', `${measureViewportGap()}px`);
  apply();
  addEventListener('resize', apply);

  // If anything scrolls the page anyway, put it back.
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
  doc.addEventListener('focusin', () => requestAnimationFrame(() => { if (scrollX || scrollY) scrollTo(0, 0); }));

  // Safari's page pinch gesture.
  const block = (e: Event) => e.preventDefault();
  doc.addEventListener('gesturestart', block);
  doc.addEventListener('gesturechange', block);
  // Two-finger moves anywhere but the map.
  doc.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 && !(e.target as HTMLElement).closest('.maplibregl-canvas-container')) e.preventDefault();
  }, { passive: false });
}
