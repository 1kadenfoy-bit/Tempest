# Plan: the new "Save for offline" flow

Nov 22, 2026 · decided by the lead at Kaden's request. Every chat on this work
reads this file. The types they hand each other are in
`core/offline/save-request.ts`.

## What Kaden wants

1. In app settings, "Save data" closes settings and returns to the home
   screen (the map with the weather card).
2. A "Save for offline" card slides up from the bottom. It looks and acts like
   the weather card with the scrubber:
   - **At first:** it shows only a little, so most of the screen is map. It
     shows the drawn area's size and the space its map needs.
   - **Pushed down:** like the weather card, to see more map.
   - **Pulled up:**
     - The bottom part of the scrubber: the date, and the model's end time for
       the chosen layer.
     - The white frame on the scrubber stretches over the time span to save.
       Both ends can be moved, so past data can be included.
     - Below it, every layer, each with:
       - a tick;
       - its model choice (a model, or Auto: each hour from the best model for
         it);
       - how old its data is;
       - the space it will take.
     - At the bottom, "Save data" with the total space.
3. **There is no starting area.** The user traces a closed shape on the map
   with a finger. It can be any shape.
4. **Layers whose data stops early** (radar, avalanche, air quality) can still
   be ticked. They save what exists. Each shows its age; the user judges.
   Offline, the status line says "offline" instead of a next-refresh time.
5. **After "Save data"** the app returns to the home screen. The Notification
   Centre (the bell) shows:
   - "Download started", with a progress bar if it takes a while;
   - a second notification when it is finished.
6. **Traced shapes:** the map pieces are cut to the outline. The weather covers
   the shape's bounding box, because weather comes in rectangles.

## Who builds what

| Chat | Builds | Files |
| --- | --- | --- |
| Maps | Drawing tool: one finger traces, two fingers pan and zoom; closes the shape on lift; smooths and simplifies; shows the outline; Redraw and Clear. Also which map pieces cover a shape. | `app/map/draw-shape.ts`, `core/geo/shape-tiles.ts` (pure, tested) |
| Data | The saving engine: estimate, save in the background with progress, saved list, delete. Auto picks each hour's model. Map pieces cut with Maps' `tilesForShape`. Removes the old save box, old list and leftover "saved data only" code once the new flow works. | `app/offline/**`, `core/offline/**` |
| Interface | The card, the scrubber's save mode (frame with two handles), layer rows, the "Save data" entry in settings, the saved-areas list in settings (via Data's calls), and the Notification Centre. | `app/shell/**`, `app/settings/**`, new `app/notify/**` |
| Safety | Weather alerts become one section of the Notification Centre, shown exactly as issued. The alert badge rules do not change. | `app/alerts/**` |
| Lead | This plan, `core/offline/save-request.ts`, `app/state.ts`, and combining. | |

## The calls between them

**Maps → Interface:**
- `startDrawing(map): { shape: Promise<SaveShape | null>; cancel(): void }`
  - `null` if cancelled. Drawing again replaces the shape.
- `showShape(map, shape | null)` draws the saved outline.
- `tilesForShape(shape, minZoom, maxZoom)` (pure) gives the base map tiles that
  touch the outline. Data calls it.

**Data → Interface:**
- `layerTimeRange(layer, model): LayerTimeRange`, for the scrubber's limits and
  each row's age.
- `estimateSave(req): Promise<SaveEstimate>`, called again as the shape, ticks,
  models or span change (debounced by the card).
- `startSave(req): SaveJob`. It runs on after the card closes.
- `listSaved()` and `deleteSaved(id)`, for the settings list.

**Notification Centre (Interface owns `app/notify/`):**
- One list:
  - `notify({ id, kind, text, progress?, time })`, where `kind` is
    `'download'` or `'info'`;
  - `updateNotification(id, patch)`;
  - `dismiss(id)`.
- The bell opens one panel:
  1. Weather alerts first. Safety renders that section through
     `renderAlertsSection(container)`, exactly as issued.
  2. Then the app's own notifications, newest first.
- The badge:
  - The alert badge keeps its current meaning: the alert count, or the warning
    triangle while an alert is in force.
  - Unread app notifications add a small dot.
- A save in progress shows a progress bar. A finished save's notification
  links to the saved area.

The lead wires `startSave` → `notify` (in `app/main.ts`, or a small module
it names), so Data never imports the shell and the shell never imports the
engine's internals.

## Order

1. Now, in parallel:
   - Maps: drawing tool and `tilesForShape`.
   - Data: engine with `estimateSave` and `startSave`, tested without the card,
     shown on the data viewer page.
   - Interface: the Notification Centre and the card, built against the types
     with stand-in data.
   - Safety: the alerts section.
2. Each section hands off as usual.
3. The lead combines them and wires the calls.
4. Data removes the old save box and list, and the lead removes their wiring
   from `app/main.ts`.

## Decisions taken without asking Kaden (he can change them)

- **One bell, alerts first.** Alerts are listed first and keep their badge;
  app notifications only add a dot.
- **Drawing gestures:** one finger draws; two fingers move the map while
  drawing.
- **Map pieces** are kept where a tile touches the outline. The outline is
  drawn on the map, and the map is greyed outside it.
