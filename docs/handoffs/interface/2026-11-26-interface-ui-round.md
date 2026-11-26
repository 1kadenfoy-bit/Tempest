# Interface: the Nov 19–26 round (map panel, save card, Notification Centre, animations, pin, status line)

Nov 26 · branch `claude/tempest-interface` · ready to integrate

**Lead: read "Keep these" first.** Kaden iterated on all of this by hand on his phone. None of it should be dropped or restyled in a merge. His numbered rules are in `docs/wishes/interface.md` (rules 1–32); where a conflict shows up, that file wins.

## Keep these (the features added this round)

1. **Top bar.** Status line = data age and next update only ("2 h old · next in 40 min", or "offline" with the age; no run numbers). Source button always shown, with **Auto** as its first choice (best model for each time, plus every model with good data here). Settings is a gear at the top right. Search is its own button, and its window opens at the top of the screen.
2. **Pin readout.** "Place name · layer value · elevation". When there is no real place name it shows the terrain word instead (`app/shell/pin-terrain.ts`).
3. **Grow panels.** Every window grows out of its button (real box and corner radius animated, 0.4 s) and shrinks back. The layer button's window grows from the whole top-bar block. The map layers button always opens its panel anchored to the bottom (`data-panel-anchor="bottom"`), so it behaves the same whatever state the weather card is in. Panels scroll to the bottom (`.panel-body`, `100dvh`-capped).
4. **Map panel** (`app/shell/map-panel.ts`): View 2D | 3D; Ground = Terrain | Satellite (Satellite shows "Loading…" until `satelliteReady()`); Overlays (11 tiles, each with its own icon); **3D ANIMATIONS** section (Sync map day/night time, 3D buildings, Clouds, Wind, Saved data wall, Water, Trees). No "Soon" labels. Trail names and peak heights are always on and are not shown as choices. No offline group and no phone-tests button.
5. **Feature switches** (`app/shell/feature-switches.ts`, new, Interface's): `features.get(id)` / `features.onChange(cb)`, ids `snowLine, freezingLine` (Weather), `clouds, wind, water, savedDataWall, trees` (Effects). Remembered in `prefs.features`. The buttons only store on/off; **Weather and Effects chats have been messaged** and own the drawing. Please keep this file and the tiles when combining.
6. **Save-a-map-area flow** (Settings → Save data → `openSaveCard`, `app/shell/save-card.ts`, `save-math.ts`): draw a shape with one finger (two fingers pan and zoom), card starts partly up, time frame with draggable handles, a row per layer with its model and size, Redraw clears the trace, Save button fixed at the bottom. **It runs on stand-ins** in `app/shell/save-stubs.ts` (`startDrawing`, `showShape`, `layerTimeRange`, `estimateSave`, `startSave`). The lead swaps those for Maps' drawing and Data's engine (`docs/plans/offline-save.md`, types in `core/offline/save-request.ts`).
7. **Notification Centre** (`app/notify/`): the bell button opens one window with the ECCC alerts section (`renderAlertsSection` in `app/alerts/alerts.ts`, shown exactly as issued) and a list of notifications with progress bars (`notify`, `updateNotification`, `dismiss`, `unreadCount`). Saves report their progress there (`track-save.ts`).
8. **Settings** (`app/settings/`): Save data button and swipe-left-to-delete list, units, theme, credits folded away, icons on every button.
9. **Layer menu**: each weather layer's icon sits in a circle filled with the layer's own colours (precipitation and radar = rain ramp, temperature, wind; avalanche and air quality neutral until Kaden picks colours). The gradients are CSS variables `--layer-<id>` generated in `app/theme/tokens.ts` from `design/tokens.json`.
10. **Thumb buttons** (map layers, locate, search) ride with the weather card while it is dragged, and fade near full height (`follow()` in `app/shell/sheet.ts`, `body[data-sheet-dragging]`).
11. **Keyboard**: the sheet keeps its height when the phone keyboard opens (`stableHeight` in `sheet.ts`).

## What to try after it is integrated
1. Pull the weather card to its middle state, press map layers: the panel opens from the bottom and scrolls all the way down to 3D ANIMATIONS.
2. Drag the weather card slowly: the three round buttons follow your finger.
3. Open the layer menu: coloured circles on Precipitation, Temperature, Wind and Radar.
4. Settings → Save data: draw a shape, move the time frame, press Save; the bell shows progress. (Stand-ins until the real engine is wired.)
5. Turn on Rain/snow line or Freezing line: the button stays on; the line appears once Weather has hooked in.

## Files
- **Own files changed:** `app/shell/*` (new: `feature-switches.ts`, `save-card.ts`, `save-math.ts` + test, `save-stubs.ts`, `pin-terrain.ts`; changed: `panel.ts`, `map-panel.ts`, `top-bar.ts`, `sheet.ts`, `shell.css`, `icons.ts`, `layer-menu.ts`, `model-menu.ts`, `pin.ts`, `prefs.ts`), `app/settings/*`, `app/notify/*` (new), `app/alerts/alerts.ts`, `app/theme/tokens.ts`, `index.html`, `e2e/shell|settings|alerts.spec.ts`, `e2e/shell.spec.ts-snapshots/shell-map-panel-linux.png` (refreshed on purpose: "Soon" labels gone, new icons, panel at the bottom), `docs/wishes/interface.md`.
- **Shared files changed:** none (`app/main.ts` and `app/state.ts` untouched).
- **Maps' files that appear in this branch's diff, not mine:** `app/map/*`, `public/zones/*`, `tools/*`, and Maps' reports. They arrived through a merge of Maps' branch (`9f0942d`) which my map panel needs (`satelliteReady()`, `mapSettings` with ground/boundaries/sun). That merge is an older snapshot; Maps' branch has 6 newer commits. **Integrate Maps first, then merge `main` into this branch and the diff is clean.** `npm run check:section -- interface --area` fails today only because of these files.
- **Left for others:** the old "Saved data only" code and Data's old save box (Data); `spike.html` and `app/spike/**` (phone-test page) to delete (lead).

## Connection points
- **Used:** `mapSettings` and `satelliteReady()` (Maps); the layers' `LayerSlots`; the five-shape store through existing readouts.
- **Added for others:** `features` switches (Weather, Effects); notifications API (`notify`, `updateNotification`, `dismiss`) for any section that reports progress, such as Data's save engine.
- **Needs from other sections:**
  - Lead: wire the save card to Maps' drawing and Data's engine; replace `save-stubs.ts`.
  - Weather: draw the lines from `features` (existing `app/map/freezing-line.ts` kinds `0c` and `wetbulb`).
  - Effects: draw clouds, wind, water, saved data wall, trees from `features`. Water (`app/map/water.ts`) is Maps' today; Kaden decides who owns trees.
  - Kaden: colours for Avalanche and Air quality circles (no token ramp exists).

## Checks
`npm run check:section -- interface`: stops at the area check for the reason above. The rest was run by hand: typecheck and lint pass; unit tests 325 of 325 pass; the shell, settings, details and alerts browser specs pass on recorded weather (25 of 29 in the run). The 4 failures are all in `e2e/summary.spec.ts`, which runs on live weather: Open-Meteo answered 429 (free daily limit used up, shared by all chats), so the strips never loaded. I did not touch the summary window this round; re-run that spec when the limit resets. Tests added: notification store, save math, save card flow, credits fold, map panel (Terrain name, contour persistence, no phone tests button), Notification Centre dialog name.

## Kaden's rules added or changed
Rules 8, 20–32 in `docs/wishes/interface.md` (map panel layout, grow animation, save flow, notification centre, no "Soon", bottom-anchored map panel, thumbs follow the card, layer icon circles). Older wording is under "Changed".

## Decisions made, and anything unsure
- The scroll problem Kaden saw on his iPhone could not be reproduced in Chromium. Two causes were fixed (panel height past the visible screen when the card was in its middle state; touch-action). Check once on the phone.
- Thumb-follow was tested with a mouse; confirm with a real touch drag.
- Neutral circles for Avalanche and Air quality: no new colours added (tokens are Kaden's).

## Data, sources and terms
None added.

## Not done yet
Real save engine and drawing (lead wiring); Weather and Effects hooking into `features`; colours for two layer circles.
