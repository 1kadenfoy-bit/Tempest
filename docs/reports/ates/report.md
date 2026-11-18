# Terrain complexity (ATES): report

Nov 17, 2026. You asked for "a button in the avalanche layer that shows the terrain complexity", like Avalanche Canada's Trip Planner. There is no v8 design for it, so it is built from parts the app already has: a round thumb button, a switch in the layer settings, a second legend line and the grow panels.

Avalanche Canada's terrain ratings are shown exactly as published: their zones, colours, words and icons. The app never rates terrain itself.

## What to try

1. **Pick Avalanche.** A round button with a small mountain appears above the location button, only while the Avalanche layer is on.
2. **Tap it** to turn terrain ratings on. It turns white. The same switch is in Layer settings as "Terrain complexity (ATES)".
3. **Zoomed out:** each rated area shows as a white outline, and the legend says "Zoom in for zones". Tap inside an outline for the area's name and its zone counts; "Zoom in to see the zones" flies there.
4. **Zoomed in (about zoom 10):** the app fetches that area's file from Avalanche Canada and draws:
   - zones: **Simple green, Challenging blue, Complex black**, half see-through as in Avalanche Canada's files;
   - access routes in yellow, avalanche paths in red, and the area's edge in white;
   - Avalanche Canada's own icons: parking, cabin, destination (snowflake), decision point (orange warning triangle), and dots for others such as First Aid.
5. **Tap a zone** for its class ("Complex (3)") and what that means. **Tap a decision point** for its "Concern" and "Managing risk" lists. Every panel links to the Trip Planner on avalanche.ca.
6. **The danger colours fade** as you zoom in with terrain ratings on; region outlines keep their danger colour.
7. **Without signal:** an area you have opened once is kept on the phone for 30 days.
8. **Light theme and 3D terrain** both work.

## Where the data comes from

- **The source:** the Trip Planner's own map comes from a private account no other app can use. Avalanche Canada also serves one file per area (KMZ, the Google Earth format) from its public services, open to any web page, and Tempest reads those.
- **The list of areas:** there is no published list, so a small tool visits the area numbers once a second and writes a list into the app. It found 175 areas, including:
  - Sea to Sky: Brandywine, Elfin Lake, Garibaldi Lake, Spearhead, Brohm Ridge, Sea To Sky Gondola, Tetrahedron;
  - North Shore: Cypress, Grouse-Lynn, Mt. Seymour.
- **Keeping it current:** the list needs refreshing by hand about once a month in winter; new areas appear after a refresh (`docs/05-data-sources.md`).
- **Polite use:** files are fetched only when you zoom into an area, at most three per view, one at a time. Most are under 150 kB.

## Screenshots (390 × 844)

All are Avalanche Canada's real files, saved Nov 17.

| What | Files |
| --- | --- |
| Sea to Sky | `sea-to-sky-outlines.png`, `brandywine.png`, `elfin-lakes.png` |
| Longworth (east of Prince George) | `outlines.png`, `area.png`, `zones.png`, `zone-panel.png`, `decision-point.png` |
| Settings | `settings.png` |
| Light theme in 3D | `light-3d.png` |

## Questions

1. Is the round button in the right place, or should it live only in settings?
2. Is zoom 10 the right point for zones to appear?
3. Complex zones are black at half strength, as published, which reads less strongly on the dark map than on the Trip Planner's light one. Keep as published?
4. No file has "Non-avalanche" or "Extreme" zones today. Their colours are placeholders until Avalanche Canada publishes some.
