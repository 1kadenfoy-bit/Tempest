# Tempest: handoff bundle for Claude Code

Everything a coding agent needs to build Tempest. Put the contents of this folder at the top level of a new GitHub repository, then start Claude Code on the web with the kickoff prompt.

## What is here

| Path | What it is |
| --- | --- |
| `KICKOFF_PROMPT.md` | The prompt to paste, and follow-up prompts for later milestones |
| `CLAUDE.md` | Standing rules. Claude Code reads this automatically every session |
| `docs/01-product-brief.md` | What the app is for and what it must do |
| `docs/02-design-spec.md` | Template v8, written out: shell, behaviour, layers, panels |
| `docs/03-architecture.md` | Stack, data contract, layers, offline, speed, spikes |
| `docs/04-milestones.md` | Build order with a stop after each milestone |
| `docs/05-data-sources.md` | Every source and model, ranked, with access and licences |
| `docs/06-decisions-and-open-items.md` | Settled decisions, defaults taken, facts still to check |
| `docs/reference/` | The full research report, and the terrain-temperature code from the Windy plugin |
| `design/v8/png/` | The 27 v8 screens as images |
| `design/v8/html/` | The same screens as static HTML, for exact sizes and colours |
| `design/tokens.json` | Colours, type, spacing, radii and the three data colour ramps |
| `design/icon/` | The Tempest icon as SVG and PNG |

## Starting the build

1. **Create an empty GitHub repository** named `tempest`. Public is simplest: one starter library is GPL-2.0, and an open repo settles that if the app is shared.
2. **Add these files** to it, keeping the folders as they are.
3. **Open Claude Code on the web** and choose the repository.
4. **Set the environment's network access.** The default setting allows package registries and GitHub but blocks the weather and map servers the app needs. In the environment's settings, change Network access to **Full**. To keep it tighter, choose **Custom**, keep the default package-manager list ticked, and add the domains below.
5. **Paste the kickoff prompt** from `KICKOFF_PROMPT.md`.
6. Claude Code works through milestone M0 and stops. Open the preview on your phone, read the report, then paste the "Next milestone" prompt.

### Domains for a custom allowlist

A starting list. Claude Code will tell you if it hits another.

```
*.open-meteo.com
openmeteo-data-spatial.b-cdn.net
*.weather.gc.ca
*.protomaps.com
*.mapterhorn.com
*.avalanche.ca
*.openstreetmap.org
fonts.googleapis.com
fonts.gstatic.com
unpkg.com
cdn.playwright.dev
playwright.download.prss.microsoft.com
```

## What you will be asked for

- A look at each milestone on your phone, and a go or a list of changes.
- A hosting account, if the preview host needs one (M0 will say).
- Confirmation of the defaults in `docs/06-decisions-and-open-items.md`, section 2.
- New designs when the build reaches a screen or layer that v8 does not cover.

## Where the design lives

The live v8 canvas is "Tempest: GUI template v8" on claude.ai. Versions 1 to 7 and their comments are on "Weather app: GUI template". When the design changes, export the changed screens into `design/` and tell Claude Code with prompt 4.
