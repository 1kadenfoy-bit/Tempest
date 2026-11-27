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
//   3. Build, then last time's failed browser tests, then the section's own
//      browser tests and those of other areas it changed, on recorded weather.
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
// One chat per round (docs/working.md, Nov 27): a chat may change any area's
// files; this lists them so it also runs those areas' browser tests.
if (shared.length) console.log(`\nShared files (app/main.ts, state, settings…). Say why in the pull request:\n  ${list(shared)}`);
if (unowned.length) console.log(`\nFiles no area lists yet (add them to docs/sections/sections.json):\n  ${list(unowned)}`);
if (others.length) console.log(`\nFiles of other areas: also run their checks (npm run check:section -- <area>):\n  ${list(others)}`);
console.log('Area: listed');
if (flags.has('--area')) process.exit(0);

// 2 and 3
const steps = [
  ['Typecheck', 'npx', ['tsc']],
  ['Lint (architecture rules included)', 'npx', ['eslint', '.']],
  ['Unit tests', 'npx', ['vitest', 'run']],
];
// The browser tests: this area's, and those of every other area whose files
// changed (docs/working.md, step 4). Those that failed last time go first, so
// a failure still there shows in a minute, not at the end (Kaden, Nov 27).
const otherSpecs = Object.entries(cfg.sections)
  .filter(([k, s]) => k !== name && [...changed].some((f) => owns(s, f)))
  .flatMap(([, s]) => s.specs);
// The server budget (Data rule 1) runs with every area's checks, first: any change can trip it.
const specs = [...new Set(['e2e/requests.spec.ts', ...section.specs, ...otherSpecs])];
if (!flags.has('--no-browser') && specs.length) {
  steps.push(['Build', 'npm', ['run', 'build']]);
  let failedBefore = false;
  try { failedBefore = (JSON.parse(readFileSync('test-results/.last-run.json', 'utf8')).failedTests ?? []).length > 0; } catch { /* no last run */ }
  if (failedBefore) steps.push(['The browser tests that failed last time, first', 'npx', ['playwright', 'test', '--last-failed', '--trace', 'off', '--pass-with-no-tests']]);
  steps.push([`Browser tests on recorded weather (${specs.join(', ')})`, 'npx', ['playwright', 'test', ...specs, '--trace', 'off']]);
}
for (const [label, cmd, cmdArgs] of steps) {
  console.log(`\n== ${label}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`\nFAIL: ${label}. Fix it before the handoff (never by loosening or skipping a test).`);
    process.exit(1);
  }
}
console.log(`\n${section.title}: every check passed. Open the pull request (docs/working.md).`);
