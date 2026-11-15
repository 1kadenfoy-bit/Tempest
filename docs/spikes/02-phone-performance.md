# Spike 2: phone performance

Nov 15, 2026. **Waiting on Kaden's phone.**

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

## Needed

Kaden runs the page twice (Safari, then from the home screen), taps Copy results and pastes them back. Targets from the architecture: 60 fps panning with one fill, weather first draw under 2 s uncached.
