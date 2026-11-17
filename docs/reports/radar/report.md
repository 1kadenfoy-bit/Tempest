# Radar layer: report

Nov 17, 2026. Radar is a fourth layer in the layer menu, after Wind. There is no v8 design for it, so it is the plainest version built from the parts the app already has: the layer menu tile, the legend row, the readout, the scrubber, the detail cards and the layer settings panel. Nothing new was invented.

## What to try

1. Open the layer menu and pick **Radar**.
2. The map shows Environment Canada's radar (ECCC) in ECCC's own colours. By default it shows the **type** of precipitation: snow (blues), mixed (purples), rain (greens), freezing rain (pinks and red), hail (yellow), each light to heavy, left to right in the legend.
3. Areas the radars cannot reach are greyed out. In much of northern BC that is most of the map.
4. The time row shows the frame and how old it is ("Tue 8:12 AM · 11 min ago"). The chart shows the last 3 hours, one tick per frame (every 6 minutes). Drag it to go back through the frames.
5. Press **Play**: it loops the last hour, pausing briefly on the newest frame. **Now** goes back to the newest frame.
6. The pin's label says what the radar saw right at the pin for that frame: "Light rain", "Nothing seen", or "Outside radar range". It updates when you stop on a frame, not on every frame while playing.
7. Pull up the sheet: what was seen, how old the frames are, and a note that radar can miss mountain weather.
8. **Layer settings** (bottom of the sheet): Shown = Type, Rain rate (mm/h) or Snow rate (cm/h), and a switch for the grey veil beyond radar range.
9. Map panel → Save this area: Radar is listed greyed out with "Its source does not allow saving", as on the 08-SaveArea board.
10. Light theme and imperial units both work (the rates switch to in/h).

Screenshots (390 × 844):

- `radar.png`: the home screen with Radar, live ECCC radar (Rockies, near the Alberta border, where it was snowing or raining that morning).
- `radar-details.png`: the sheet pulled up, live.
- `radar-3d.png`: tilted with 3D terrain on, live: the radar lies on the terrain.
- `radar-light-rain.png`: light theme, imperial units, Rain rate, live.
- `radar-stubbed.png` and `radar-save.png`: from the automated test, with saved ECCC answers (the same radar picture repeated on every tile, so it looks blocky): the home screen with a "Light rain" readout, and the save panel with Radar greyed out.

## What I chose, and why

- **Type is the default.** For mountain days the most useful question is "rain or snow, and how hard". Rain rate and snow rate are one tap away in settings. ECCC computes both rates from the same radar echo, so they are estimates; the type product tells you which applies.
- **One time cursor.** While Radar is shown, the app's one cursor steps through the radar frames instead of the forecast hours. Switching back to another layer puts the cursor back on the forecast near the same time. No second slider.
- **The chart spans 3 hours and the window button is hidden** while Radar is shown, because radar only has 3 hours. A button only appears when it works.
- **The model button is hidden** for Radar: it is observed data, not a model.
- **The colours are ECCC's**, as ECCC draws them; the app does not recolour them (it lets 15% of the map show through). ECCC's own legend pictures are tall, black-on-white images that do not fit the legend row or the dark theme, so the app redraws the legend with ECCC's exact colours and class names. A test checks every colour against ECCC's legend pictures.
- **Polite to ECCC.** Only the frame on screen and the next two load; up to 12 frames are kept so a loop does not download again. ECCC's terms forbid bulk downloading, so radar is never saved.

## Not checked, or worth knowing

- **Grey shows radar range, not mountain shadows.** ECCC's coverage map is circles around each radar. A valley behind a ridge can sit inside a circle and still be blind. The details say so: "nothing seen" is not proof of dry weather.
- **The type at the pin.** ECCC's point answer for the type product returns the nearest precipitation it finds, which can be 20 km away. The app only uses it when it is right at the pin; otherwise it says what the rain-rate pixel says (seen or nothing seen).
- **Radar forecast (the next hour) is not shown.** ECCC has one, but I could not find its layer name. It could follow later.
- **Snow in the mountains.** Radar beams pass over low snow in deep valleys and are blocked by ridges. Check it against what you see on a real day.
- From this session, some ECCC requests were cut off by the session's network after 10 seconds; on a phone they go straight to ECCC. Worth watching whether the loop feels smooth on mobile data.
- The automated test uses saved ECCC answers, so it does not depend on whether it is raining.
