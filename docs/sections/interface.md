# Section brief: Interface

Everything around the map that Kaden touches:
- the top bar, the pin's readout, the sheet and its time scrubber and chart;
- panels and menus;
- the detail cards;
- app settings, the forecast summary window, the theme (light and dark), and
  the credits screen.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the live view, the checks and the handoff.

## What you own

The exact list is `interface` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| Top bar: layer menu, model and source menus, run age, legend row | `app/shell/top-bar.ts`, `layer-menu.ts`, `model-menu.ts` |
| Sheet, scrubber, chart frame, week strip, Now and Play | `app/shell/sheet.ts`, `scrubber.ts` |
| Detail cards and the layer settings panel | `app/shell/details.ts`, `cards.ts` |
| Panels (grow panel), the map panel's look, pin and readout, icons, insets | `app/shell/panel.ts`, `map-panel.ts`, `pin.ts`, `icons.ts`, `insets.ts`, `viewport.ts`, `prefs.ts` |
| Styles | `app/shell/shell.css`, `app/main.css`, `app/fonts/` |
| App settings, theme, credits | `app/settings/`, `app/theme/`, `app/sources/` |
| Forecast summary window | `app/summary/` |
| Page markup and app icons | `index.html`, `public/icon*` |
| Browser tests and the shell's reference pictures | `e2e/shell.spec.ts` (and `e2e/shell.spec.ts-snapshots/`), `settings.spec.ts`, `summary.spec.ts`, `details.spec.ts` |

## Connection points

- **The layer template** (`layers/contract.ts`, the lead's) decides what a
  layer gives you:
  - a readout, a legend, a chart, a summary;
  - cards described as data;
  - its settings.

  You decide how they look. A new kind of card, or a new slot, is a template
  change: ask the lead and say why in the handoff.
- **Every layer's numbers and words come from its own folder,** owned by
  Weather on the map. Do not change what a layer says; change how
  the interface shows it.
- **Shared app state** (`app/state.ts`): read it freely. Ask before adding to
  it.
- **Tokens:** every colour, size, radius and font comes from
  `design/tokens.json`. Never type a colour or size by hand in CSS or code.
- **The shell's reference pictures** (`e2e/shell.spec.ts-snapshots/`) are
  yours.
  - When Kaden approves a visual change, refresh them with
    `npx playwright test e2e/shell.spec.ts --update-snapshots`.
  - Say so in the handoff.

## Ideas waiting

- **The forecast summary window's open questions:**
  1. Title: "Forecast summary" or "Full forecast"?
  2. With radar on the map, should opening the window move the time back to
     the forecast?
  3. A Play button and model hand-over marks in the window?
  4. Is "Forecast summary for this point" the right wording for the details
     button?
- Any redesign Kaden hands over. The design reference is `design/v8/png` and
  `docs/02-design-spec.md`.
- Screens with no v8 design use the plainest version built from existing parts
  (CLAUDE.md, "No invented designs").

## Rules for this section

- **Design rules from CLAUDE.md:**
  - 44 px minimum touch targets, 56 px thumb buttons.
  - Use safe-area insets.
  - Colour is for data; controls stay neutral.
- **Open menus dim the map 35%.**
- **One time cursor for the whole app.** Never give a panel its own clock.
- **Safety data is shown exactly as issued.** You can lay it out, never
  restyle its colours or words.
- **Weather alerts are yours** (from Nov 22, when the Safety chat closed): the
  ECCC alert badge and the alerts section of the Notification Centre
  (`app/alerts/`, `core/alerts/`, `adapters/eccc-alerts/`,
  `e2e/alerts.spec.ts`). Shown exactly as issued: ECCC's words, its colour
  level, issue and expiry times, the link, and the age when offline. Never
  re-scored, recoloured or summarised. Online only; the last answer stays with
  its age.
