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

## Working rules

1. **One milestone at a time. Stop at the end of each** and wait for Kaden's go-ahead. Follow "How every milestone ends".
2. **Do not ask questions mid-milestone** unless you are blocked. Take the most reasonable reading, note it, and list it in the report.
3. **Verify before relying.** Library versions, API shapes and anything marked unconfirmed must be checked against current documentation. Record what you found.
4. **Check your own work in a browser.** Run the app, take Playwright screenshots at 390 × 844, and compare them with `design/v8/png`.
5. **No invented designs.** If a screen has no v8 reference, build the plainest version from existing components and say so.
6. **Small commits, clear messages.** One pull request per milestone.

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
app/            the web app: shell, panels, map wiring
core/           no UI: vocabulary, store, resolver, time cursor, units, algorithms
adapters/       one folder per source
layers/         one folder per layer: precipitation, temperature, wind
render/         the grid renderer behind the rendering seam
design/         v8 screens, tokens, icon (reference; do not edit)
docs/           specs, milestones, decisions, spikes
```

## Commands

Fill this in during M0: install, dev, test, typecheck, lint, build, screenshot tests.
