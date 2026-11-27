// Which browser tests to run, and in what order: the ones most likely to fail
// first, so a run that is going to fail does so in minutes, not at the end of
// a half-hour wait (Kaden, Nov 27).
//
//   node tools/test-plan.mjs                 the plan for this working copy, in words
//   node tools/test-plan.mjs --shard=2/4     one GitHub machine's part (--github: as step outputs)
//
// The order, on each machine:
//   1. failed: the tests that failed on the last run (every machine's list,
//      .last-run/*/last-run.json in CI, test-results/.last-run.json here);
//   2. changed: every test file of an area whose files this branch changed
//      (docs/sections/sections.json), and any test file changed itself;
//      a shared file (fixtures, config, main.ts…) counts as every area;
//   3. rest: everything else.
// The machines' parts are balanced by how long each test file takes on
// GitHub's machines (e2e/durations.json; a file not listed counts 60 s), so
// they finish together instead of one waiting for the slowest.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

const files = readdirSync('e2e').filter((f) => f.endsWith('.spec.ts') && !f.startsWith('zz-')).map((f) => `e2e/${f}`).sort();
const durations = JSON.parse(readFileSync('e2e/durations.json', 'utf8')).seconds;
const secs = (f) => durations[f] ?? 60;
const cfg = JSON.parse(readFileSync('docs/sections/sections.json', 'utf8'));

// 1. Last run's failures, as test files (a test's id starts with the hash of its file's path under e2e/).
const failedIds = new Set();
const lastRuns = existsSync('.last-run')
  ? readdirSync('.last-run', { recursive: true }).filter((f) => String(f).endsWith('last-run.json')).map((f) => join('.last-run', String(f)))
  : [];
if (existsSync('test-results/.last-run.json')) lastRuns.push('test-results/.last-run.json');
for (const f of lastRuns) {
  try { for (const id of JSON.parse(readFileSync(f, 'utf8')).failedTests ?? []) failedIds.add(id); } catch { /* unreadable: ignored */ }
}
const fileId = (f) => createHash('sha1').update(f.replace(/^e2e\//, '')).digest('hex').slice(0, 20);
const failedFiles = new Set(files.filter((f) => [...failedIds].some((id) => id.startsWith(`${fileId(f)}-`))));

// 2. Areas this branch changed.
const toRegex = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '@@').replace(/\*/g, '[^/]*').replace(/@@/g, '.*')}$`);
const matches = (file, globs) => (globs ?? []).some((g) => toRegex(g).test(file));
const base = args.base ?? (sh('git merge-base HEAD origin/main') || sh('git merge-base HEAD main'));
const changed = [
  ...(base ? sh(`git diff --name-only ${base}`).split('\n') : []),
  ...sh('git status --porcelain --untracked-files=all').split('\n').map((l) => l.slice(3)),
].filter(Boolean);
const changedFiles = new Set();
// Docs and the recorded reports change nothing a test reads.
const inert = (f) => /^docs\//.test(f) || /\.md$/.test(f) || /^design\//.test(f);
for (const f of changed) {
  if (inert(f)) continue;
  if (files.includes(f)) { changedFiles.add(f); continue; }
  const areas = Object.values(cfg.sections).filter((s) => matches(f, s.paths) && !matches(f, s.except));
  if (areas.length) for (const s of areas) for (const spec of s.specs) changedFiles.add(spec);
  // A shared file, or one no area lists: every test may read it.
  else for (const spec of files) changedFiles.add(spec);
}
// When everything changed, "changed first" says nothing: keep only the failures first.
if (changedFiles.size === files.length) changedFiles.clear();

// 3. Balance the machines: longest files first, each to the machine with the least work so far.
const [shard, shards] = String(args.shard ?? '1/1').split('/').map(Number);
const loads = Array.from({ length: shards }, () => ({ s: 0, files: [] }));
for (const f of [...files].sort((a, b) => secs(b) - secs(a) || a.localeCompare(b))) {
  const m = loads.reduce((best, l) => (l.s < best.s ? l : best));
  m.s += secs(f);
  m.files.push(f);
}
const mine = loads[shard - 1].files.sort();
const plan = {
  failed: failedIds.size && mine.some((f) => failedFiles.has(f)) ? mine.filter((f) => failedFiles.has(f)) : [],
  changed: mine.filter((f) => changedFiles.has(f)),
  rest: mine.filter((f) => !changedFiles.has(f)),
};

// Every machine's failures in one list, for playwright's --last-failed-file.
if (typeof args['write-failed'] === 'string') writeFileSync(args['write-failed'], JSON.stringify({ status: 'failed', failedTests: [...failedIds] }));

if (args.github) {
  // Step outputs for .github/workflows/ci.yml.
  console.log(`failed=${plan.failed.join(' ')}`);
  console.log(`changed=${plan.changed.join(' ')}`);
  console.log(`rest=${plan.rest.join(' ')}`);
  console.log(`minutes=${Math.round(loads[shard - 1].s / 60)}`);
} else if (args.json) {
  console.log(JSON.stringify({ ...plan, failedIds: [...failedIds], seconds: loads.map((l) => l.s) }));
} else {
  const show = (xs) => (xs.length ? xs.map((f) => `  ${f} (about ${Math.max(1, Math.round(secs(f) / 60))} min)`).join('\n') : '  (none)');
  console.log(`Machine ${shard} of ${shards}: about ${Math.round(loads[shard - 1].s / 60)} min of browser tests.`);
  console.log(`\n1. Failed last time:\n${show(plan.failed)}`);
  console.log(`\n2. Areas this branch changed:\n${show(plan.changed)}`);
  console.log(`\n3. The rest:\n${show(plan.rest)}`);
}
