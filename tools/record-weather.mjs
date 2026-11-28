// Records a set of weather for "recorded weather" (app/data/recorded.ts, the
// dev server's ?weather=<set>; e2e/recorded.ts, the browser tests): every
// answer from the weather and safety servers, kept in recorded/<set>/ with
// the clock frozen at the moment the recording starts.
//
//   npm run weather:record -- --set=default --description="Mixed rain and snow, Nov 28"
//
// Three steps, all by default:
//   1. tour   a phone-sized browser visits each layer at each spot, plays
//             through the hours and opens the forecast summary where the
//             summary tests press (tools/record/tour.spec.ts);
//   2. tests  every browser test runs on the new set, and what it reads that
//             the set lacks is asked live and kept (RECORD=<set>,
//             e2e/recorded.ts): the phone tests page, the saved area, the
//             views the consistency checks move to, and any new test, with
//             no change here. Checks do not stop a test while recording;
//             their failures are listed, as a hint for the next chat;
//   3. merge  each step's answers go into the set (bodies.bin, index.json),
//             the same bytes kept once; then the size, what the servers
//             refused, and whether a model's new run came out meanwhile.
// After step 1 the set is merged too, so step 2 starts from it.
//
// Options: --set=<name> (default "default"), --description=<text>,
// --spots=seymour,bowen,manning (default all), --layers=<ids> (default all),
// --play=<seconds per layer> (default 25), --step=tour|tests|merge (one step
// only; the "Record weather" workflow runs them on separate machines),
// --shard=<i>/<n> (step 2 on one machine of n), --tests=<files> (step 2 with
// these test files only, comma-separated; for a trial), --add (keep what the set holds
// and add to it; the frozen time stays: only while its runs still exist),
// --max-mb=<n> (default 120 on disk, about 80 in git: stop with an error when the set is bigger),
// --summary=<file> (also write the report there, for the pull request).
// Without --add (or --step) the set is replaced. Needs the base map pieces
// (npm run tiles) and the browser (Playwright).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);

const set = arg('set', 'default');
const description = arg('description', '');
const spots = arg('spots', 'seymour,bowen,manning');
const layers = arg('layers', 'precipitation,temperature,wind,radar,avalanche,air-quality');
const play = arg('play', '25');
const step = arg('step', 'all');
const shard = arg('shard', '');
const testFiles = arg('tests', '').split(',').filter(Boolean);
const maxMb = Number(arg('max-mb', '120'));
const summaryFile = arg('summary', '');
const add = flag('add');
const dir = join('recorded', set);
const FILL = join(dir, 'fill');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** A new, empty set, frozen at this minute (or the set as it is, when adding to it). */
function prepare() {
  if (add && existsSync(join(dir, 'meta.json'))) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  now.setSeconds(0, 0);
  const names = { seymour: 'Mt Seymour', bowen: 'Bowen Island', manning: 'Manning Park' };
  const at = { seymour: [49.3895, -122.948], bowen: [49.38, -123.28], manning: [49.07, -120.8] };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({
    name: set,
    description,
    now: now.toISOString(),
    recordedAt: now.toISOString(),
    recordedWith: 'the tour (tools/record/tour.spec.ts) and every browser test (RECORD)',
    spots: spots.split(',').map((s) => ({ name: names[s], lat: at[s][0], lng: at[s][1] })),
    layers: layers.split(','),
  }, null, 2) + '\n');
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ entries: {} }));
  writeFileSync(join(dir, 'bodies.bin'), '');
}

/** Runs Playwright on the set being recorded; returns the titles of the tests whose checks failed. */
function playwright(args, outDir) {
  const env = { ...process.env, RECORD: set, RECORD_SPOTS: spots, RECORD_LAYERS: layers, RECORD_PLAY: play };
  const results = join(outDir, 'results.json');
  rmSync(results, { force: true });
  const r = spawnSync('npx', ['playwright', 'test', '--trace', 'off', '--workers=1', '--reporter=list,json', `--output=${outDir}`, ...args], {
    stdio: 'inherit', env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: results },
  });
  try {
    const report = JSON.parse(readFileSync(results, 'utf8'));
    const failed = [];
    const walk = (suite, path) => {
      for (const spec of suite.specs ?? []) {
        if (spec.tests.some((t) => t.results.some((x) => x.status !== 'passed' && x.status !== 'skipped'))) failed.push(`${spec.file} › ${[...path, spec.title].join(' › ')}`);
      }
      for (const s of suite.suites ?? []) walk(s, s.title && !s.title.endsWith('.ts') ? [...path, s.title] : path);
    };
    for (const s of report.suites ?? []) walk(s, []);
    if (r.status !== 0 && !failed.length) failed.push('(the run stopped before its tests: see the log above)');
    return failed;
  } catch {
    return r.status === 0 ? [] : ['(the test run did not finish)'];
  }
}

/** The built app the tests open (vite preview serves dist/). */
function build() {
  if (!readdirSync('public/tiles').some((f) => f.endsWith('.pmtiles'))) throw new Error('No base map pieces: run npm run tiles first');
  const r = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('The app did not build');
}

const hashOf = (b) => createHash('sha1').update(b).digest('hex');

/** Folds every test process's answers (fill/) into the set; returns what was refused and never answered. */
function merge() {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const entries = index.entries;
  const bodies = readFileSync(join(dir, 'bodies.bin'));
  const byHash = new Map();
  for (const e of Object.values(entries)) if (e.offset !== undefined && e.length) byHash.set(hashOf(bodies.subarray(e.offset, e.offset + e.length)), e.offset);
  let end = bodies.length;
  const extra = [];
  const refused = new Map();
  let added = 0;
  const files = existsSync(FILL) ? readdirSync(FILL).filter((f) => f.endsWith('.jsonl')).sort() : [];
  for (const f of files) {
    const binFile = join(FILL, f.replace(/\.jsonl$/, '.bin'));
    const bin = existsSync(binFile) ? readFileSync(binFile) : Buffer.alloc(0);
    for (const line of readFileSync(join(FILL, f), 'utf8').split('\n')) {
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; } // a line cut short when a process was stopped
      const { key, refused: why, ...entry } = rec;
      if (why) { refused.set(key, why); continue; }
      if (entries[key]) continue;
      if (entry.offset !== undefined) {
        const body = bin.subarray(entry.offset, entry.offset + entry.length);
        if (body.length !== entry.length) continue;
        const h = hashOf(body);
        if (!byHash.has(h)) { byHash.set(h, end); extra.push(body); end += body.length; }
        entry.offset = byHash.get(h);
      }
      entries[key] = entry;
      added++;
    }
  }
  if (extra.length) appendFileSync(join(dir, 'bodies.bin'), Buffer.concat(extra));
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ entries }));
  rmSync(FILL, { recursive: true, force: true });
  for (const k of refused.keys()) if (entries[k]) refused.delete(k);
  log(`Merged ${added} new answers from ${files.length} test process(es) into ${dir}`);
  return refused;
}

/** Whether each model's newest run is still the one recorded (a newer run during the recording would mix two runs). */
async function runCheck(entries, bodies) {
  const changed = [];
  for (const [key, e] of Object.entries(entries)) {
    const url = key.slice(4);
    if (!key.startsWith('GET ') || url.includes(' ')) continue;
    if (!/openmeteo\.s3\.amazonaws\.com\/.*\/latest\.json$|api\.open-meteo\.com\/data\/.*\/meta\.json$/.test(url) || e.offset === undefined) continue;
    try {
      const was = JSON.parse(bodies.subarray(e.offset, e.offset + e.length).toString('utf8'));
      const now = await (await fetch(url)).json();
      const run = (j) => j.reference_time ?? j.last_run_initialisation_time;
      if (run(was) !== run(now)) changed.push(`${url.replace(/^https:\/\//, '')}: recorded ${run(was)}, now ${run(now)}`);
    } catch { /* not answering: nothing to compare */ }
  }
  return changed;
}

function report(refused, failed, changed) { // refused is narrowed below
  const entries = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).entries;
  const bodies = readFileSync(join(dir, 'bodies.bin'));
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const raw = bodies.length + statSync(join(dir, 'index.json')).size;
  const packed = gzipSync(bodies, { level: 6 }).length + gzipSync(readFileSync(join(dir, 'index.json'))).length;
  const hosts = new Map();
  for (const [k, e] of Object.entries(entries)) {
    const h = new URL(k.split(' ')[1]).hostname;
    const x = hosts.get(h) ?? { n: 0, bytes: 0 };
    x.n++; x.bytes += e.length ?? 0;
    hosts.set(h, x);
  }
  const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;
  // A request the page itself cancelled (it moved on, or a newer ask replaced it) is not a refusal.
  const cancelled = [...refused].filter(([, why]) => /ERR_ABORTED/.test(why)).length;
  refused = new Map([...refused].filter(([, why]) => !/ERR_ABORTED/.test(why)));
  const byHost = [...refused].reduce((m, [k, why]) => { const h = new URL(k.split(' ')[1]).hostname; m.set(h, [...(m.get(h) ?? []), why]); return m; }, new Map());
  const lines = [
    `**Set "${set}"**: ${meta.description || '(no description)'}`,
    `- The weather of ${meta.now} (frozen clock); ${Object.keys(entries).length} answers.`,
    `- Size: ${mb(raw)} on disk, about ${mb(packed)} in git (compressed). Limit: ${maxMb} MB.`,
    '',
    '| Server | Answers | Bytes |', '| --- | --- | --- |',
    ...[...hosts].sort((a, b) => b[1].bytes - a[1].bytes).map(([h, x]) => `| ${h} | ${x.n} | ${mb(x.bytes)} |`),
    '',
    refused.size ? `**Refused by the servers and not recorded: ${refused.size}** (tests reading these will find them missing)` : 'Nothing was refused by the servers.',
    ...[...byHost].map(([h, whys]) => `- ${h}: ${whys.length} (${[...new Set(whys)].join(', ')})`),
    ...(cancelled ? [`(${cancelled} asked and then cancelled by the app itself, not needed: not counted.)`] : []),
    '',
    changed.length ? `**A newer run came out during the recording** (the set may mix two runs; record again once the runs are settled):\n${changed.map((c) => `- ${c}`).join('\n')}` : 'No model’s run changed during the recording.',
    '',
    failed === null ? '' : failed.length ? `**Checks that failed while recording: ${failed.length}** (on the new day; for the next chat to look at):\n${failed.map((t) => `- ${t}`).join('\n')}` : 'Every check passed while recording.',
  ];
  const text = lines.join('\n');
  console.log(`\n${text}\n`);
  if (summaryFile) writeFileSync(summaryFile, `${text}\n`);
  return raw;
}

const steps = step === 'all' ? ['tour', 'tests', 'merge'] : [step];
let failed = null;
let refusedAll = new Map();
if (steps.includes('tour')) {
  prepare();
  build();
  log(`Step 1: the tour (${spots}; ${layers})`);
  const f = playwright(['--config=tools/record/playwright.config.ts'], 'test-results/record-tour');
  if (f.length) log(`  the tour did not finish everywhere: ${f.join(', ')}`);
  refusedAll = merge();
}
if (steps.includes('tests')) {
  if (!existsSync(join(dir, 'meta.json'))) throw new Error(`No set "${set}" to add to: run the tour first`);
  if (!steps.includes('tour')) build();
  log(`Step 2: every browser test on "${set}", filling what it lacks${shard ? ` (machine ${shard})` : ''}`);
  failed = playwright([...(shard ? [`--shard=${shard}`] : []), ...testFiles], `test-results/record-tests${shard ? `-${shard.replace('/', '-')}` : ''}`);
  mkdirSync(FILL, { recursive: true });
  if (shard) writeFileSync(join(FILL, `failed-${shard.replace('/', '-')}.json`), JSON.stringify(failed));
}
if (steps.includes('merge')) {
  // Failures listed by machines that ran step 2 apart (the workflow).
  if (existsSync(FILL)) for (const f of readdirSync(FILL).filter((n) => n.startsWith('failed-'))) failed = [...(failed ?? []), ...JSON.parse(readFileSync(join(FILL, f), 'utf8'))];
  const refused = merge();
  for (const [k, v] of refusedAll) if (!refused.has(k)) refused.set(k, v);
  const entries = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).entries;
  for (const k of [...refused.keys()]) if (entries[k]) refused.delete(k);
  const changed = await runCheck(entries, readFileSync(join(dir, 'bodies.bin')));
  const raw = report(refused, failed, changed);
  if (raw > maxMb * 1e6) {
    console.error(`The set is ${(raw / 1e6).toFixed(1)} MB, over the ${maxMb} MB limit (--max-mb). It is stored in git for good: find what grew before keeping it.`);
    process.exit(2);
  }
}
