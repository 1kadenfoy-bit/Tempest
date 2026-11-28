# The tests: what they check, in what order, and what could still go wrong

Nov 27, 2026 (Kaden's round on the tests). How the checks before a merge work,
and a list of what could go wrong in the app with the test that guards each
one, or "not covered" where none does yet.

## What runs before a merge

| Step | What | Time |
| --- | --- | --- |
| Typecheck, lint | The code is consistent; the architecture rules hold | under a minute |
| Unit tests | The calculations, without a browser (388 checks) | under 10 s |
| Browser tests | The app itself at 390 × 844, on recorded weather | about 10 min on each of 4 GitHub machines |

**The order (Kaden, Nov 27): the tests most likely to fail go first,** on
each machine:
1. the tests that failed on the branch's last run;
2. the test files of the areas the branch changed (`docs/sections/sections.json`),
   and on every branch the server budget (`e2e/requests.spec.ts`, below), which
   any change can trip;
3. the rest.

A machine stops at the first step that fails, so a run that is going to fail
says so in minutes. `npm run test:plan` shows the plan for a working copy;
`tools/test-plan.mjs` makes it. The machines' shares are balanced by how long
each file takes (`e2e/durations.json`), so they finish together (before: 6,
13 and 17 minutes on the three machines; now about 10 each).

Locally, `npm run check:section -- <area>` runs last time's failures first,
then the area's tests and those of every other area whose files changed.

## Recorded weather is strict

The tests run on a recorded day (`recorded/default`: Nov 28, 2026, 07:00 UTC,
which is Fri Nov 27, 11 PM in BC; before Nov 28, Nov 20). Until Nov 27,
anything the recording did not hold was fetched live. Open-Meteo deletes a
run a few days after it is made, so those tests passed for a week, then
waited minutes and failed. That is why the wind, saved-area and phone-tests
checks were red on main. Now an answer not in the recording is refused at
once, and the test's log lists what was missing:

```
[wind: …] 24 answer(s) not in the recorded weather "default" (a new set must cover them …)
```

The fix for those three was a new recording that covers what they read
(`docs/tasks/test-upkeep.md`, task 3: the Nov 28 set, below).

## Recording a set that covers every test (Nov 27)

**A piece of a file is found by what it holds, not only by how it was asked.**
The map-file reader asks for byte ranges of each file. Before, an answer was
found only by its exact range, so a reader that asked slightly different
pieces found nothing. Now the replay answers any range whose every byte the
recording holds: inside one recorded piece, or across pieces that touch or
overlap (the same recorded bytes, so the same numbers). A file's size is
answered from any recorded piece of it. One lookup does this for the tests
(`e2e/recorded.ts`) and the dev server (`public/recorded-sw.js`):
`app/data/recorded-replay.ts`, with its unit tests. The Nov 20 set's missing
pieces were truly missing (not other ranges of recorded ones), so the three
tests stayed red until the Nov 28 recording.

**The tests record what they read.** `npm run weather:record -- --set=<name>`:
1. the tour: each layer at each spot, the hours played through, the forecast
   summary where the summary tests press (200, 300 on the screen at Mt
   Seymour) (`tools/record/tour.spec.ts`);
2. every browser test on the new set with `RECORD=<set>`: what the set lacks
   is asked live and kept, so the phone tests page, the saved area, the
   consistency checks' views and any new test are covered without changing
   the recorder. Live-weather tests run on the set too. A check that fails
   does not stop its test while recording (it is "soft"), so the test still
   asks for everything it reads; the failures are listed;
3. the merge into `recorded/<set>/`, each body kept once, and a report: the
   size (on disk and in git), what the servers refused (not recorded), and
   whether a model's newer run came out during the recording (which would mix
   two runs: record again).

**On GitHub: the "Record weather" workflow** (Actions › Record weather › Run
workflow; `.github/workflows/record-weather.yml`). The tour on one machine,
the tests on four at once, then the merge and a pull request with the new
set, its report in the description, and the tests started on it (GitHub does
not start them on a pull request a workflow opened). It stops without a pull
request when the set is over the size limit (120 MB on disk unless changed; the Nov 28 set: 109 MB, about 75 MB in git). For the
pull request to open, Settings › Actions › General › "Allow GitHub Actions to
create and approve pull requests" must be on; otherwise the set is still
pushed to a `record/…` branch and the run says so.

**The server budget keeps its refused case.** `e2e/requests.spec.ts` now
refuses a pin's forecast away from your location itself, instead of relying
on the set to lack it: a set recorded by every test holds the forecasts at
the places other tests drop pins, which are the same places.

## Report pictures

Tests that take report pictures (avalanche, ATES, air quality, stations,
summary) now save them in `test-results/reports/`. Before, every run rewrote
about 25 pictures under `docs/reports/`, ready to be committed by mistake. To
refresh the pictures in `docs/reports/` on purpose: `REPORTS=1 npx playwright test <file>`.

## The server budget (Nov 27, Data rule 1)

**`e2e/requests.spec.ts`: does the app ask the servers more than it needs
to?** A normal session on recorded weather: open, every layer, the pin
dropped in three places and back, the time dragged and Now, the forecast
summary (press-and-hold), Temperature at that last pin, then an hour left
open and untouched (the page's clock fast-forwarded), then on to just after
HRDPS's next run could exist (worked out from the runs the set holds, so it
fits any recorded day; Nov 28). The test answers the point forecast at your
location only, so at the dropped pins the point service refuses (busy), as
it does when it is overloaded: the refused case is part of the session on
purpose. About 3 minutes. It fails when:
- a server is asked more than its budget in the session;
- anything at all is asked between 10 and 60 minutes of the untouched hour;
- more than 20 answered requests are asked again in the same words;
- HRDPS's next run is not looked for within 10 minutes once it could exist,
  or RDPS's is looked for before it could (the timetable in
  `docs/05-data-sources.md`, "How often the app asks").

It also checks that "The forecast service is not answering" is on screen once
the retries stop, and prints the whole table in its log.

**The counts, measured Nov 27 on the build machine** (the same session; the
session before the fix did not end on Temperature):

| Server | Before: session | Before: the untouched hour | After: session | After: the untouched hour | Budget |
| --- | --- | --- | --- | --- | --- |
| Open-Meteo point API (forecasts) | 114 to 156 | 99 to 138 | 33 | 18, all in the first 10 min | 45 |
| Open-Meteo point API (which run it serves) | 7 | 6 | 1 | 0 | 2 |
| Open-Meteo air API | 0 | 0 | 0 | 0 | 5 |
| Open-Meteo map files (pieces and sizes) | 7,810 to 8,191 | 5,425 to 5,808 | 1,927 to 2,168 | 0 | 2,800 |
| Open-Meteo map files (each model's newest run) | 35 | 30 | 5 | 0 | 6 |
| ECCC (radar, smoke, observed rain, AQHI, alerts) | 211 | 0 | 201 | 0 | 260 |
| Avalanche Canada | 3 | 0 | 3 | 0 | 5 |
| BC (fires) | 2 | 0 | 2 | 0 | 4 |

**The same request asked twice.** Before: answered requests asked again
4,776 extra times (the map files' sizes, each asked 33 to 34 times: the reader
kept only 64 files' sizes, fewer than one pin's series reads), and refused ones
1,458 extra times (the dropped pin's temperature 99 times in the hour, every
minute, plus the map-file pieces read for it each time). After: 9 and 177 extra
(the refused pin's forecast 21 times in all, every one in the first minutes,
then the app stops and says so).

**What the map files' count is.** Most of the map-file pieces are the
dropped pins' rain and snow amounts for the next 48 hours, read from the map
files because the point service refuses there. With the service answering,
those are a few point requests instead.

**Nov 28: the new day showed what a refusal really cost.** The Nov 20 set
lacked most map-file pieces at the dropped pins, so the app's reads there
failed fast and the counts above looked small. The Nov 28 set holds them (the
tests recorded them), and the same session then asked for **30,612 map-file
pieces and 61 point forecasts**: on Precipitation, a briefly refused pin read
its whole air profile hour by hour from the map files (about 6,000 pieces a
pin), and the longer models' amounts too. Kaden chose (Nov 28, Data rule 3)
that a brief refusal reads only the quick part from the map files (the next
48 hours of amounts) and waits for the service for the rest, as Temperature
already did; reading everything from the files stays for long outages (the
daily limit). Measured on the build machine, Nov 28 set:

| Server | Before the fix | After | Budget |
| --- | --- | --- | --- |
| Open-Meteo point API (forecasts) | 61 | 31 | 45 |
| Open-Meteo map files (pieces and sizes) | 30,612 | 426 | 2,800 |
| ECCC | 179 | 179 | 260 |

The other servers were unchanged and within budget.

## New tests (Nov 27)

**`e2e/consistency.spec.ts`: is the number on screen the right one?** It
compares the app with itself, so it holds whatever the weather is:
- zooming in close, out over BC, panning and tilting never change the pin's
  value, its height, the summaries, the week, the legend or the chart;
- quick taps end on the last choice: layers switched one after another
  without waiting, the pin dropped in three places in a row, the time dragged
  then Now, each ends with exactly the answer reached slowly;
- a phone set to another time zone shows the same times and days (everything
  is shown in BC time);
- the data's age ("6 h old") matches the run and the clock;
- imperial units show the same weather, correctly converted.

**`e2e/perf.spec.ts`: speed checks that hold on any machine** (frame rates are
measured on the phone with `?perf`):
- untouched, the app does no work: no map redraws, no downloads, no busy
  stretches (Performance rule 6);
- hidden, it does nothing at all;
- going round the layers four times does not keep taking memory (rule 7);
- the work each tap starts stays under 0.2 s, a layer switch under 1 s
  (rules 4 and 5). Measured Nov 27 on the build machine: menus 5 to 7 ms, the
  sheet 36 ms, a layer switch 81 ms.

**Every browser test now runs in BC's time zone,** like Kaden's phone. GitHub's
machines are on UTC, so before, a mistake that only shows in BC time could not
show up in a test.

## What could go wrong, and what guards it

### Is the data correct, and is it shown correctly?

| What could go wrong | Guarded by |
| --- | --- |
| The pin's value changes when the map is zoomed, panned or tilted (heights read at the view's zoom, a fill's value read as the pin's) | `consistency`: zooming… never change the numbers |
| A late answer for an earlier choice lands on top of the latest one (layer, pin, time) | `consistency`: quick taps |
| A time or day shown in the phone's own time zone instead of BC's | `consistency`: time zone; all tests in BC time |
| The data's age wrong (day boundaries, UTC versus local) | `consistency`: the data's age |
| A unit converted in one place and not another | `consistency`: imperial units; `settings`: units everywhere |
| Saved (offline) numbers differ from the live ones | `offline` |
| Safety data re-scored or recoloured | `avalanche`, `alerts`, `air-quality` (ECCC's own colours and words) |
| Readouts blended between model steps | `shell`: one cursor (steps are whole hours) |
| Auto picks the wrong model past HRDPS's end | `offline` (RDPS past HRDPS), `models` |
| Recorded weather quietly replaced by live (tests pass, then break days later) | strict recorded weather (above) |
| The app asks the free servers more than it needs to (the same answer again before new data could exist, retries that never stop), using up the shared limits (Data rule 1) | `requests`: the server budget |
| A new run is looked for later than before (the timetable too late) | `requests`: HRDPS looked for within 10 min once possible; unit tests (`core/time/run-schedule`): never later than the fastest run seen Nov 20 to 27 |
| The forecast summary's totals differ from the hours charted | **not covered** in the browser; unit tests cover the sums |
| Snow/rain split or freezing line wrong at height | unit tests (`core/precip`, `core/temperature`) only |

### Is the app fast enough?

| What could go wrong | Guarded by |
| --- | --- |
| The map redraws, or something downloads, while untouched | `perf`: untouched |
| Work goes on while the app is hidden (battery) | `perf`: hidden; `wind`: streaks pause |
| Memory grows with each layer switch until Safari reloads the page | `perf`: memory |
| A tap starts too much work at once | `perf`: the work a tap starts |
| Frame rates while panning or playing | **not on GitHub** (software drawing); `?perf` on the phone |
| Load time | **not on GitHub**; `?perf` on the phone (rule 1: under 7 s) |

### Sequences that could cause trouble

| What could go wrong | Guarded by |
| --- | --- |
| Layer switched while the last one is loading | `consistency`: quick taps |
| Pin moved again before its forecast came | `consistency`: quick taps |
| Time dragged, then Now | `consistency`: quick taps; `shell`: one cursor |
| Signal lost while a layer or the forecast loads | partly: `stations`, `search` (no connection); **not covered** mid-load |
| A new run lands while the app is open (every 10 minutes) and the readout mixes two runs | **not covered** (needs two recorded runs) |
| The app closed or reloaded while saving an area | **not covered** |
| A new version of the app installed over an old offline copy | **not covered** |
| The forecast service refuses (limits) and the pin waits forever | `requests`: temperature at a refused pin is asked six times in about 3 minutes, then the app stops and says "The forecast service is not answering · move the pin to try again" (before Nov 27 it asked every minute for good); `models` (model unavailable). The map-file route for temperature is still used only once the service is out for hours (performance task 6) |

### Found while writing these tests

- **Fixed: the charts' look depended on the last draw.** A line setting left
  by one draw (round line ends) carried into the next, so the temperature
  chart's dotted 0° line was drawn differently on the first draw and on every
  redraw after it, for example after zooming. Found by the zoom check; each
  draw now starts fresh (`app/shell/scrubber.ts`, `app/summary/summary-window.ts`).
- **Three of the four tests failing on main fail for one reason:** the
  recording is missing what they read now (above). Not an app bug.
- **The effects lab's "paused" check** counted redraws from a terrain piece
  arriving late on GitHub's slower machines. The check now starts once the
  map has every piece in view; it still allows at most 2 frames.
- **The save card's "midnight"** (`app/shell/save-card.ts`) uses the phone's
  own time zone, while every other time uses BC's. The same in BC; a day off
  for a phone set elsewhere. Not covered; for the Interface area to decide.
- **The forecast-summary tests used live weather**, so they failed when the
  point service refused (it refused this build machine all day on Nov 27).
  Since Nov 28 they run on the recording, which holds the forecast where they
  press and tap. One read the window's time while a drag was still being
  drawn; it now waits for the drawing.

## The Nov 28 set (task 3)

Recorded on GitHub by the "Record weather" workflow: Nov 28, 2026, 07:00 UTC
(Fri Nov 27, 11 PM in BC), at Mt Seymour, Bowen Island and Manning Park, every
layer, then every browser test filling its gaps. 107 MB on disk, about 75 MB
in git; its largest file (`bodies.bin`) is 98.6 MiB, just under GitHub's
100 MiB limit for one file. The models' runs: HRDPS, RDPS, GDPS and ECMWF
00Z.

**Tests whose expectation was tied to the Nov 20 day** (changed with Kaden's
word, Nov 28):
- `alerts`: the "fetched" time had to have minutes. The new clock stands at
  exactly 11 PM, which the app writes "11 PM" like every other on-the-hour
  time. Both forms are accepted now.
- `requests`: "two hours later" reached HRDPS's next run but not RDPS's only
  with the Nov 20 runs. The moment is now worked out from the set's runs.

**Found once the wind was there.** The Nov 20 set lacked the wind, so the
Wind layer's streaks never moved in the tests. On the Nov 28 set they redraw
the map every frame, and after each frame the map's glow (the bloom) copies
the picture; on GitHub's software drawing that copy takes about a second, so
the page answers slowly. The zoom check in `consistency` read the screen in
16 separate steps and ran out of time (one reading took about 50 s): it now
reads everything in one step, and its time allowed went from 4 to 6 minutes
(about 3.6 minutes on the build machine). On a phone the copy is done by the
graphics chip; `?perf` on Wind is the way to see whether it costs anything
there.

**"Not in the recorded weather" lines that remain, and why.** A few view
grids: the temperature layer asks the point service for its air profile at
a lattice of points over the map view, and a view reached in the middle of
a move (3D tilt, zooming, the model menu) gives a slightly different lattice
on each machine, depending on its speed. The recording holds the lattices
GitHub's machines reached while recording; another run can reach a
neighbouring one. The app then reads that hour from the map files instead,
as it does when the service refuses, and the tests pass. Also refused, and
not checked by the tests that ask: the observed rain at the last pin used
(`shell`, no location permission), the Mountain Information Network reports
and BC fire points in the server-budget session (asked once each, counted,
not shown). Nothing is read live by accident: an answer not in the set is
refused at once.

**The one test on live data:** `radar` brings its own radar pictures
(ECCC, saved Nov 17, moved to the present) and refuses the point service;
the frames follow the real clock, which recorded weather would freeze. It
reads only the models' run lists live, from the map-file bucket.
