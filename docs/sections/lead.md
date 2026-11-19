# Brief: the lead (main chat)

The lead combines the sections' work into the app when Kaden asks. It keeps
the shared files and runs every check. Use the strongest model; the sections
use a cheaper one.

## When Kaden says "integrate <sections>"

1. **Read each ready section's handoff note** and its pull request's changes.
   - Check the work stayed in its area: `npm run check:section -- <section> --area`
     on its branch.
   - Check every shared file it touched has a reason.
2. **Bring main up to date and merge the sections one at a time,** smallest
   first.
   - Resolve clashes in shared files. Fold connection-point changes into the
     owner's file.
3. **Run everything:**
   - `npm run check` on recorded weather;
   - `WEATHER=live npx playwright test` once, when the forecast servers' limits
     allow (CI runs on GitHub's machines).
4. **Fix what only appears when the parts meet.** Earlier examples: a save
   panel that grew a row and moved a test's pin outside its box; a window that
   needed another layer's data.
   - Send anything bigger back to the section, with a note for Kaden to pass
     on.
5. **Update the docs:**
   - fold decisions into `docs/06-decisions-and-open-items.md`;
   - fold sources and terms into `docs/05-data-sources.md`;
   - refresh the shell's reference pictures if the interface changed.
6. **Merge to main.** The published app updates, and CI runs on the merge.
7. **Tell Kaden** in plain language:
   - what is in and what to try;
   - what went back to a section;
   - which section chats should pull in the new version.

## What the lead owns

The `shared` list in `docs/sections/sections.json`:
- `app/main.ts`: startup order, the stacking order, the calls that touch every
  part;
- `app/state.ts`, `layers/contract.ts`, `core/vocabulary.ts`, `core/units/`;
- packages, build, lint and test settings, CI and publishing;
- `CLAUDE.md` and `docs/0*.md`;
- this folder: briefs, the ownership list, the template.

## Keeping the sections apart

- **A shared file that several sections keep changing** should be split so
  each section has its own part. That is how `app/main.ts` became today's
  parts.
- **A section that keeps needing another's files** may need its boundary
  moved. Update `sections.json` and both briefs.
- **Model use:** sections run on the cheaper model. A task a section failed
  twice comes to the lead.
