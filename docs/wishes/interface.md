# Kaden's rules: Interface

How Kaden wants this section to behave and look, in his words where possible.
The Interface chat keeps this list up to date (`docs/sections/README.md`). One rule per
line, numbered, with the date. When he changes his mind, the rule is edited and
the old wording moves to "Changed".

## Top bar

1. (Nov 20) The warning icon is the **Notification Centre**. It shows a notification (bell) icon at rest. While a warning is in force it changes to the warning icon; once the warning has passed it goes back to the bell.
2. (Nov 20) The **layer name** stays at the top and describes the layer it is on. Below it: how old the data is, and when the next update should arrive. The run number is dropped. Layers we can refresh whenever show when the next refresh will happen.
3. (Nov 20) The **source button** (right of the layer name) is always shown, even with only one source. It lists the sources that can be used for the layer.
4. (Nov 20, widened Nov 21) The source list **always has Auto** as its first choice, even for layers with one source today. Auto works two ways: (1) it picks the best model for each time (high resolution first, lower resolution once the high resolution ones stop predicting); (2) it uses every source that has good data for the area, so two avalanche forecasts that cover different regions would both show.
5. (Nov 20) Where it makes sense to combine sources, the list lets him choose one, neither or both (for example a Canadian and an American avalanche source).
6. (Nov 20) The button at the top right is the **app settings** button, drawn as a **gear**.
7. (Nov 20) The **status line** gives just the age of the data and when the next update comes. The source button beside it says which data. With Auto, it shows the times of the model currently being viewed.
7a. (Nov 20) When offline and the models cannot be updated, the status line gives just how old the data is and "offline".

## Map buttons

8. (Nov 20) **Search** is its own map button above locate. The **map layers button stays**, with a panel of three parts: **View** (2D | 3D switch), **Ground** (three big tiles, one at a time: Plain | Shaded terrain | Satellite) and **Overlays** (toggle tiles: Trails, huts and campsites; Peaks; Contour lines; Small roads; Ski resorts; Park boundaries; Regional boundaries; Municipal boundaries; Weather stations; Rain/snow line; Freezing line). Tiles whose data is not built yet are shown dimmed and marked "Soon" (Kaden's choice, an exception to "a switch appears only when it works").
8a. (Nov 20) Map panel details (from the Maps chat, passed on by Kaden): a **Sun and shadows** toggle sits with the Ground tiles and is greyed out on Plain. **3D buildings** is a small option under the View switch, greyed out in 2D. The panel remembers its choices. Nothing in the panel appears or disappears when a button is pressed.

## Pin

9. (Nov 20, tightened Nov 21) The pin shows only, in this order: **location name · layer data value · elevation**. No "You" label, no extra notes (feels-like, snow line and so on). While the data is still loading it shows just a small spinning wheel: no "…" placeholders or partial text.

## App settings window

10. (Nov 20) **Credits** sit in a collapsed section at the bottom of settings.
11. (Nov 20) **Saved data** is just a button to save data, with what is currently saved listed below it. Swipe a saved item left to delete it (like mail and messages).

## Map panel

13. (Nov 20) **Trail names** and **peak heights** (names and elevations on the map) are always on. They are not choices in the map panel.
12. (Nov 20) The **Offline** section is not in the map panel. Saving and saved areas live in app settings only.

## Changed

- Rule 9 showed nothing at all while loading, for a few hours on Nov 21, before the spinning wheel.
- Rule 9 also showed the layer's own extra notes ("feels −6", "0 °C at 1,150 m", "snow line") and "…" while loading, until Nov 21.
- Rule 4 said Auto only appears where a layer has several sources, until Nov 21.
- Rule 8: Boundaries was one tile (with Parks, Provincial and regional, Municipal options in a row that opened under it) until Nov 20; it is now three tiles. Rule 8a also had option rows for trail names, peak heights and boundary kinds that opened under their tiles (until Nov 20).
- Rule 8 was: "Search sits where the map layers button is. The map layers' settings move into the settings window." (Nov 20, until later the same day)
- Rule 9 was: "The pin on the user's location shows just the layer's data (temperature, wind speed and so on) and the elevation. No 'You' label." (Nov 20, until later the same day)
