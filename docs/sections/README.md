# Working in sections

Tempest is built by several chats at once. Kaden talks to each one directly
and iterates quickly. One main chat (the lead) combines the work into the app.

```
                          Kaden
          design · iterate with each section · decide
                            │
                    Main chat (the lead)
   combines sections on request · full tests · publishes the app
       ┌──────────┬──────────┼──────────┬──────────┐
     Maps    Interface    Weather    Effects     Data
                          on the map
         (section chats · each owns its own files · own branch)
```

| Section | Brief | Covers |
| --- | --- | --- |
| Maps | [maps.md](maps.md) | Base map, terrain, 3D terrain and buildings, place names and search, map pieces and downloads, how the map moves |
| Interface | [interface.md](interface.md) | Everything around the map: top bar, sheet, scrubber, panels, menus, cards, settings, summary window, theme, the Notification Centre and weather alerts |
| Weather on the map | [weather.md](weather.md) | Each weather layer from colours to numbers: fills, colour ramps, legends, lines, arrows, radar, stations, readouts, charts, cards; avalanche, terrain ratings, air quality and fire, shown exactly as issued |
| Effects | [effects.md](effects.md) | Animated weather over the map: rain, snow, clouds, wind particles, in 3D |
| Data | [data.md](data.md) | Where the numbers come from: models, runs, new sources, caching, saved areas, recorded weather |
| The lead | [lead.md](lead.md) | Combining, the shared files, the full checks, publishing |

Who owns which file is listed in [sections.json](sections.json). The section
check reads it.

## Which chat for what

| Kaden wants to change… | Chat |
| --- | --- |
| How the map looks and moves: base map colours, roads, labels, peaks, trails, terrain shading, contours, 3D terrain and buildings, zoom and gestures, place search | **Maps** |
| Anything around the map: top bar, menus, panels, the sheet, the time scrubber's controls, detail card layout, settings, the summary window, light and dark theme, fonts, icons | **Interface** |
| What a weather layer shows: its colours on the map, its legend, its chart (for example the temperature graph), its readout, its cards' content, its settings; the freezing and snow lines, wind arrows, radar, weather stations; new weather layers (cloud, sun, snow) | **Weather on the map** |
| Moving weather drawn over the map: falling rain and snow, drifting cloud, wind particles, 3D effects | **Effects** |
| Where the numbers come from: models and runs, new data sources (planes, rivers…), caching, saved areas and offline, recorded weather days | **Data** |
| Avalanche forecasts and terrain ratings, wildfires, air quality and smoke | **Weather on the map** |
| Weather alerts (the bell and the Notification Centre) | **Interface** |
| Combining sections into the app, anything that touches several sections at once, the shared files, publishing | **The main chat** |

When it is unclear, the owner of the files that need to change decides: see
[sections.json](sections.json). The way something looks inside a layer's
chart or card is that layer's; the frame around it is the Interface's.

## The loop with Kaden

1. **Iterate.** Kaden asks for a change. The section chat makes it inside its
   own files and shows it running. Kaden looks, clicks around, and asks for
   more. Repeat.
2. **"I'm happy."** The section chat runs its checks
   (`npm run check:section -- <section>`), writes a handoff note, and marks its
   work ready.
3. **"Integrate …"** In the main chat, Kaden names the sections he is happy
   with. The lead combines them, runs every check, fixes what clashes (or sends
   it back with a note), and publishes the app.
4. **Pull in the new version.** Each section chat brings its branch up to date
   with `main` at the start of every session and after each integration.

There was a Safety chat until Nov 22. Kaden closed it: its layers moved to
Weather on the map and its weather alerts to Interface, with the rule that
safety data is shown exactly as issued.

## Rules for every section chat

**Start of every session**
1. Read `CLAUDE.md`, this file, your own brief and your rules file
   (`docs/wishes/<section>.md`).
2. Bring your branch up to date: `git fetch origin main && git merge origin/main`.
   If git reports a conflict, stop and tell Kaden; the lead resolves it.
3. Start the app on recorded weather (see "Showing your work").

**When Kaden asks for something that is not yours**

Do not build it, not even "just this once". Reply in one or two lines:
- which chat owns it, using "Which chat for what" above;
- what to tell that chat, in one sentence he can paste.

For example: "That's the Data chat's job. Tell it: 'add plane routes as a new
data source'."

If the request is partly yours, do your part and name the chat for the rest.
Only the main chat can decide that something crosses sections.

**Kaden's rules for your section** (`docs/wishes/<section>.md`)

Keep a running list of how Kaden wants things to behave and look. Whenever he
says something like "when I do X, it should do Y", "this should always look
like…" or "never…", write it down as a rule, in his own words where you can.
- **One rule per line,** numbered, with the date he said it. Group them under
  plain headings (for example "Gestures", "Labels", "Colours").
- **When he changes his mind,** edit the rule to the new wording, add the new
  date, and move the old wording to a "Changed" list at the bottom ("was: …,
  until <date>"). Never keep two rules that disagree.
- **Read the file at the start of every session,** and follow it.
- **Flag every contradiction before acting.** When Kaden asks for something, or
  gives a new rule, that goes against a rule already on the list, stop and say
  so before changing anything:
  > "That goes against rule 3 (from Nov 20): 'pins never move when I tap a
  > station'. Keep rule 3, or replace it with the new one?"

  Only after he answers, either leave the rule or change it (old wording to
  "Changed"). Never quietly break a rule or quietly rewrite one.
- **Tell him in one line** each time you add or change a rule ("Noted as rule
  4: …"), and commit the file with your work.
- **Rules for another section go to that chat.** Tell him which one, as with
  any request that is not yours.

The lead folds these rules into `docs/06-decisions-and-open-items.md` when
the section is integrated.

**While working**
- **Edit only your own files.** `npm run check:section -- <section> --area`
  tells you in seconds.
  - Need a change in another section's file? Write it under "Needs from other
    sections" in your handoff note, or tell Kaden which chat to ask.
  - Shared files belong to the lead (listed in `sections.json`): `app/main.ts`,
    `app/state.ts`, `layers/contract.ts`, the variable list, units, packages and
    settings. Touch one only when your work cannot be seen without it, keep the
    change small, and explain it in the handoff note.
- **Push every change you want Kaden to try.** Commit with a clear message and
  push your branch; that publishes your preview. The cloud machine sleeps when Kaden steps away, and he may say "go
  back two versions".
- **Nothing new without asking.** No new library, server, design token or
  colour.
  - A new server must be allowed in the environment's network settings. Name
    the host and Kaden approves it.
  - Colours and sizes come from `design/tokens.json`, which only Kaden changes.
    Show him options and he picks.
- **Talk to Kaden in plain language.** He designs and tests; he does not read
  code.
- **Never skip, loosen or delete a test.** The same goes for a test of another
  section.
- **A test timed out waiting for a server?** That is a limit or the network,
  not your code. Run it once more, then report it. Do not "fix" it.
- **Two tries at the same problem have failed?** Stop and tell Kaden, so the
  lead can take it.

**When Kaden is happy**
1. Bring the branch up to date with `main` again.
2. Run `npm run check:section -- <section>`. Fix what fails, inside your own
   files.
3. Write the handoff note from [handoff-template.md](handoff-template.md) at
   `docs/handoffs/<section>/<YYYY-MM-DD>-<topic>.md`. Pictures go beside it.
4. Commit, push, and open a pull request titled `<Section>: <topic>`, with the
   handoff note as its description. Tell Kaden it is ready to integrate.
5. Then stop and wait.

## Lessons from combining sections

What broke when sections met. Check these before a handoff.

- **Run the whole suite when anything visible moves.** If you move, rename
  or restyle a button, panel or id, run `npx playwright test` on recorded
  weather, not only your own specs. Other sections' tests find things by
  place and id.
- **Tests read `<body>` data attributes:** `data-idle`, `data-pin`,
  `data-series`, `data-summary`, `data-model-in-view`, `data-ates-loading`…
  Keep every one working when you rework a part. With "Auto" the top bar
  names no model; read `data-model-in-view`.
- **Watch the speed.** GitHub's test machines draw the map in software.
  - Big GeoJSON files (megabytes), wide blurred lines and continuous redraws
    make every test slower, not just yours.
  - Compare a few test durations with `main` before a handoff.
  - Prefer vector tiles or loading by area. The map must do no redraws at
    rest.
- **Wide overlays must let taps through.** A container that spans the map
  gets `pointer-events: none`, and its buttons `pointer-events: auto`.
- **Not every page has the whole app.** The phone test page
  (`spike.html`) has no time cursor and no layers. Code that reads `S.*`
  must cope with a missing part (`S.cursor?.…`).
- **Recorded weather freezes the clock** to the recording's day
  (`recorded/<set>/meta.json`). Dates such as "issued today" follow the
  page's clock, never a date typed into a test.
- **Pictures redrawn by tests** (`docs/reports/…`) are committed only when
  you meant to change them.
- **Live-weather tests are slow and can be flaky** on GitHub (the summary
  window still runs on live weather). A failure there is worth one re-run
  before you look for a bug.

## Showing your work

**Recorded weather.** Run the app on a saved day of forecasts instead of the
live servers.
- It loads at once and shows the same weather every time.
- It never spends the forecast servers' free daily limit, which every chat
  shares.

```
npm run dev
```

Open `http://localhost:5173/?weather=recorded`.
- `?weather=live` goes back to live data.
- The run age in the top bar says "· recorded" while it is on.
- Sets live in `recorded/<set>/`. `recorded/default/meta.json` says what day
  the set holds.
- Elsewhere than the recorded spots, the app reads the recorded run's map
  files, which is slower.
- Only the Data section makes new sets (`npm run weather:record`).

**Your preview address (how Kaden tries your work).** Every push to your
branch publishes your version of the app at its own address, which Kaden opens
on his phone and uses like the real app:

`https://1kadenfoy-bit.github.io/Tempest/preview/<section>/`

- It appears about 3 to 5 minutes after you push. Tell Kaden when you push and
  give him the link.
- The top bar says "· <section> preview", so he knows which copy he is on.
- It reads live weather from his phone, which has its own free limit, so
  recorded weather is not needed there.
- It keeps no offline copy and never mixes with the installed app.
- If your branch fails to build, your preview is missing until it builds again.
  Check the "Publish to GitHub Pages" run when he says the link is gone or
  unchanged.

Section chats cannot show the running app inside the Claude app, so the
preview address is how Kaden clicks around. Push small changes often.

**Pictures.** Take Playwright screenshots at 390 × 844 for the handoff note,
and compare them with `design/v8/png` where a v8 screen exists.

**Pages without the app.**
- The Data section can build a bare data viewer page (`data-viewer.html`, its
  own file): a source's output as a table and on a plain map.
- The Effects section builds its own test page (`effects.html`) and works there
  until an effect is ready to join the map.

## The connection points

These are where the sections meet. Each has one owner; others ask the owner.

| Connection point | Where | Owner |
| --- | --- | --- |
| Variable names and units ("temperature at 2 m, °C"), data shapes | `core/vocabulary.ts` | Data, approved by the lead |
| Layer template: readout, legend, chart, cards, settings | `layers/contract.ts` | Lead |
| Shared app state and the calls between parts | `app/state.ts` | Lead |
| The map's stacking order (what draws under what) | the `load` handler in `app/main.ts` | Lead, at Maps' request |
| Panels, cards, switches, icons | `app/shell/` | Interface |
| Units formatting | `core/units/` | Lead (anyone may add a formatter, said in the handoff) |
| Colours, sizes, type | `design/tokens.json` | Kaden |
