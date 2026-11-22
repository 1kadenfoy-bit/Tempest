# Section brief: Data

Where the numbers come from:
- the forecast models and their runs;
- new data sources, turned into the app's standard shapes;
- caching and the one read path;
- saved areas for use without signal;
- recorded weather for the other sections and the tests.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the live view, the checks and the handoff.

## What you own

The exact list is `data` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| Runs, the time line joining the models, the pin's series | `app/data/forecast.ts`, `app/data/profile-source.ts` |
| Fetching politely and keeping answers | `app/data/api-cache.ts`, `kept-fetch.ts`, `connection.ts` |
| Open-Meteo map files and point API, ECCC precipitation analysis | `adapters/openmeteo-maps/`, `adapters/openmeteo-api/`, `adapters/eccc-geomet/hrdpa*`, `render/openmeteo-starter/` |
| Store, time, grid requests | `core/store/`, `core/time/`, `core/geo/grid-request*` |
| Saved areas and the region file | `app/offline/`, `core/offline/`, `core/region-file/`, `public/sw.js` |
| Recorded weather | `app/data/recorded.ts`, `public/recorded-sw.js`, `tools/record-weather.mjs`, `recorded/` |
| Browser tests | `e2e/offline.spec.ts`, `e2e/models.spec.ts` |
| A data viewer page (yours to build) | `data-viewer.html`, `app/data-viewer/` |

## Showing work without the app

Data work often has nothing to see in the app yet. Show Kaden:
- tables of what a source returns, in the chat;
- the source's output on a bare data viewer page: a plain map with the
  features, plus a table. This is your first task when he asks for one.

Drawing a new source nicely in the app is another section's job:
- Weather on the map for weather;
- Maps for places and routes;
- Weather on the map for avalanche, air quality and fire bulletins;
- Interface for weather alerts.

They can start from your recorded sample before your work is integrated.

## How a new source joins

Example: plane routes.
1. **Check it first:** terms, licence, attribution, rate limits, whether it
   may be saved offline, CORS for a browser.
   - Record what you found in the handoff.
   - The lead copies it into `docs/05-data-sources.md`.
2. **New server:** Kaden must allow its host in the environment's network
   settings. Name the host.
3. **An adapter** in `adapters/<source>/` turns it into one of the five
   standard shapes (`docs/03-architecture.md`):
   - it carries the source's licence and attribution as metadata (the credits
     screen is built from it);
   - it comes with recorded answers in `fixtures/` and unit tests.
4. **New variable names** go in `core/vocabulary.ts` (the lead approves),
   with one name, one unit and one meaning.

## Recorded weather

You keep the recorded sets.
- `npm run weather:record -- --set=<name> --description="..."` records one:
  - add `--add` to add spots or layers to an existing set;
  - add `--spots=` and `--layers=` to choose what to record.
- Record interesting days when they come: a storm, a big wind, deep cold. Tell
  Kaden so the other sections can use them.
- **When the Open-Meteo daily limit is spent** (shared by every chat), the
  recorder reads the map files instead. It still works, but it is slower and
  bigger.
- **Size:** keep sets to tens of MB. A set is stored in the repository for
  good, so replace sets rarely.

## Rules for this section

- **One read path for live and saved data.** Offline is not a separate mode.
- **Respect each source's limits and terms.** Cache politely, and never fetch
  in the background.
- **Stale data is shown with its age, never hidden.**
- **Layers never see a provider.** They ask by variable name.
