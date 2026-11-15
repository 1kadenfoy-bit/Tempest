# Spike 7: security headers

Nov 15, 2026. **Answered.**

## Question

Does the starter library's fast path (cross-origin isolation, `SharedArrayBuffer`) work, and how slow is the fallback? The architecture asked this for a Capacitor WebView. Capacitor is not scheduled, so it is tested in iPhone Safari and as a home-screen web app.

## What I tried

- Served the app with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (Vite dev and preview servers, and `public/_headers` for the host).
- Checked every outside server the page reads for CORS headers.
- Served the same build from a plain server with no headers.

## Result

- With the headers, the page is cross-origin isolated (`crossOriginIsolated === true`) and the fast path is on.
- Every outside server answers with `Access-Control-Allow-Origin: *`: the Open-Meteo bucket, `tiles.mapterhorn.com`, and `protomaps.github.io` (fonts and icons). So `require-corp` blocks nothing.
- `build.protomaps.com` does **not** allow other sites. The app never reads it from the browser; the build cuts our own region file from it.
- Without the headers the weather still draws (the library's slow path), and the status line says "slow path". On the desktop the difference is not visible; on a phone it may show as stutter when panning. The phone test page reports which path ran.
- iPhone Safari has supported these headers since iOS 15.2. Whether a home-screen web app keeps them is what the phone run will show.
- GitHub Pages cannot send these headers, and the repository is private, which free GitHub Pages does not host. That rules it out.

## Consequence

Host on a service that reads a `_headers` file (see `docs/hosting.md`). If the phone shows the fast path off as a home-screen app, the library still works, and the app's own renderer (M3) does not depend on it.

## On GitHub Pages (Nov 15, 2026)

The app is hosted on GitHub Pages for testing (see `docs/hosting.md`). As expected it is **not** cross-origin isolated there, and the weather draws on the slow path. In Chromium the weather's first draw took 2.3–2.5 s, against 1.8–2.0 s with the headers. The phone run will show whether panning suffers.

## On the iPhone (Nov 15, 2026)

Neither Safari nor the home-screen app was isolated on GitHub Pages, as expected. **The slow path still held 60 fps** while panning with weather, and the weather's first draw took 0.6 s in Safari and 1.2 s from the home screen (spike 2). So the headers are not needed for this stack on this phone.
