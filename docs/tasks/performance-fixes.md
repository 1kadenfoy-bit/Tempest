# Tasks: the performance fixes

From the performance report (`docs/reports/performance/report.md`, "Fix
list"), Nov 27, 2026. One new chat per task (`docs/working.md`): paste the
starter prompt, then the task's lines. Tick a task off here in its own pull
request.

**The rule for all of them (Kaden, Nov 27):** speed only. Nothing may look or
behave differently. Any trade-off is offered to Kaden, never made.

## The starter prompt (paste first, in every new chat)

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task:
```

## The order, and what can run at the same time

The same area runs one task at a time: the tasks share files. Two chats at once
is fine across different lines of this table.

| Order | Maps | Weather on the map | Data | App start and timers (`app/main.ts`) | Effects |
| --- | --- | --- | --- | --- | --- |
| 1st | **1. The glow** (biggest gain) | 2. Rain or snow height | 6. No silent 90 s wait | | |
| 2nd | 3. Mountain shadows | 7. Retry a failed layer | 9. Read variables together | 8. Weather starts with the map | 13. Clouds' cost |
| 3rd | 4. One terrain-height reader | 10. Wind smoothing | 12. Installed app's first start | 5. Time slider draws what it has | |
| 4th | | | | 11. No redraws while untouched | |

Model: **Opus, high effort**, for 1 to 4 and 13 (work done off the main thread
or on the graphics chip; easy to get subtly wrong). **Sonnet** for the rest.

After 1 to 4, run the `?perf` tour on the iPhone again and compare with the
report.

## The tasks

Each line after the number is what to paste after the starter prompt.

- [ ] **1. The glow without copying the frame back** (Maps, Opus).
  Performance fix 1 in docs/reports/performance/report.md: make the same glow
  (app/map/tuner.ts) inside the map's own drawing on the graphics chip, with no
  copy of the frame back to the processor. Same look, the same strength (Maps
  rules 19, 21, 23), and no white pulse while panning. Compare screenshots at
  rest pixel by pixel, and `?perf` with and without `&off=bloom`, before and
  after.
- [ ] **2. Rain or snow at real height off the main thread** (Weather, Opus).
  Performance fix 2: run levelLine and its inputs in a worker, and skip it
  when nothing it reads changed. Same numbers: add a unit test comparing the
  worker's output with today's (decision "Rain or snow", Nov 16).
- [ ] **3. Mountain shadows off the main thread** (Maps, Opus).
  Performance fix 3: the shadow mask (app/map/shadows.ts, shadow-mask.ts)
  worked out in a worker, with the pixels handed over directly instead of
  through a PNG. Same mask, colour and opacity (Maps rules 18, 20, 23).
- [ ] **4. One terrain-height reader, in a worker** (Maps, Opus).
  Performance fix 4: read the heights under the view once, off the main
  thread, and share them among shadows, rain or snow, temperature and wind.
  Reuse the terrain tiles the map already downloaded where possible. Same
  heights.
- [ ] **5. The time slider draws each step it already has** (app start and
  timers, with Weather; Sonnet).
  Performance fix 5: when a step's weather is already in memory, draw it at
  once while dragging or playing. Keep the short wait only for steps that must
  be downloaded. Same steps; one time cursor.
- [ ] **6. Don't hold a map layer back silently** (Data, Sonnet).
  Performance fix 6: the map's requests no longer wait up to 90 s for the
  allowance (app/data/api-cache.ts, profile-source.ts). The map takes the
  map-file route at once (decision "Temperature data", M4); saving keeps the
  long wait. Stay under the free limits.
- [ ] **7. Try a failed weather picture again by itself** (Weather, Sonnet).
  Performance fix 7: a failed fill (updateFills) asks again with the same
  back-off the pin's forecast uses.
- [ ] **8. Start the weather while the map loads** (app start, with Data;
  Sonnet).
  Performance fix 8: ask for the newest runs, HRDPS's description, the decoder
  and the location at start, not after the map's first picture. Nothing is
  drawn before the map exists; one read path.
- [ ] **9. Read a weather file's variables together** (Data, Sonnet).
  Performance fix 9: readNativeBox reads them at the same time, like
  readBoxFast does for saving. Same numbers; keep the starter library behind
  render/.
- [ ] **10. Wind's ground smoothing once per view** (Weather, Sonnet).
  Performance fix 10: smoothGround (core/wind) once per view, in a worker or
  kept between steps. Same smoothing.
- [ ] **11. Nothing redrawn while untouched** (Interface and app start;
  Sonnet).
  Performance fix 11: the time chart and run age redraw only when what they
  show would change. Find the redraws seen once on the phone. The age still
  updates when it changes.
- [ ] **12. The installed app's first start fetches the map first** (Data,
  Sonnet).
  Performance fix 12: public/sw.js keeps every file as now, but fetches the
  test pages' files after the map and weather have loaded.
- [ ] **13. The clouds' cost** (Effects, Opus).
  Performance fix 13: profile the clouds and cut work that doesn't show.
  Same look (Effects rule 4).
