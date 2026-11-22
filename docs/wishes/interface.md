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

8. (Nov 20) **Search** is its own map button above locate. The **map layers button stays**, with a panel of three parts: **View** (2D | 3D switch), **Ground** (big tiles, one at a time: Terrain | Satellite; Plain is gone since Nov 22) and **Overlays** (toggle tiles: Trails, huts and campsites; Peaks; Contour lines; Small roads; Ski resorts; Park boundaries; Regional boundaries; Municipal boundaries; Weather stations; Rain/snow line; Freezing line). Overlay tiles whose data is not built yet are shown dimmed and marked "Soon" (Kaden's choice, an exception to "a switch appears only when it works"). Satellite is shown only once the map has its picture loaded.
8a. (Nov 20) Map panel details (from the Maps chat, passed on by Kaden): a **Sync map day/night time** toggle (it was called Sun and shadows) sits with the Ground tiles: the map's sun and shadows follow the time scrubber. It works on Terrain and on Satellite. **3D buildings** is a small option under the View switch, greyed out in 2D. The panel remembers its choices. Nothing in the panel appears or disappears when a button is pressed.

## Pin

9. (Nov 20, tightened Nov 21) The pin shows only, in this order: **location name · layer data value · elevation**. Where there is no actual place name, the location is what the ground is ("Alpine", "Glacier", "Forest", "Grassland", "Treeline", "Wetland", "Beach", "Urban"), as the map draws it. No "You" label, no extra notes (feels-like, snow line and so on). While the data is still loading it shows just a small spinning wheel: no "…" placeholders or partial text.

## App settings window

10. (Nov 20) **Credits** sit in a collapsed section at the bottom of settings.
11. (Nov 20) **Saved data** is just a button to save data, with what is currently saved listed below it. Swipe a saved item left to delete it (like mail and messages).

## Map panel

13. (Nov 20) **Trail names** and **peak heights** (names and elevations on the map) are always on. They are not choices in the map panel.
12. (Nov 20) The **Offline** section is not in the map panel. Saving and saved areas live in app settings only.

## Layer menu

14. (Nov 21) Each layer tile in the layer menu has its **icon on the left and its name on the right**. No colour bars under the name. Approved icons: Precipitation (cloud with drops), Temperature (thermometer), Wind (curling lines), Radar (rings with a sweep), Avalanche (mountain with tumbling snow), Air quality (haze lines with particles).

## Opening and closing windows

15. (Nov 21) When a button or selector opens a window, **the button's shape turns continuously into the window's shape** (box and corner radius together), starting exactly over the button, and shrinks back onto it on close; no pop-up, no jump. Every window works the same way, the notification button included. The layer window grows from the whole top bar bar the layer button sits in (so it includes the source button's area), not just the layer label. 0.4 s to open (closing takes 80% of that). The speed slider is gone.

## Search

16. (Nov 21) The search window sits **at the top of the screen**: the round search button turns into the search bar and moves to the top, with the same button-to-window animation. Searching leaves the weather window (the sheet) alone: it does not move when the keyboard comes up.

## App settings (more)

17. (Nov 22) **"Saved data only" is gone** from app settings. Keep the Save data button and the list of what is saved below it.

## Save for offline (planned, nothing built yet)

18. (Nov 22) **Save data** in settings closes settings and returns to the Home screen (the map with the weather card). A "Save for offline" card slides up from the bottom and looks and acts like the weather card: it starts partly showing (selected area size and space for the map), most of the screen is map, and it can be pushed down to see the map.
19. (Nov 22) **No starting area.** The user traces a closed shape on the map (any shape, not only a rectangle or circle). Map pieces are cut to the outline; the weather covers the shape's bounding box.
20. (Nov 22) Pulling the card up shows the bottom part of the scrubber (the date and the model's end time for the selected layer). The **white frame** is stretched or squeezed over the time to save, **both ends adjustable** (past data can be included).
21. (Nov 22) Below the scrubber is a **list of every layer**. A selected layer is saved with the map piece. Beside each layer is its **model choice: a model, or Auto** (Auto saves only the relevant times for each model, the best one for each time). Each layer shows its **size to save**. At the bottom is the final **Save data** button with the **total space**.
22. (Nov 22) Every layer can be selected. A layer that cannot cover the window (radar, avalanche, air quality) saves as much as exists, up to the end of its data. Each layer shows how old its data is, and the user judges. Offline, the status line says "offline", not a next-refresh time.
23. (Nov 22) After pressing Save, the user is back on the Home screen. The **Notification Centre** gets "Download started" (with a progress bar if it takes time; just the notification if quick) and another notification when it is **finished**.

## Save card and panels (Nov 22, round two)

24. (Nov 22) While tracing the area, **two fingers move and zoom the map**; one finger draws.
25. (Nov 22) The Save for offline card **starts partly up from the bottom**, like the weather card (not all the way down): it shows the title, the area and map size, the time strip, and a **Save data button at the bottom**. The button is there once the area is drawn and layers chosen. **Redraw removes the current tracing**.
26. (Nov 22) The map panel's Ground has **Terrain and Satellite** (both always offered; Satellite waits for its picture to load). The **phone tests button and feature are gone**.
27. (Nov 22) The map panel has a **3D ANIMATIONS** section: Clouds, Wind, Saved data wall (a wall that forms around the saved area, like the Great Wall of China), Water (waves and moving water), Trees, and **Sync map day/night time** (moved here). The unbuilt ones show dimmed with "Soon".
28. (Nov 22) The settings window's buttons have **icons**.

## Changed

- Rule 8: Ground had three tiles, Plain | Shaded terrain | Satellite (Satellite dimmed "Soon" until it worked), and rule 8a greyed the sun toggle out on Plain, until Nov 22.
- Rule 9 showed nothing at all while loading, for a few hours on Nov 21, before the spinning wheel.
- Rule 9 also showed the layer's own extra notes ("feels −6", "0 °C at 1,150 m", "snow line") and "…" while loading, until Nov 21.
- Rule 4 said Auto only appears where a layer has several sources, until Nov 21.
- Rule 8: Boundaries was one tile (with Parks, Provincial and regional, Municipal options in a row that opened under it) until Nov 20; it is now three tiles. Rule 8a also had option rows for trail names, peak heights and boundary kinds that opened under their tiles (until Nov 20).
- Rule 8 was: "Search sits where the map layers button is. The map layers' settings move into the settings window." (Nov 20, until later the same day)
- Rule 9 was: "The pin on the user's location shows just the layer's data (temperature, wind speed and so on) and the elevation. No 'You' label." (Nov 20, until later the same day)
