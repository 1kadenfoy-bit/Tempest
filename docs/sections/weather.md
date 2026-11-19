# Section brief: Weather on the map

Each forecast and observed weather layer, from its colours to its numbers:
- the fills drawn on the GPU, colour ramps and legends;
- the 0 °C and snow lines, wind arrows and flow;
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
| Browser tests | `e2e/temperature.spec.ts`, `wind.spec.ts`, `radar.spec.ts`, `stations.spec.ts` |

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
- **The wind's flow canvas** (`render/flow/`) belongs to Effects. Ask them for
  changes to the particles.

## Ideas waiting

- **Cloud layer.** It needs cloud cover variables from Data (low, mid and
  high cloud).
- **Sun and UV, and a new-snow totals map.**
- **Colour scheme options** for Kaden to compare, from the same recorded day.
- **Compare two models,** in `docs/04-milestones.md` and waiting for a design.

## Rules for this section

- **Values reach the GPU as numbers** and are coloured on the device. Never
  bake colour into data.
- **Interpolate profiles, never finished temperatures.** Readouts use real
  model steps; blending between steps is for the picture only.
- **Units are formatted in one place** (`core/units/`).
- **Every value can say which model, run and elevation it came from.** Stale
  data is shown with its age.
- **The GPL starter library stays behind `render/`** (the lint rules enforce
  it).
