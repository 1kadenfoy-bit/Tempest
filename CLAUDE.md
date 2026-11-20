# Tempest

A personal, map-first weather app for mountain days in BC. One full-screen map, one weather layer at a time, a pin, a time scrubber. Read `docs/01-product-brief.md` for the why.

The owner, Kaden, designs and tests. He does not read code. Write reports and questions in plain language.

## Read before working

| File | Use |
| --- | --- |
| `docs/04-milestones.md` | What to build next, and when to stop |
| `docs/02-design-spec.md` + `design/v8/` | What it looks like and how it behaves |
| `docs/03-architecture.md` | How it is built |
| `docs/05-data-sources.md` | Every source and model, with limits and licences |
| `docs/06-decisions-and-open-items.md` | Settled decisions, defaults, facts to check. Wins over other docs |
| `docs/reference/` | Background research and the terrain-temperature code to port. Reference only |
| `docs/sections/` | How the work is split between section chats, who owns which file, each section's brief, the handoff template |

## Working rules

1. **Work in sections** (`docs/sections/README.md`). A section chat works on one piece at a time with Kaden, edits only its own files, and when he is happy runs `npm run check:section -- <section>`, writes a handoff note and stops. The main chat (the lead) integrates on Kaden's word and owns the shared files.
2. **Do not ask questions mid-task** unless you are blocked. Take the most reasonable reading, note it, and list it in the report.
3. **Verify before relying.** Library versions, API shapes and anything marked unconfirmed must be checked against current documentation. Record what you found.
4. **Check your own work in a browser.** Run the app, take Playwright screenshots at 390 × 844, and compare them with `design/v8/png`.
5. **No invented designs.** If a screen has no v8 reference, build the plainest version from existing components and say so.
6. **Small commits, clear messages.** One pull request per handoff.

## Architecture rules

- **Layers never see a provider.** Sources go through adapters into the five standard shapes, into one store. Layers ask by variable name.
- **One read path** for live and saved data. Offline is not a separate mode.
- **One time cursor** for the whole app.
- **Layers never import each other.** A layer is one folder that fills the template's slots.
- **No interface without two real implementations.** Write the first one concretely; extract the contract when the second exists.
- **Core logic has no UI code** and runs in unit tests without a browser.
- **Rendering sits behind one seam**, so the starter library can be replaced. It is GPL-2.0; keep it isolated.
- **Values reach the GPU as numbers** and are coloured on the device from a lookup strip. Never bake colour into data.
- **Units are formatted in one place.**
- **Interpolate profiles, never finished temperatures.**
- **Readouts use real model steps.** Blending between steps is for the picture only.
- **No backend, no accounts, no analytics, no tracking, no background work.**

## Data rules

- **Safety data is shown exactly as issued**: avalanche, alerts, fire. Source, issue time and link. Never re-scored, recoloured or summarised by the app.
- **Every adapter carries its source's licence and attribution** as metadata. The credits screen is generated from it.
- **Stale data is shown with its age, never hidden.** Every value can say which model, run and elevation it came from.
- Respect each source's rate limits and terms. Cache politely.

## Design rules

- Tokens come from `design/tokens.json`. No colours, sizes or radii typed by hand in components.
- Colour is for data. Controls stay neutral.
- 44 px minimum touch target. 56 px thumb buttons.
- Use safe-area insets. Never hard-code the status bar height.
- A layer, switch or button appears in the app only when it works.

## Suggested layout

Adjust if a spike shows a better shape; say why.

```
app/            the web app: main.ts starts it, state.ts holds what the parts share;
                one folder per part (map, shell, weather, radar, data, offline, summary...)
core/           no UI: vocabulary, store, resolver, time cursor, units, algorithms
adapters/       one folder per source
layers/         one folder per layer: precipitation, temperature, wind
render/         the grid renderer behind the rendering seam
design/         v8 screens, tokens, icon (reference; do not edit)
docs/           specs, milestones, decisions, spikes
```

## Commands

Node 22.12 or newer.

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Dev server (http://localhost:5173, with isolation headers) | `npm run dev` |
| Dev server on recorded weather (same weather every time, no server limits) | `npm run dev`, then open `/?weather=recorded` |
| A section's checks before its handoff (area, typecheck, lint, unit tests, its browser tests on recorded weather) | `npm run check:section -- <section>` |
| Record a new weather set into `recorded/` (Data section) | `npm run weather:record -- --set=<name>` |
| Base map pieces the tests use (overview, North Shore piece, Sea to Sky detail) into `public/tiles`; skips files present; also runs before `build` | `npm run tiles` |
| Base map for all of BC (about 680 MB in 28 files; the Pages publish runs this) | `npm run tiles:all` |
| Unit tests (Vitest, no browser) | `npm test` |
| Typecheck | `npm run typecheck` |
| Lint (also enforces the architecture import rules) | `npm run lint` |
| Build to `dist/` | `npm run build` |
| Screenshot tests at 390 × 844 (Playwright; starts `vite preview` on 4173), on recorded weather (`e2e/fixtures.ts`; `WEATHER=live` for live data). Shell pixel baselines live in `e2e/shell.spec.ts-snapshots`; refresh with `npx playwright test --update-snapshots` after an intended change | `npm run screenshots` |
| Everything CI runs | `npm run check` |
| Size or cut any PMTiles box | `node tools/pmtiles-extract.mjs <url> <out> --bbox=w,s,e,n --maxzoom=N [--dry-run]` |

Open the app at the artboard's safe areas with `?insets=47,34`.

In the cloud session, Node needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` to reach the network through the proxy (for `npm run tiles`).

Base map regions and detail areas are listed in `tools/regions.json`.

`tools/` holds build-time scripts (Node only). The phone test page is `spike.html` (`app/spike/`).
