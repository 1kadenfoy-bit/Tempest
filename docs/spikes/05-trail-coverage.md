# Spike 5: trail and touring-route coverage

Nov 15, 2026. **Partly answered; not needed until routes are scheduled.**

## Question

How well does OpenStreetMap cover hiking routes, difficulty tags and ski-touring lines (`piste:type=skitour`) in BC?

## What I tried

- Overpass queries counting hiking route relations, paths, paths with `sac_scale`, named paths and ski-touring lines. **Not possible from here:** `overpass-api.de` is allowed, but the connection is cut two seconds in, every time.
- Instead, counted footpaths in the Sea to Sky base map file at zoom 14 (`tools`, ad hoc).

## Result

The Protomaps base map already carries the path network for the Sea to Sky box: **about 6,000 footpath pieces, 950 footways, 2,200 tracks, and 3,820 distinct named paths** (for example "Gambier Peak Trail", "Mount Killam Trail"). Counts are per tile piece, so long trails count more than once.

The base map drops the tags that matter for trip planning: `sac_scale` difficulty, trail visibility, hiking route relations and `piste:type=skitour`.

## Consequence

- Trails can be drawn from the base map we already download, at no extra size, as soon as a design asks for it.
- Difficulty and route relations need a separate OpenStreetMap extract, built once on a computer. Re-run the Overpass counts from a home connection when routes are scheduled.
- Routes and trails are not in the first build (decisions, section 2), so this does not block anything.
