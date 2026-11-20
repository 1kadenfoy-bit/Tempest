# Handoff note template

Copy this to `docs/handoffs/<section>/<YYYY-MM-DD>-<topic>.md` when Kaden is
happy with a piece of work. Put its pictures in the same folder.

The lead reads it before combining the work into the app, and Kaden reads it
too. Write it in plain language: Kaden does not read code.

---

```markdown
# <Section>: <topic>

<Date> · branch `<branch>` · ready to integrate

## What changed
What Kaden asked for and what it does now, as things he can try.
Pictures at 390 × 844 beside the v8 screen where one exists.

## What to try after it is integrated
1. ...

## Files
- **Own files changed:** a short list, or "everything under app/map/"
- **Shared files changed** (the lead's), and why each was needed:
  - `app/main.ts`: ...
- **New files no section owns yet**, and which section should own them:

## Connection points
- **Used:** variables, layer template slots, panels, the stacking order...
- **Changed or added:** anything other sections now see or depend on
- **Needs from other sections:** what to ask them for, and why

## Checks
Output of `npm run check:section -- <section>`: area, typecheck, lint, unit
tests, this section's browser tests on recorded weather. All must pass.
New tests added: ...

## Decisions made, and anything unsure
Things chosen without asking, and things to check on a phone.

## Data, sources and terms (when any were added)
Source, licence, attribution, rate limits, and whether it may be saved
offline. A new server needs Kaden's OK in the environment's network settings.

## Not done yet
```
