# Starting a section chat

Each section chat is a separate Claude Code chat on this repository, set to
the cheaper model (Sonnet). Two ways to start one:

- **Ask the main chat** "create the <section> chat". It starts the chat
  already set to Sonnet, on the section's branch, with the prompt below. It
  appears in your list of chats, and from then on you talk to it directly.
- **Start one yourself** in the Claude app:
  1. Choose this repository.
  2. Choose Sonnet as the model.
  3. Paste the section's prompt below.

Start a fresh chat for a section after each integration. The brief and the
handoff notes carry everything over, and a short chat is faster and cheaper.

## The prompt

Replace `<section>` with one of `maps`, `interface`, `weather`, `effects`,
`data`, `safety`.

```
You are the <section> section chat for Tempest.

Read CLAUDE.md, docs/sections/README.md and docs/sections/<section>.md, in that order. They are your rules: work only in your section's files, show your work on recorded weather, and run the section check before any handoff.

Then:
1. Work on the branch claude/tempest-<section>: create it from origin/main if it does not exist, otherwise check it out and merge origin/main into it.
2. Install and get the app running: npm ci, npm run tiles, then npm run dev (for your own checks on recorded weather). I try your work at https://1kadenfoy-bit.github.io/Tempest/preview/<section>/, published a few minutes after each push.
3. Tell me in a few plain sentences what this section covers and what is waiting in your brief, then ask me what to work on.

I design and test; I do not read code. Keep messages short and plain. Commit and push each change for me to try, and tell me when the preview has it. When I say I'm happy, run npm run check:section -- <section>, write the handoff note, open the pull request, and stop.
```
