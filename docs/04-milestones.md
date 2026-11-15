# Tempest: milestones

Build in this order. **Stop at the end of every milestone** and wait for Kaden's go-ahead. This file replaces the two "Build order" sections in `docs/03-architecture.md`.

## How every milestone ends

1. All checks pass: typecheck, lint, unit tests, build, and the screenshot tests.
2. The preview site is updated, so Kaden can open it on his phone.
3. A short report, written for someone who does not read code:
   - what now works, as things he can try on the phone
   - screenshots of the built screens beside their `design/v8/png` references, with any differences listed
   - decisions you made, and anything you were unsure about
   - facts you checked and what you found
   - what you need from him, if anything
4. Open a pull request for the milestone. Do not start the next milestone until he says so.

If you are blocked mid-milestone by something only Kaden can do, stop there and say exactly what is needed.

## M0. Setup and spikes

Goal: a working repo, a preview site, and the main risks tested before anything is built on them.

- Scaffold: Vite + TypeScript, strict mode. Folders as in `CLAUDE.md`. Vitest for unit tests, Playwright for screenshot tests at 390 × 844.
- CI on GitHub Actions: typecheck, lint, tests, build.
- Preview hosting. Recommend an option and set it up as far as you can. Some weather-drawing libraries need cross-origin isolation headers, which GitHub Pages cannot set; check whether that matters before choosing. Kaden may need to create an account.
- Run the spikes listed under "Spikes" in `docs/03-architecture.md`. Write each result to `docs/spikes/NN-name.md`: question, what you tried, result, consequence.
- Some spikes cannot be finished from a cloud session. For phone performance, put a test page on the preview site and ask Kaden to open it and report. Leave the Capacitor spike until the wrapper is scheduled; test the same question in iPhone Safari as a home-screen web app instead. The Avalanche Canada email is Kaden's; draft it for him. The probability prototype can wait until ensembles are scheduled.
- Recheck the facts marked unconfirmed in `docs/06-decisions-and-open-items.md` that affect M1 to M3.

Done when: CI is green, a "hello map" page is live on the preview URL, every spike has a written result, and any plan changes the spikes force are proposed in the report.

## M1. Map and shell

Goal: the empty template, working. Reference: `01-Home`, `02-MapLayers`, `06-SheetUp`, `09-Tokens`, `10-Components`.

- Topo base map, hillshade and contours for BC, opening on the North Shore and Sea to Sky area.
- Tokens from `design/tokens.json` as CSS variables. Inter and Space Grotesk, self-hosted.
- Top bar, thumb buttons, the pin (starts on your location; tap moves it), bottom sheet with collapsed and pulled-up positions and empty slots, and the grow panel with scrim.
- Map panel with base map and terrain switches that work. Leave out switches that do nothing.
- Installable as a home-screen web app with the Tempest icon.

Done when: the shell matches the template screens at 390 × 844, safe areas are respected on a notched phone, and the sheet and panels move smoothly on a phone.

## M2. Precipitation on the map

Goal: the first real layer, end to end, online. Reference: `13-Precip`, `14-PrecipHome`.

- Variable vocabulary, the store, and the first adapter (Open-Meteo), following the data contract.
- One model: HRDPS.
- Map fill by rate and type, readout, legend, layer chart, window control, window summary, week strip, the one time cursor, Now and play.
- Model run and age in the top bar.

Done when: Kaden can scrub the next 48 h of precipitation anywhere in BC and the pin's numbers match Open-Meteo's own point forecast for the same model run.

## M3. Offline proof

Goal: prove the hardest architectural promise early.

- The app's own GPU grid renderer, reading from the store, behind the rendering seam.
- A minimal save: one area, precipitation, 48 h, plus the base map and terrain for it.
- With the network off, the saved area draws and scrubs through the same read path as live data, showing its run and age.

Done when: saving on Wi-Fi then switching to airplane mode shows the same picture and numbers for the saved area. Report the real download sizes.

## M4. Temperature

Goal: the second layer, and the shared layer contract. Reference: `18-Temp`, `19-TempHome`.

- Port the terrain correction from `docs/reference/windy-plugin/toposcale.ts` with its tests. Interpolate profiles, never finished temperatures.
- Map fill, dashed 0 °C line, feels-like (ECCC wind chill and humidex), chart, legend, readout, daily highs and lows on the week strip.
- Now that two layers exist, extract the layer contract. Precipitation and temperature must not import each other.

Done when: a ridge and the valley below it read differently, and a spot check against the Windy plugin or a station is within a degree or two, with the comparison in the report.

## M5. Details and settings

Goal: the pulled-up sheet for both layers. Reference: `11-DetailElements`, `15` to `17`, `20` to `22`.

- The standard cards in fixed order, the two shared visuals, the In view line, the footer.
- Layer settings panels for precipitation and temperature, remembered between sessions.
- Elevation bands: propose a per-region rule; label them approximate until Kaden agrees.

Done when: both layers' detail screens match their references and every number on them is traceable to stored data.

## M6. Models

Goal: more than one source, chosen per layer. Reference: `04-ModelMenu`, `05-ModelInfo`.

- Resolver with the fallback chain HRDPS, RDPS, then global. The seam is marked on the week strip.
- Model menu listing only models that carry what the layer needs. Choice remembered per layer.
- Model info cards, with content from `docs/05-data-sources.md`.
- Observed data for the past part of the week, with the seam at now.

Done when: switching model changes the map, chart and readout together, the cursor stops at each model's end, and an unavailable model falls back visibly.

## M7. Wind

Reference: `23-Wind` to `27-WindSettings`.

- Speed and gusts at the terrain, flow animation that pauses when the app is hidden, arrows when it is off.
- Chart, legend, readout, detail cards, settings with the calm threshold.

Done when: the screens match, and the animation holds a smooth frame rate on Kaden's phone without heating it. Report the measured frame rate.

## M8. Saved areas

Reference: `08-SaveArea`.

- The full save flow: drag the box, choose layers and a window, see sizes, save.
- Saved areas list: age, expiry, refresh, delete. A "saved data only" switch.
- Storage that survives: request persistent storage and report what iOS grants.

Done when: Kaden can save a touring area at home and use all three layers there with no signal.

## M9. Alerts, search, settings, light theme

These have no v8 design. Build the plainest version from existing components and expect a redesign.

- Alerts panel from the badge, with ECCC alerts shown exactly as issued.
- Place search that moves the pin.
- App settings: units, theme, credits generated from source metadata.
- Light theme from the tokens.

## After that

Not scheduled. Each waits for a design from Kaden: Cloud, Radar, Avalanche, Air quality, Sun, Marine, Forecast, overlays, compare two models, the full forecast window, routes and trails, the Capacitor wrapper for the app stores.
