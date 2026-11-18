# Forecast summary window

A window that shows every chosen layer's chart for one spot, stacked, on one shared time line.

## What to try
1. Press and hold on the map for half a second. The pin jumps there, as a tap would move it, and the window grows out of it. On a computer, a right click does the same.
2. You see three strips: Precipitation, Temperature, Wind. Each has the layer's name, its value at the time shown (for example "2 °C feels 2"), its summary of the window (the same words as the sheet), and its chart.
3. Drag any strip sideways. All strips move together under the white needle and the time at the top changes. Close the window: the map and sheet are at that same hour.
4. Tap 12 h / 24 h / 48 h / 3 d / 7 d to change how much time the strips cover. It is the same setting as the sheet's window button, so the sheet changes too.
5. Tap Now to go back to the current hour.
6. Tap the gear to choose the layers. Tick Avalanche, untick Wind, close the settings: you are back in the window with the new strips. Reload: still your choice.
7. A normal tap still only moves the pin. Dragging, pinching or two fingers never open the window.
8. Pull the sheet up: at the foot of the details, the dashed "coming later" card is now a button, "Forecast summary for this point", that opens the same window.

## Pictures (390 × 844)

| File | What it shows |
| --- | --- |
| `01-summary-dark.png` | Opened with press-and-hold, the three default strips |
| `02-summary-moved.png` | After dragging a strip a day ahead; every strip and the time moved together |
| `03-summary-settings.png` | The gear: which layers have a strip |
| `04-summary-with-avalanche.png` | Wind off, Avalanche on |
| `05-summary-light-imperial.png` | Opened from the details, light theme, imperial units |

## Choices made
- **No v8 design exists for this window.** It is the plainest version built from parts the app already has:
  - the grow panel;
  - the sheet's time line and Now button;
  - the window panel's segmented buttons;
  - the sheet's chart frame (needle, now line, hatched past);
  - the sheet's window summary;
  - the save panel's tick rows;
  - the details footer's lines.

  Nothing new was drawn.
- **Each strip is the layer's own chart and summary,** asked for through the layer template. A new layer (air quality is coming) appears in the settings list, switched off, with no change to the window.
- **Radar is not offered.** It has only the last 3 hours, in 6-minute frames, and reads its value at the pin one frame at a time while it is the map layer. It cannot share a 48-hour forecast time line in a useful way. The settings say so.
- **Avalanche is offered, off by default.** Each day's danger by band, as issued, with the issue time; the footer gives the issue age.
- **One time cursor:** the window has no clock of its own. If radar is the map layer, time only moves through radar's last 3 hours, and the window says so at the top.
- **Data:** the window asks once per model for everything its strips need, not once per layer.
  - The first two days are the same request the sheet already made, so they come from memory or the phone.
  - It loads only while open, through the same path as the sheet, so saved areas work without signal.
- **Plain words on each strip while waiting:**
  - "Loading the pin's forecast…"
  - "The forecast service is busy · trying again shortly"
  - "The pin is outside the saved areas"
  - "Wind is not saved for this area"
  - "Wind still coming · the forecast service is slow or busy"

  The footer names the model and run with its age. A run over 12 hours old turns the warning colour.
- **Press-and-hold:**
  - waits half a second and allows a little finger drift;
  - is cancelled by a second finger, a pan, a zoom or a tilt;
  - leaves presses on stations, report pins and other markers to them;
  - does nothing while choosing an area to save.

  The lift after a hold is not a tap, so an avalanche region or terrain panel does not also open.
- **The window grows from the pin** and keeps a pin icon in its header, the way panels keep the icon of what they grew from.
- **Name:** the design spec says "full forecast window". I titled it "Forecast summary", your word this time.

## Not done
- No Play button in the window (Now only).
- The model hand-over marks are not drawn on the strips.
- Past about 3½ days, with temperature or wind on the map, the strips read GDPS's hourly run rather than its 3-hourly height-profile run, so they may differ slightly from the sheet.
- No-signal use was not tested in the browser for this window. It uses the same reading path the offline tests cover.

## Questions for Kaden
1. "Forecast summary" or "Full forecast" as the title?
2. With radar on the map, should opening the window move time back to the forecast, or is the note enough?
3. Do you want a Play button and the model hand-over marks in the window?
4. Is "Forecast summary for this point" right for the details button?
