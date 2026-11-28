# Tasks: polite servers, and every test green

From the round on the tests (Nov 27, 2026; `docs/testing.md`). Run them **in
order**, one new chat each (`docs/working.md`). Each block below is the whole
message to paste: the starter prompt and the task. Tick a task off here in its
own pull request.

Why this order: task 1 stops the app and the tests from using up the forecast
servers' free limits, which a new recording (tasks 2 and 3) needs. Tasks 2 and
3 turn the three tests red on `main` since Nov 27 green again. Tasks 4 to 6
build on a green, steady test run.

## 1. Polite to the servers, as fast as now (Data; Opus, high effort)

- [x] Done (Nov 27: the run timetable, retries that stop, the server budget test `e2e/requests.spec.ts`; `docs/testing.md`)

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task: make the app polite to the weather and safety servers without making it any slower (Data rule 1, docs/wishes/data.md). Read docs/testing.md and docs/tasks/test-upkeep.md first.
1. Measure first. Count every request the app makes to each server (Open-Meteo's point API, air API and map files; ECCC; Avalanche Canada; BC) in a normal session: open, switch every layer, move the pin a few times, drag the time, open the forecast summary, then leave it open and untouched for an hour (fast-forward the page's clock in a test). Show me the counts per server, and the same request asked twice.
2. Most data changes at known times: each model's runs (check each model's real run times and when its files appear, in docs/05-data-sources.md and the sources' own pages), radar every 6 minutes, avalanche bulletins once a day, alerts and stations as they come. Ask again only when something new could be there; in between, use what the app already has, in memory or kept on the phone. Retries after a refusal or an error back off and stop after a limit, saying so on screen, instead of asking every minute forever (seen Nov 27: a dropped pin's temperature asked again and again while the point service refused).
3. Add a browser test with a budget per server for that session (on recorded weather), so a change that asks too much fails before it merges. Put it where it runs early.
4. Speed rule: nothing may load later or look different than now (docs/wishes/performance.md). Run ?perf before and after; show me both.
5. Write the schedule and the budgets into docs/05-data-sources.md and docs/testing.md.
```

## 2. Recorded weather that lasts, and a way to record it (Data; Opus, high effort)

- [x] Done (Nov 27: replay by the bytes a range holds, the tests fill the recording, the "Record weather" workflow; `docs/testing.md`)

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task: get the recorded weather ready for a new recording that covers every browser test. Read docs/testing.md and docs/tasks/test-upkeep.md first. The wind, saved-area (offline) and phone-tests checks fail on main because the recorded day (Nov 20) lacks pieces they read, and Open-Meteo has deleted that run; each test's log lists what was missing.
1. Replay that survives a change in how files are read: a weather file piece is found today only by its exact byte range. Let the replay (e2e/recorded.ts, and app/data/recorded.ts for the dev server) answer a range from any recorded range of the same file that contains it. Same bytes, same numbers.
2. A recorder that covers every test: tools/record-weather.mjs also runs the phone tests page (spike.html), traces and saves the offline test's area (three layers, the whole time frame), opens the forecast summary where the summary tests press (200, 300 on the screen at Mt Seymour), and visits the views e2e/consistency.spec.ts moves to. Better still: let the browser tests themselves fill the gaps while recording, so a new test is covered without editing the recorder.
3. A way to record that does not depend on this cloud machine: the point service refused it all day on Nov 27 (too many requests). Add a "Record weather" workflow I can start by hand on GitHub, which records on GitHub's machine and opens a pull request with the new set. Keep the set's size in check (it is committed to git; say how big it is).
Do not record the new day in this task unless it is quick; task 3 does it.
```

## 3. Record a new day; every test green (Data, with every area's tests; Opus)

- [x] Done (Nov 28: the Nov 28 set; the summary tests on recorded weather; a briefly refused pin no longer reads thousands of map-file pieces, Data rule 3; `docs/testing.md`, "The Nov 28 set")

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task: record a new weather day with the recorder and workflow from task 2 in docs/tasks/test-upkeep.md, and make every browser test pass on it. Read docs/testing.md first.
1. Record the new set (the "Record weather" workflow on GitHub, or here if the point service answers). Tell me the day it holds and its size.
2. Run every browser test on it. No test may read live weather by accident: the log's "not in the recorded weather" lines must be gone, or explained.
3. Move the forecast-summary tests (e2e/summary.spec.ts) to recorded weather, so they stop failing when the point service refuses.
4. Fix what fails for the right reason. Never skip, loosen or delete a test; if a test's expectation was tied to the old day, tell me which and why before changing it.
5. GitHub's tests must be fully green on this pull request before it merges.
```

## 4. Faster, steadier test runs (Performance and the test setup; Sonnet)

- [ ] Done

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task: make GitHub's test run shorter and steadier without dropping or loosening any check. Read docs/testing.md first.
1. Update e2e/durations.json from the last green GitHub run, so the four machines finish together (target: about 10 minutes of tests each, under 15 in all).
2. The slowest files: e2e/consistency.spec.ts (about 6 minutes for two tests), e2e/3d.spec.ts (5 minutes), e2e/offline.spec.ts. Find where they wait without need (fixed pauses, loading the app again) and cut it; each check stays the same.
3. The "shell pixels › map panel" picture failed once on Nov 27 and passed on the next run: find why (most likely taken while the panel was still opening) and make it wait for the right moment.
4. Then tell me the run's time before and after.
```

## 5. Sequences no test covers yet (Data and Interface; Opus, high effort)

- [x] Done (Nov 28: `signal`, `new-run`, `save-interrupted`, `update`; each found a bug, fixed; `docs/testing.md`, "The sequences")

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task: add browser tests for the sequences marked "not covered" in docs/testing.md, and fix what they find. Only tests that check something that could really go wrong; no test for the sake of a test.
1. The signal drops while a layer or the pin's forecast is loading, then comes back: the app ends showing the right data, with its age, and says what it could not get.
2. A new model run arrives while the app is open (it looks every 10 minutes): the readout, chart and map never mix two runs, and the age updates.
3. The app is closed or reloaded while an area is being saved: no half-saved area is used as if whole; the save can be started again.
4. A new version of the app is installed over an old offline copy: it opens without signal and the saved areas still work.
For each one that finds a bug, show me what happens before you fix it.
```

## 6. The save card's "midnight" in BC time (Interface; Sonnet)

- [ ] Done

```
You are working on Tempest. I'm Kaden; I design and test, I don't read code. Talk to me in plain language.

Read CLAUDE.md, then docs/working.md, and follow it: start from the latest main, read the area guide (docs/sections/<area>.md) and my rules (docs/wishes/<area>.md) for every area you touch, work with me on your preview address, run the checks, open a pull request and merge it once GitHub's tests pass. Then tell me it's live.

The task: the Save for offline card works out "midnight" in the phone's own time zone (app/shell/save-card.ts), while every other time in the app is shown in BC time (core/units/format.ts). Make it BC time like the rest, and extend the time-zone check in e2e/consistency.spec.ts to open the save card on a phone set to another zone. In BC nothing should look different; show me the card before and after.
```
