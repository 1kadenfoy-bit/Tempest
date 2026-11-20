# Section brief: Safety

Data shown exactly as issued: avalanche forecasts and terrain ratings, weather
alerts, wildfires, and air quality with the AQHI.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the live view, the checks and the handoff.

## What you own

The exact list is `safety` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| Avalanche: regions, bulletins, reports, ATES terrain ratings | `app/avalanche/`, `layers/avalanche/`, `core/avalanche/`, `adapters/avalanche-canada/`, `public/ates/`, `tools/ates-index.mjs` |
| Weather alerts (the badge and panel) | `app/alerts/`, `core/alerts/`, `adapters/eccc-alerts/` |
| Air quality and fires | `app/air/`, `layers/air-quality/`, `core/air/`, `adapters/eccc-aqhi/`, `adapters/bc-wildfire/`, `adapters/openmeteo-air/`, `adapters/eccc-geomet/raqdps*` and `geotiff*` |
| US avalanche forecasts (new) | `adapters/avalanche-org/` |
| Browser tests | `e2e/avalanche.spec.ts`, `ates.spec.ts`, `alerts.spec.ts`, `air-quality.spec.ts` |

## The rule above all others

**Safety data is shown exactly as issued:**
- with its source, issue time and link;
- never re-scored, recoloured or summarised by the app;
- official danger and alert colours stay as issued.

When a source's words or colours look odd, show them anyway and tell Kaden.

## Connection points

- **The layer template** (`layers/contract.ts`, the lead's): the avalanche and
  air quality layers fill it like any layer.
- **The source menu** (Interface) lists a layer's sources. Adding a source
  means:
  - a row there;
  - an adapter here.
- **Shared app state** (`app/state.ts`) holds `S.avy` and `S.air`, set up in
  `app/main.ts`. Their options there are the lead's.
- **Credits** are built from each adapter's `source` metadata.

## Ideas waiting

Ask Kaden which comes first.
- **Avalanche Canada's daily forecasts** start Nov 25. Check the layer against
  the first real ones.
- **US avalanche forecasts** (avalanche.org, the National Avalanche Center) as
  a second source in the avalanche source menu.
  - They are readable from the browser.
  - NWAC's observations are not: they need permission. Do not build those
    without it.
- **BC Wildfire overlays:** fire danger rating, bans and restricted areas.
- **Air quality's open questions:**
  1. Keep CAMS in the source menu?
  2. Smoke only, or all PM2.5, by default?

## Rules for this section

- **Permission and terms come first.** Read each source's terms before using
  it, and record them.
  - Where a source asks to be contacted (Avalanche Canada), Kaden writes; you
    draft.
  - Never work around a source that refuses access.
- **Online only** unless the source allows saving. The latest bulletins and
  fires may be kept automatically, with their fetch time.
- **An expired bulletin says so.** Its age is always shown.
