# Spike 2: phone performance

Nov 15, 2026. **Answered on Kaden's iPhone.**

## Question

Does MapLibre with a local PMTiles base map, hillshade, contours and one weather raster run smoothly in iPhone Safari and as a home-screen web app?

## What I tried

The preview site has a test page, `/spike.html` ("Phone tests" on the hello map). One button:

- draws the base map, hillshade and contours and times the first draw
- pans and zooms for about 6 s and counts frames, first without and then with HRDPS precipitation
- times the first draw of the weather layer
- reports cross-origin isolation, WebGL 2, safe-area insets, home-screen mode, storage quota and persistence (spikes 7 and 9)
- cuts and stores a region file (spike 8)

Capacitor is not scheduled, so the WebView question is tested in iPhone Safari and as a home-screen web app instead, as M0 allows.

## Result so far

In headless Chromium on this cloud machine (software graphics, no GPU), every step runs without errors: base map first draw about 1.1 s, weather first draw about 1.8 to 2.0 s. The frame rates here (about 27 fps) say nothing about a phone, because there is no graphics chip.

## Result on the iPhone (Nov 15, 2026)

Kaden's iPhone (390 pt wide, 3x screen; Safari 27 on iOS reporting 18.7), app on GitHub Pages, so **slow path** (not cross-origin isolated).

| Measure | Safari | Home-screen app | Target |
| --- | --- | --- | --- |
| Base map, hillshade, contours: first draw | 0.5 s (files cached from an earlier visit) | 3.4 s (cold start) | – |
| Pan and zoom, no weather | 60 fps, 0 of 391 frames slow, worst 23 ms | 59 fps, 1 of 387 slow, worst 84 ms | 60 fps |
| HRDPS precipitation: first draw | 0.6 s | 1.2 s | < 2 s uncached |
| Pan and zoom with weather | 60 fps, 0 of 390 slow, worst 33 ms | 60 fps, 1 of 391 slow, worst 35 ms | 60 fps |

## Consequence

- **The phone holds 60 fps with one weather fill, even on the library's slow path.** The drawing-speed risk the architecture ranked first is retired for this stack.
- Cross-origin isolation is not needed for now; GitHub Pages is fine for testing. Revisit if wind particles (M7) or the app's own renderer (M3) need it.
- The 3.4 s cold start as a home-screen app is first-load network time. M1's service worker (needed for install and offline anyway) will cache the app files and should bring it under a second.
