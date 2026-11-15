# Prompts for Claude Code

Paste the first prompt to start. Use the others as the build goes on.

## 1. Kickoff

```
You are building Tempest, a personal map-first weather app, from the documents in this repository.

Start by reading, in this order: CLAUDE.md, docs/01-product-brief.md, docs/06-decisions-and-open-items.md, docs/04-milestones.md, docs/02-design-spec.md, docs/03-architecture.md. Look at the screens in design/v8/png. Skim docs/05-data-sources.md and open docs/reference only when a task needs it.

Then do milestone M0 (setup and spikes) and nothing beyond it.

How to work:
- I design and test; I do not read code. Write to me in plain language.
- Do not ask me questions unless you are blocked. Take the most reasonable reading, and list what you assumed in your report.
- Verify library versions, API details and anything marked unconfirmed against current documentation before relying on it. The documents were written from research and some details will have moved.
- Run the app in a browser and check your own work with screenshots at 390 x 844.
- If a network request to a weather or map server is refused, stop and tell me which domain, so I can allow it in the environment settings.

Before writing code, reply with a short plan for M0: what you will set up, which spikes you will run, and anything in the documents that looks wrong, contradictory or out of date. Then carry on without waiting, unless something there needs my decision.

Finish M0 as described under "How every milestone ends" in docs/04-milestones.md, then stop and wait for me.
```

## 2. Next milestone

```
M[N] is approved. [Any changes I want: ...]

Do milestone M[N+1] from docs/04-milestones.md and nothing beyond it. Same rules as before. Finish as described under "How every milestone ends", then stop and wait for me.
```

## 3. Changes to a milestone

```
Before moving on, change these things in M[N]:
1. ...
2. ...

Update the screenshots, tell me what changed, then stop.
```

## 4. A new layer or screen design

```
I have added a design for [layer or screen] in design/[folder]. Read it with docs/02-design-spec.md, sections 4 and 9.

Reply with: the slots or cards it fills, the data it needs and where that comes from in docs/05-data-sources.md, anything the design leaves unclear, and a plan. Wait for my go-ahead before building.
```
