// The section check: what a section chat runs when Kaden is happy with its
// work, before it writes its handoff note (docs/sections/README.md).
//
//   npm run check:section -- <section>        (maps, interface, weather, effects, data, performance)
//   npm run check:section -- <section> --area (the area check only, in seconds)
//   npm run check:section -- <section> --no-browser
//
// The section is guessed from the branch name (claude/tempest-<section>...)
// when not given. Steps, stopping at the first failure:
//   1. Area: every file changed since this branch left main belongs to the
//      section (docs/sections/sections.json). Another section's file fails;
//      a shared file (the lead's) is listed for the handoff note.
//   2. Typecheck, lint (with the architecture rules), unit tests.
//   3. Build, then the section's own browser tests on recorded weather.
// The full browser suite runs when the lead integrates (and in CI).
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../docs/sections/sections.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const sh = (cmd) => run(cmd).trim();

const branch = (() => { try { return sh('git rev-parse --abbrev-ref HEAD'); } catch { return ''; } })();
const name = args.find((a) => !a.startsWith('--')) ?? Object.keys(cfg.sections).find((s) => branch.includes(s));
const section = cfg.sections[name];
if (!section) {
  console.error(`Which section? One of: ${Object.keys(cfg.sections).join(', ')} (branch: ${branch || 'unknown'})`);
  process.exit(2);
}

const toRegex = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '@@').replace(/\*/g, '[^/]*').replace(/@@/g, '.*')}$`);
const matches = (file, globs) => (globs ?? []).some((g) => toRegex(g).test(file));
const owns = (s, file) => matches(file, s.paths) && !matches(file, s.except);

// 1. Area
const base = (() => {
  for (const ref of ['origin/main', 'main']) { try { return sh(`git merge-base HEAD ${ref}`); } catch { /* try the next */ } }
  return null;
})();
const changed = new Set([
  ...(base ? sh(`git diff --name-only ${base}`).split('\n') : []),
  ...run('git status --porcelain --untracked-files=all').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '')),
].filter(Boolean));
const others = [], shared = [], unowned = [];
for (const f of [...changed].sort()) {
  if (owns(section, f)) continue;
  const other = Object.entries(cfg.sections).find(([k, s]) => k !== name && owns(s, f));
  if (matches(f, cfg.nobody)) others.push(`${f} (Kaden's design files)`);
  else if (other) others.push(`${f} (${other[1].title})`);
  else if (matches(f, cfg.shared.paths)) shared.push(f);
  else unowned.push(f);
}
/** A list, shortened past 25 lines. */
const list = (xs) => [...xs.slice(0, 25), ...(xs.length > 25 ? [`... and ${xs.length - 25} more`] : [])].join('\n  ');
console.log(`\n${section.title}: ${changed.size} file(s) changed since this branch left main`);
if (shared.length) console.log(`\nShared files (the lead's). Say why in the handoff note:\n  ${list(shared)}`);
if (unowned.length) console.log(`\nFiles no section owns yet (name them in the handoff note):\n  ${list(unowned)}`);
if (others.length) {
  console.log(`\nFAIL: files that belong to another section:\n  ${list(others)}\nUndo these, or ask Kaden to have that section (or the lead) make the change.`);
  process.exit(1);
}
console.log('Area: OK');
if (flags.has('--area')) process.exit(0);

// 2 and 3
const steps = [
  ['Typecheck', 'npx', ['tsc']],
  ['Lint (architecture rules included)', 'npx', ['eslint', '.']],
  ['Unit tests', 'npx', ['vitest', 'run']],
];
if (!flags.has('--no-browser') && section.specs.length) {
  steps.push(['Build', 'npm', ['run', 'build']]);
  steps.push([`Browser tests on recorded weather (${section.specs.join(', ')})`, 'npx', ['playwright', 'test', ...section.specs, '--trace', 'off']]);
}
for (const [label, cmd, cmdArgs] of steps) {
  console.log(`\n== ${label}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`\nFAIL: ${label}. Fix it before the handoff (never by loosening or skipping a test).`);
    process.exit(1);
  }
}
console.log(`\n${section.title}: every check passed. Write the handoff note (docs/sections/handoff-template.md).`);
