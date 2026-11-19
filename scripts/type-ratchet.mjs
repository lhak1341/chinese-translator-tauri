#!/usr/bin/env node
/**
 * Type-checks the code `bun run type-check` leaves out, with a ratcheting ceiling.
 *
 * `type-check` excludes test files and, with `checkJs: false`, every JavaScript file. So a test
 * fixture missing a newly required field, a mock factory returning an export's old shape, or a
 * JavaScript call passing a `translationSource` the type rejects compiled fine. This runs tsc
 * over tsconfig.test.json (tests and JS checked) and counts, per counted file:
 *
 *   errors        each distinct tsc message located in that file, with how often it occurs.
 *                 Keyed by code and message, never line, so an edit above an error does not
 *                 move it, and fixing one error cannot pay for a different new one.
 *   untypedMocks  `vi.mock('path', …)` / `vi.doMock('path', …)` string-path calls. The typed
 *                 form `vi.mock(import('path'), …)` makes tsc check the path and type the
 *                 factory's return as Partial<the real module>, so a stale export fails.
 *
 * Counted files: tests, test helpers, and hand-written JavaScript in src/ (not src/wasm, which
 * wasm-pack generates). The engine stays JavaScript (ADR-003); this checks it without converting it.
 *
 * Against .type-ratchet-baseline.json:
 *   - any count above its baseline (absent counts as 0) -> fail, printing the new errors
 *   - any count below its baseline -> fail; lower it (keeps the ceiling from going stale)
 *   - otherwise pass
 *
 * --update writes the current counts as the baseline. --ratchet-down (the pre-commit hook)
 * lowers it on a drop instead of failing; an increase still fails.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, '.type-ratchet-baseline.json');

const isTestFile = (file) =>
  /\.(test|spec)\.[jt]sx?$/.test(file) ||
  /(^|\/)__tests__\//.test(file) ||
  file.startsWith('src/test/');
const isHandWrittenJs = (file) =>
  file.startsWith('src/') && /\.jsx?$/.test(file) && !file.startsWith('src/wasm/');
const isCounted = (file) => isTestFile(file) || isHandWrittenJs(file);

let out;
try {
  out = execFileSync(
    path.join(root, 'node_modules', '.bin', 'tsc'),
    ['-p', 'tsconfig.test.json', '--pretty', 'false'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (err) {
  // tsc exits non-zero when it reports errors; the report is still on stdout.
  if (typeof err.stdout !== 'string') throw err;
  out = err.stdout + (err.stderr ?? '');
}

/** @type {Record<string, { errors?: Record<string, number>, untypedMocks?: number }>} */
const current = {};
/** file -> message key -> the full tsc lines, for printing a rise */
const lines = new Map();
const unlocated = [];

for (const line of out.split('\n')) {
  if (!/error TS\d+/.test(line)) continue;
  const located = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line);
  if (!located) {
    unlocated.push(line);
    continue;
  }
  const file = path.relative(root, path.resolve(root, located[1]));
  if (!isCounted(file)) continue;
  const key = `${located[2]}: ${located[3]}`;
  current[file] ??= {};
  current[file].errors ??= {};
  current[file].errors[key] = (current[file].errors[key] ?? 0) + 1;
  if (!lines.has(file)) lines.set(file, new Map());
  if (!lines.get(file).has(key)) lines.get(file).set(key, []);
  lines.get(file).get(key).push(line);
}

// A config or type-library error means tsc checked nothing; an empty count is not a pass.
if (unlocated.length > 0) {
  console.error('type-ratchet: tsc failed before checking any file:');
  for (const line of unlocated.slice(0, 10)) console.error(`  ${line}`);
  process.exit(1);
}

const countedFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src'],
  { cwd: root, encoding: 'utf8' }
)
  .split('\0')
  .filter((f) => f && isCounted(f) && /\.[jt]sx?$/.test(f) && existsSync(path.join(root, f)));
if (!countedFiles.some(isTestFile) || !countedFiles.some(isHandWrittenJs)) {
  console.error('type-ratchet: found no test files or no JavaScript files; refusing to pass.');
  process.exit(1);
}
const UNTYPED_MOCK = /\bvi\.(?:mock|doMock)\(\s*['"`]/g;
for (const file of countedFiles) {
  const n = (readFileSync(path.join(root, file), 'utf8').match(UNTYPED_MOCK) ?? []).length;
  if (n > 0) (current[file] ??= {}).untypedMocks = n;
}

/** Every count as [file, kind, key, n]; kind 'errors' has a message key, 'untypedMocks' none. */
const entries = (counts) =>
  Object.entries(counts).flatMap(([file, c]) => [
    ...Object.entries(c.errors ?? {}).map(([key, n]) => [file, 'errors', key, n]),
    ...(c.untypedMocks ? [[file, 'untypedMocks', '', c.untypedMocks]] : []),
  ]);
const sortKeys = (obj) =>
  Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]])
  );
const write = (counts) => {
  const sorted = {};
  for (const file of Object.keys(counts).sort()) {
    const c = counts[file];
    sorted[file] = {
      ...(c.errors ? { errors: sortKeys(c.errors) } : {}),
      ...(c.untypedMocks ? { untypedMocks: c.untypedMocks } : {}),
    };
  }
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
};
const summary = (counts) => {
  const all = entries(counts);
  const sum = (kind) => all.filter((e) => e[1] === kind).reduce((n, e) => n + e[3], 0);
  return `${sum('errors')} errors, ${sum('untypedMocks')} untypedMocks`;
};

if (process.argv.includes('--update')) {
  write(current);
  console.log(`type-ratchet baseline updated: ${summary(current)}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const get = (counts, file, kind, key) =>
  kind === 'errors' ? (counts[file]?.errors?.[key] ?? 0) : (counts[file]?.untypedMocks ?? 0);
const keys = new Map();
for (const [file, kind, key] of [...entries(baseline), ...entries(current)]) {
  keys.set(`${file}\0${kind}\0${key}`, [file, kind, key]);
}
const rises = [];
const drops = [];
for (const [file, kind, key] of keys.values()) {
  const was = get(baseline, file, kind, key);
  const now = get(current, file, kind, key);
  if (now > was) rises.push({ file, kind, key, was, now });
  else if (now < was) drops.push({ file, kind, key, was, now });
}

if (rises.length > 0) {
  console.error('type-ratchet: counts above the baseline:');
  for (const { file, kind, key, was, now } of rises) {
    if (kind === 'untypedMocks') {
      console.error(`  ${file}: untypedMocks ${was} -> ${now}`);
      console.error("    write vi.mock(import('path'), factory), not vi.mock('path', factory)");
      continue;
    }
    console.error(`  ${file}: ${was} -> ${now} of ${key}`);
    for (const line of lines.get(file)?.get(key) ?? []) console.error(`    ${line}`);
  }
  process.exit(1);
}

if (drops.length > 0 && process.argv.includes('--ratchet-down')) {
  write(current);
  console.log(
    `type-ratchet: ${drops.length} count(s) fell; lowered the baseline to ${summary(current)}.`
  );
  process.exit(0);
}

if (drops.length > 0) {
  console.error('type-ratchet: counts below the baseline:');
  for (const { file, kind, key, was, now } of drops) {
    console.error(`  ${file}: ${kind === 'errors' ? key : 'untypedMocks'} ${was} -> ${now}`);
  }
  console.error(
    'Lock it in with `bun run type-check:ratchet:baseline` so the ceiling cannot drift back up.'
  );
  process.exit(1);
}

console.log(`type-ratchet: ${summary(current)}, at baseline.`);
