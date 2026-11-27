# Section brief: Weather on the map

Each forecast and observed weather layer, from its colours to its numbers:
- the fills drawn on the GPU, colour ramps and legends;
- the 0 °C and snow lines, and the wind they hand to the 3D streaks;
- radar pictures and weather stations;
- each layer's readout, chart, summary, cards and settings.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the live view, the checks and the handoff.

## What you own

The exact list is `weather` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| The layers: precipitation, temperature, wind, radar, and new ones (cloud, sun, snow…) | `layers/precipitation/`, `layers/temperature/`, `layers/wind/`, `layers/radar/`, new `layers/<id>/` |
| The fills on the map, the line, In view, what the map holds | `app/weather/fills.ts` |
| Radar frames and pictures | `app/radar/frames.ts`, `app/map/image-frames.ts`, `adapters/eccc-radar/` |
| The GPU renderer | `render/grid-gl/` |
| Lines and wind on the terrain | `app/map/freezing-line.ts`, `app/map/wind-field.ts` |
| Weather maths | `core/temperature/`, `core/wind/`, `core/precip/`, `core/elevation/`, `core/color/` |
| Weather stations | `app/stations/`, `core/stations/`, `adapters/eccc-swob/`, `adapters/avcan-weather/` |
| Avalanche: regions, bulletins, reports, ATES terrain ratings (from the Safety chat, Nov 22) | `app/avalanche/`, `layers/avalanche/`, `core/avalanche/`, `adapters/avalanche-canada/`, `adapters/avalanche-org/` (US, new), `public/ates/`, `tools/ates-index.mjs` |
| Air quality and fires (from the Safety chat, Nov 22) | `app/air/`, `layers/air-quality/`, `core/air/`, `adapters/eccc-aqhi/`, `adapters/bc-wildfire/`, `adapters/openmeteo-air/`, `adapters/eccc-geomet/raqdps*` and `geotiff*` |
| Browser tests | `e2e/temperature.spec.ts`, `wind.spec.ts`, `radar.spec.ts`, `stations.spec.ts`, `avalanche.spec.ts`, `ates.spec.ts`, `air-quality.spec.ts` |

## Connection points

- **Data comes by variable name only** (`core/vocabulary.ts`). A layer never
  names a provider.
  - Need a new variable, such as cloud cover? Ask the Data section, or Kaden,
    who passes it on.
  - While iterating you may use Data's recorded sample.
- **The layer template** (`layers/contract.ts`, the lead's) is what you fill.
  The interface draws it.
- **A new layer joins the app in two places:**
  - the list in `app/main.ts` (`S.layers`);
  - and, if it fills the map, `updateFills` in `app/weather/fills.ts`.

  Name both in the handoff.
- **Colours:** the ramps come from `design/tokens.json` (`data.*`), coloured
  on the device from a lookup strip.
  - New ramps or colour schemes are Kaden's call. Show him options side by
    side; the lead puts his pick in the tokens.
- **The wind's animation** is Effects' 3D streaks (`render/effects/`). The
  wind layer hands them its forecast wind (`onForecastWind` in
  `app/weather/fills.ts`); the flat flow canvas is gone (Nov 27).

## Ideas waiting

- **Cloud layer.** It needs cloud cover variables from Data (low, mid and
  high cloud).
- **Sun and UV, and a new-snow totals map.**
- **Colour scheme options** for Kaden to compare, from the same recorded day.
- **Compare two models,** in `docs/04-milestones.md` and waiting for a design.
- **From the Safety chat** (ask Kaden which comes first):
  - **Avalanche Canada's daily forecasts** started Nov 25. Check the layer
    against the first real ones.
  - **US avalanche forecasts** (avalanche.org, the National Avalanche Center)
    as a second source in the avalanche source menu. They are readable from
    the browser. NWAC's observations are not: they need permission. Do not
    build those without it.
  - **BC Wildfire overlays:** fire danger rating, bans and restricted areas.
  - **Air quality's open questions:** keep CAMS in the source menu? Smoke
    only, or all PM2.5, by default?

## Rules for this section

**Safety data is shown exactly as issued** (avalanche, terrain ratings, air
quality, fire):
- with its source, issue time and link;
- never re-scored, recoloured or summarised by the app;
- official danger and alert colours stay as issued, outside the app's ramps;
- an expired bulletin says so, and its age is always shown.

When a source's words or colours look odd, show them anyway and tell Kaden.
For these sources, permission and terms come first:
- read each source's terms before using it, and record them;
- where a source asks to be contacted (Avalanche Canada), Kaden writes and you
  draft;
- never work around a source that refuses access;
- online only unless the source allows saving. The latest bulletins and fires
  may be kept automatically, with their fetch time.

**For every layer:**

- **Values reach the GPU as numbers** and are coloured on the device. Never
  bake colour into data.
- **Interpolate profiles, never finished temperatures.** Readouts use real
  model steps; blending between steps is for the picture only.
- **Units are formatted in one place** (`core/units/`).
- **Every value can say which model, run and elevation it came from.** Stale
  data is shown with its age.
- **The GPL starter library stays behind `render/`** (the lint rules enforce
  it).
