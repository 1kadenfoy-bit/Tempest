# Kaden's rules: Maps

How Kaden wants this section to behave and look, in his words where possible.
The Maps chat keeps this list up to date (`docs/sections/README.md`). One rule per
line, numbered, with the date. When he changes his mind, the rule is edited and
the old wording moves to "Changed".

## Views

1. The map opens in 3D by default. (Nov 20, 2026)

## Colours and look

2. Dark mode must not be too dark; it should be easy to see things on it. (Nov 20, 2026)
3. The ground is coloured by a short list of terrain types that matter for outdoor conditions: forest, treeline, alpine, glacier, grass and fields (farmland counts as grass), wetland, sand, and urban (everything built by people is one colour). The BC treeline and alpine zones are the official ones. A city must never look like forest. The list is in docs/reports/maps-terrain/terrain-colours.md. (Nov 20, 2026)
4. The three zones (forest, treeline, alpine) look clearly distinct from each other. The aesthetic is "almost cartoonish". (Nov 20, 2026)

7. Never assume a terrain type. Terrain colours come only from real data, and where there is no data the ground stays plain. (Nov 20, 2026)
8. The three zones come from the BC government's biogeoclimatic (BEC) map: alpine, parkland (the treeline mix) and forest, as issued. (Nov 20, 2026)
10. Natural terrain types (forest, treeline, alpine and the rest) blend smoothly into each other along their edges, with rounded, not sharp, corners, so the map looks natural; urban areas stay crisp. (Nov 20, 2026)
14. Lakes, rivers and the sea are a clear blue, not black. (Nov 20, 2026)
15. Glaciers come from the BC government's outlines, with rounded edges, not from OpenStreetMap. (Nov 20, 2026)
16. Roads are drawn a bit narrower than Protomaps draws them (about 30% less). (Nov 21, 2026)
17. Water gets a sun glint and sheen like the video (Geographical Adventures). No glare or shine ever washes the map out or makes labels or the map hard to read; the shine is on water only. (Nov 22, 2026)
18. Sun and shadows must never wash the map out, on the light theme or the dark one: at night the map takes an even, bluish dusk with its colours kept. (Nov 21, 2026)
19. The map looks like Sebastian Lague's game Geographical Adventures, on our real BC data: soft sun, warm-to-cool tinted shadows (never grey), contrast, relief that still shows on flat-lit ground, a hazy sky and fading distance in 3D, and glinting water. Both Terrain and Satellite get it; Terrain keeps its terrain-type colours, Satellite uses the picture. The sky is the same for both. (Nov 22, 2026)
20. The sun and shadows button sets the map to the time of day on the scrubber. At night (say 3 am) the map is dark but still readable. By day it looks as it does now, plus the mountains' cast shadows, in the direction the sun is. (Nov 22, 2026)
21. There is a temporary tuning panel on the map page (a Tune button) with: overlays off, weather off, satellite on, sun and shadows, and sliders for haze, lighting and bloom, so Kaden can play with the design. It goes away once the look is settled. (Nov 22, 2026)

## The Map panel

11. The Map panel has three parts. View: a 2D | 3D switch. Ground: Terrain or Satellite (one at a time), plus a sun and shadows toggle. Overlays (toggles): trails, huts and campsites; peaks; contour lines; small roads; ski resorts; boundaries; weather stations; rain/snow line; freezing line. Satellite appears only when it works. The buttons and what they call are in docs/reports/maps-settings/panel-spec.md. (Nov 22, 2026)
12. Day and night with shadows: the sun lights the terrain and the map darkens at night, following the time scrubber. Cast shadows are for later. (Nov 20, 2026)
13. The rain/snow line and freezing line hold still when zooming, like contour lines (a job for the Weather chat). (Nov 20, 2026)

## Labels and map features

5. Peak names show like they used to, but a bit further zoomed out, with the peak's elevation under the name. (Nov 20, 2026)
6. Trails and huts are shown on the map, with their names. (Nov 20, 2026)
9. Tapping near a named peak, hut or trail puts the pin on that named place and uses its name. (Nov 20, 2026)

## Changed

- Rule 11 was: "The Map panel has three parts. View: a 2D | 3D switch. Ground: Plain, Shaded terrain or Satellite (one at a time), plus a sun and shadows toggle. Overlays (toggles): trails, huts and campsites; peaks; contour lines; small roads; ski resorts; boundaries; weather stations; rain/snow line; freezing line. Satellite appears only when it works. The buttons and what they call are in docs/reports/maps-settings/panel-spec.md." until Nov 22, 2026 (Plain is gone: Ground is Terrain or Satellite).
- Rule 17 was: "The map looks matte, with no shine or reflective look, including with sun and shadows on. Water may have a slight sheen." until Nov 22, 2026 (the game's water glint is wanted; the earlier glare is what Kaden did not want).
- Rule 10 was: "Natural terrain types blend softly into each other along their edges so the map looks natural; urban areas stay crisp." until Nov 20, 2026 (now also rounded corners, and wider blending).
- Rule 3 was: "The ground is coloured by terrain type: forest in green, alpine \"rocky\", the treeline a mix of the two, and every other type the map software knows (cities, farmland, glaciers, sand and so on) has its own colour. A city must never look like forest. The full list is in docs/reports/maps-terrain/terrain-colours.md." until Nov 20, 2026 (replaced by a short list; farmland is grass and everything built is urban).
- Rule 3 was: "The ground is shaded by terrain type: forest in green, alpine \"rocky\", and the treeline a mix of the two." until Nov 20, 2026 (now every type is coloured).
- Rule 5 was: "Peak names show when zoomed out further than before, and always with the peak's elevation." until Nov 20, 2026 (now: like they used to, a bit further out, elevation under the name).
- Rule 6 was: "Trails and huts are shown on the map." until Nov 20, 2026 (now with their names).
