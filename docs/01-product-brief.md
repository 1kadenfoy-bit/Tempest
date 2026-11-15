# Tempest: product brief

Nov 15, 2026 · Kaden Foy

Tempest is a personal, map-first weather app for planning ski touring, hiking, paddling and running in BC. It uses Canadian data first, works offline for areas saved by hand, and is built by Claude Code.

## Purpose and scope

Open it, check the conditions that matter for the day, close it.

- **Who it is for:** Kaden. It may be shared with friends. It will never be sold.
- **Activities, in priority order:** general weather, ski touring, hiking, paddling, running.
- **Model:** a Windy-style topo map with one weather layer on top, and only the layers this use needs.
- **Where:** online everywhere; offline only for areas saved by hand.
- **Not in scope:** location tracking, background activity, push alerts, accounts, a backend server. The app runs only while open.
- **Separate from the Windy terrain-temperature plugin.** That plugin's temperature method carries over (`docs/reference/windy-plugin/`).

## Requirements

| Area | Requirement |
| --- | --- |
| Conditions | The basics, plus feels-like temperature, UV, storm warnings, past weather and avalanche risk. Forecasts must suit mountains. |
| Data sources | Canadian first. Each layer takes the right information from the right source. Free sources only for now. |
| Models | Choose the model per layer; compare models later. |
| Map | Topo map with hillshade and contours. Later: 3D, slope angle, sun and moon, trails. |
| Layers | One condition layer at a time, each designed for its own information. Safety data is shown as issued. |
| Point and time | There is always a pin with a readout. Scrub through time, back into observed data and forward to the model's end. |
| Offline | Draw an area, choose layers and a time window, save. |
| Battery | Low drain. No tracking. Locate-me only while open. |
| Platforms | iPhone first, as a home-screen web app. Android and desktop later. |
| Look and feel | Template v8 (`docs/02-design-spec.md`). Dark first. Usable with gloves. |
| Architecture | Modular: a new source serves every layer that needs that kind of data without rework. Fast. |
| Units | Metric by default, with a units setting. |

## Layer plan

| Stage | Layers |
| --- | --- |
| Build now (designed) | Precipitation (with totals and the rain/snow line), Temperature (true, feels-like, by elevation), Wind (speed, gusts, direction) |
| Core, awaiting design | Cloud, Radar |
| Later | Avalanche, Air quality (including fires), Sun, Marine |
| Eventually | Forecast: headline information pulled from the other layers |
| Overlays, later | Stations, weather and road cameras, lines pulled from layers (freezing line, snow line) |

Alerts are not a layer. They open from the alert badge.

## Technology

Kaden left the technology to Claude. These are research recommendations he has not overruled; details are in `docs/03-architecture.md`.

- TypeScript web app on MapLibre GL JS. First install as an iPhone home-screen web app; Capacitor wrapper later.
- Base map and terrain from Protomaps and Mapterhorn PMTiles; contours drawn on the device.
- Open-Meteo as the main forecast source; ECCC services for radar, alerts and more.
- Models: HRDPS to 48 h, RDPS to 84 h, then ECMWF IFS, GDPS and GFS. Ensembles (ECMWF ENS, GEPS) later for probability.
- Sources pass through adapters into five standard shapes. Layers never see a provider.
- Live and saved data share one store and one read path.

## How the build runs

Claude Code on the web builds it in milestones and stops after each one for Kaden to check (`docs/04-milestones.md`). Settled decisions, defaults taken on Kaden's behalf, and open items are in `docs/06-decisions-and-open-items.md`.
