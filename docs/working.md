# How work is done: one chat per round of changes

From Nov 27, 2026 (Kaden). This replaced the section chats and the lead, to
save tokens: a long chat re-reads its whole history every time it acts, so a
fresh, small chat per round of changes costs less and works as well. What the
section chats knew lives in files, not in chats:
- Kaden's rules: `docs/wishes/<area>.md`;
- the decisions: `docs/06-decisions-and-open-items.md`;
- the area guides: `docs/sections/<area>.md`;
- the lessons below.

## The round

1. **Kaden starts a new chat** and pastes the starter prompt below, with the
   task: a few lines of his own, or one from a task list (such as
   `docs/tasks/performance-fixes.md`).
2. **The chat starts from the latest `main`** (`git fetch origin main && git merge origin/main`)
   and reads:
   - CLAUDE.md;
   - this file;
   - the area guide and Kaden's rules for the areas it will touch.
3. **It works with Kaden.** It changes what the task needs, shows it on its
   preview address, and repeats until he is happy.
4. **It checks.** `npm run check:section -- <area>` runs the browser tests
   that failed on the last run first, then the area's own and those of every
   other area whose files it changed (Nov 27). On GitHub the tests most
   likely to fail also go first (`docs/testing.md`).
5. **It opens a pull request.** The description says, in plain words:
   - what changed and what to try;
   - Kaden's rules added or changed;
   - anything left undone.
6. **It merges the pull request** once GitHub's tests pass, then tells Kaden
   it is live.
   - **A test failure:** find the cause and fix it. A test may be re-run once
     only when the failure has nothing to do with the change, and the chat
     says so.
   - **Never** skip, loosen or delete a test to get green.
   - Change a test only when Kaden's rules changed what it checks, and say
     which rule.
7. **One chat, one round.** When the topic changes, or the chat gets long and
   slow, Kaden starts a new one.

## Two chats at once

- **Fine when they work on different areas** (the map in one, the menus in
  the other). The areas and their files are listed in
  `docs/sections/sections.json`.
- **The second to finish** merges `main` into its branch before its pull
  request merges, re-runs the checks, and fixes any clash.
- **More than two at once** brings back the combining work; avoid it.

## Which model

- **Sonnet:** clear jobs, such as a fix from a task list, a look change or a
  new button.
- **Opus, high effort:** working out why something happens (a slow screen, a
  test that fails now and then), or designing something large.

## Kaden's rules

Each area's rules are in `docs/wishes/<area>.md`. The chat reads the rules for
the areas it touches before changing anything.
- **When Kaden says** "when I do X it should do Y", "this should always look
  like…" or "never…", write it down as a rule:
  - one rule per line, numbered, with the date;
  - tell him in one line.
- **When he changes his mind,** edit the rule and move the old wording to
  "Changed" at the bottom.
- **Flag every contradiction before acting:**
  > "That goes against rule 3 (from Nov 20): '…'. Keep rule 3, or replace it?"
- **Speed fixes never change** how anything looks or behaves. Any trade-off is
  offered to Kaden with what it gains and costs, and never made without his
  word (Nov 27).

## Showing the work

**Recorded weather.** Use it on the build machine: `npm run dev`, then open
`http://localhost:5173/?weather=recorded`.
- It loads at once, shows the same weather every time, and does not spend the
  forecast servers' free limit, which every chat shares.
- `recorded/default/meta.json` says which day the set holds.

**The preview address.** Every push to the chat's branch publishes that
version at:

`https://1kadenfoy-bit.github.io/Tempest/preview/<name>/`

- `<name>` is the branch name without `claude/`, with any `/` turned into `-`.
- It appears 3 to 5 minutes after a push; give Kaden the link. The top bar
  names the preview.
- Only the six most recently pushed branches of the last 3 days are
  published.
- It reads live weather from Kaden's phone, keeps no offline copy, and never
  mixes with the installed app.

**Pictures.** Playwright screenshots at 390 × 844, compared with
`design/v8/png` where a v8 screen exists.

**Speed.** `?perf` on the address runs the speed tour and shows a results card
(`docs/reports/performance/`). Run it before and after any change to the map,
the weather layers or loading, and add `&off=<feature>` to compare.

## Lessons (what broke before)

- **Run all the browser tests when anything visible moves.** Tests find
  things by place and id. If you move, rename or restyle a button, panel or
  id, run `npx playwright test` on recorded weather, not only one area's.
- **Tests read `<body>` data attributes:** `data-idle`, `data-pin`,
  `data-series`, `data-summary`, `data-model-in-view`, `data-saving`,
  `data-ates-loading`… Keep every one working.
- **Watch the speed.** GitHub's test machines draw the map in software.
  Continuous redraws, big files and long calculations on the main thread slow
  every test and every phone. The map must not redraw at rest.
- **Wide overlays let taps through:** `pointer-events: none` on the container,
  `auto` on its buttons.
- **Not every page has the whole app.** The phone test page and the effects
  lab have no settings and no time cursor. Code reading `S.*` must cope with a
  missing part (`S.cursor?.…`, `S.settings?.…`).
- **Recorded weather freezes the clock** to the recording's day. Dates follow
  the page's clock, never a date typed into a test.
- **Pictures redrawn by tests** go to `test-results/reports/`; only
  `REPORTS=1` writes them into `docs/reports/`, and they are committed only
  when you meant to change them (Nov 27).
- **Recorded weather is strict** (Nov 27). An answer the recording lacks is
  refused, and the test's log says "not in the recorded weather". A new
  test that moves the map or the pin somewhere new may need a new recording
  (`docs/tasks/test-upkeep.md`); never let it read live weather quietly: a
  run is deleted from Open-Meteo a few days later and the test breaks then.
- **Tests run in BC's time zone** (`playwright.config.ts`), like Kaden's phone.
- **A busy page delays finger moves and lifts.** Gestures decide by the
  events' own time stamps and wait a frame before deciding (press-and-hold,
  Nov 21).
- **Gestures switch off while the area to save is traced.** Press-and-hold
  and map taps check `body[data-saving]`.
- **Every test but radar runs on recorded weather** (the summary window
  since Nov 28). A test that fails on recorded weather fails for a reason:
  find it before re-running.
- **A reference picture** (`e2e/*-snapshots`) is refreshed only after an
  intended change, and checked by eye.
