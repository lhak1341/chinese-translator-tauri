#!/usr/bin/env bun
/**
 * Fails when a live doc names code that does not exist.
 *
 * A claim is a backticked token shaped like a code identifier or a repo path. It drifts when
 * the code changes and the doc does not: a rule about a deleted function reads as current
 * for months. This checks every claim in the live docs against the tree:
 *
 *   identifier  `copyWasmTokens`, `Foo.bar()`, `MAX_SIZE`: exists if the name (the last
 *               `.member`) appears in tracked code outside comments. A name that survives
 *               only in a comment is gone.
 *   path        `src/utils/TokenClaim.ts`, `TokenClaim.ts`, `../logger.js`: exists if it
 *               matches a tracked file or directory by suffix (an extensionless import
 *               specifier tries the source extensions), or is on disk (generated, gitignored).
 *
 * Not claims: lowercase single words (`ok`, `none`; write a function as `destroy()`), literals,
 * flags, anything with a space, ratios (`23/30`), `Foo.A/B` alternatives, URLs, globs, and
 * fenced code blocks. `be492346:<path>` cites a retired file (docs/README.md "Archive").
 *
 * Out of scope: ADRs and deleted-symbols.md, which name deleted code on purpose. Live docs do
 * not: rewrite the sentence in the present tense, or delete it (git holds the history).
 * A name that is real but outside this repo goes in EXTERNAL below, under its category.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from '../src/test/sourceScan';

const root = path.resolve(import.meta.dir, '..');

/** Real names that live outside this repo's code. Adding one is a deliberate edit. */
const EXTERNAL = new Set([
  // GitHub issue API fields (docs/agents/issue-tracker.md)
  'issueId',
  'subIssueId',
  'blockingIssueId',
  'blockedByIssueId',
  // Claude Code tools and their parameters
  'Grep',
  'replace_all',
  'old_string',
  'dangerouslyDisableSandbox',
  'run_in_background',
  // Bun config keys
  'minimumReleaseAge',
  'minimumReleaseAgeExcludes',
  'minimumReleaseAgeExclude',
  // Node and shell: error codes, env vars, APIs
  'ECONNREFUSED',
  'ENOENT',
  'ERR_MODULE_NOT_FOUND',
  '$TMPDIR',
  'appendFileSync',
  // Build and lint tool options and codes (Vite, Rolldown, tsconfig, ESLint)
  'chunkSizeWarningLimit',
  'INEFFECTIVE_DYNAMIC_IMPORT',
  'allowImportingTsExtensions',
  'caughtErrorsIgnorePattern',
  'ruleId',
  // Names a doc mentions to say they do not exist (Vitest has no jest-extended matchers)
  'toEndWith',
  'someCommandThatIsNotThere',
  'toStartWith',
  // Python, git
  'Counter',
  'HEAD',
  // Naming-convention fragments ("the `_impl` fns")
  '_impl',
  // CSS properties as jsdom reads them back
  'borderStyle',
  'borderWidth',
  'borderColor',
  // GitHub GraphQL mutations
  'addSubIssue',
  'addBlockedBy',
  // Browser and library APIs (DOM, @tanstack/react-virtual)
  'getAnimations',
  'requestIdleCallback',
  'ReferenceError',
  'getOffsetForIndex',
  // Illustrative names in a described pattern, not this repo's code
  'requestId',
  'isScrolling',
  // JS and Rust runtime names, crates and generated glue
  'warn_1',
  'web_time',
  '__wbg_ptr',
  'TypeError',
  'FinalizationRegistry',
  'RcRefMut',
  'borrow_mut_count',
]);

/** Repo-external path-shaped names. Adding one is a deliberate edit. */
const EXTERNAL_PATHS = new Set([
  // A branch and the repo slug
  'prototype/rules-tab-ui',
  'lhak1341/chinese-translator-tauri',
  // App-data files (~/Library/Application Support/com.lhak.chinese-translator/)
  'config.json',
  'appearance.json',
  'transform-rules.json',
  'books.json',
  // A config file the docs tell you to create
  'bunfig.toml',
  // Rust std sources as they appear in panic backtraces
  'alloc/src/rc.rs',
  'alloc/rc.rs',
  'rt/mod.rs',
  // Not paths: an eslint rule, a control-flow pair, a GitHub Action
  'react-hooks/rules-of-hooks',
  'if/else',
  'actions-rust-lang/setup-rust-toolchain@v1',
  // Placeholders in a naming pattern
  'XyzToggle.tsx',
  'src/styles/ComponentName.module.css',
]);

/** Gitignored directories whose generated files docs may name (resolved on disk). */
const GENERATED_DIRS = ['src/wasm'];

const git = (args: string[]): string[] =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);

// Tracked plus untracked-but-not-ignored, so a new file counts before it is staged.
const tracked = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).filter((f) =>
  existsSync(path.join(root, f))
);
// README.md is a symlink to CLAUDE.md; scan each file once.
const isSymlink = (f: string): boolean => lstatSync(path.join(root, f)).isSymbolicLink();

// Docs come from the index, as in check-docs-allowlist.mjs: an unstaged draft is not checked.
const indexed = new Set(git(['ls-files', '--cached', '-z']));
const docs = tracked
  .filter((f) => indexed.has(f))
  .filter(
    (f) =>
      f.endsWith('.md') &&
      !isSymlink(f) &&
      !f.startsWith('docs/adr/') &&
      !f.startsWith('vendor/') &&
      f !== 'docs/guides/deleted-symbols.md'
  );

const STRIPPED = /\.(js|jsx|ts|tsx|mjs|cjs|rs)$/;
const RAW = /\.(json|toml|ya?ml|css|html|sh)$/;
const codeWords = new Set<string>();
for (const file of tracked) {
  if (!STRIPPED.test(file) && !RAW.test(file)) continue;
  const text = readFileSync(path.join(root, file), 'utf8');
  for (const w of (STRIPPED.test(file) ? stripComments(text) : text).match(/[A-Za-z_$][\w$]*/g) ??
    []) {
    codeWords.add(w);
  }
}

const generated = GENERATED_DIRS.flatMap((dir) =>
  existsSync(path.join(root, dir))
    ? readdirSync(path.join(root, dir)).map((f) => `${dir}/${f}`)
    : []
);
const allPaths = new Set([...tracked, ...generated]);
for (const f of tracked) {
  const parts = f.split('/');
  for (let i = 1; i < parts.length; i++) allPaths.add(parts.slice(0, i).join('/'));
}
const pathList = [...allPaths];

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packages = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));

if (docs.length === 0 || codeWords.size === 0) {
  console.error('check-doc-claims: found no docs or no code; refusing to pass.');
  process.exit(1);
}

const IDENT = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*(\(\))?$/;
const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '.mjs', '.rs'];
const HAS_EXT = /\.[A-Za-z]{1,5}$/;
const FILE_NAME = /^[\w.@-]+\.(md|ts|tsx|js|jsx|mjs|cjs|rs|json|toml|css|ya?ml|sh|html)$/;

/** Whether a bare identifier token is code-shaped (Q11), not an English or config word. */
function isCodeShaped(token: string): boolean {
  if (token.endsWith('()') || token.includes('.') || token.includes('_')) return true;
  if (/^[A-Z]/.test(token) && /[a-z]/.test(token)) return true; // PascalCase
  return /^.+[A-Z]/.test(token); // camelCase
}

function pathExists(token: string, doc: string): boolean {
  const bare = token.replace(/^(\.{1,2}\/)+|^\//, '').replace(/\/$/, '');
  // An import specifier names a `.ts` file with `.js` (TS ESM), or omits the extension.
  const candidates = !HAS_EXT.test(bare)
    ? [bare, ...SOURCE_EXT.map((e) => bare + e)]
    : bare.endsWith('.js') && token.startsWith('.')
      ? [bare, bare.replace(/\.js$/, '.ts'), bare.replace(/\.js$/, '.tsx')]
      : [bare];
  for (const c of candidates) {
    if (allPaths.has(c)) return true;
    if (pathList.some((p) => p.endsWith(`/${c}`))) return true;
    if (existsSync(path.join(root, c)) || existsSync(path.join(root, path.dirname(doc), c)))
      return true;
  }
  return false;
}

type Failure = { doc: string; line: number; token: string; kind: 'identifier' | 'path' };
const failures: Failure[] = [];
let claims = 0;

for (const doc of docs) {
  const lines = readFileSync(path.join(root, doc), 'utf8').split('\n');
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) return;
    for (const [, raw] of line.matchAll(/`([^`\n]+)`/g)) {
      const token = raw.trim();
      if (!token || /\s/.test(token) || token.startsWith('be492346:')) continue;

      if (token.includes('/') || FILE_NAME.test(token.split(/::|:\d/)[0])) {
        // `file.rs::fn()` and `file.ts:23`, `file.rs:638-651`, `mod.rs:287:25`: a location.
        const [loc, member] = token.split('::');
        const file = loc.replace(/:\d+(-\d+)?(:\d+)?$/, '');
        if (
          EXTERNAL_PATHS.has(token) ||
          EXTERNAL_PATHS.has(file) ||
          EXTERNAL_PATHS.has(path.basename(file))
        )
          continue;
        if (file.includes('://') || /^[/~]/.test(file)) continue; // URL scheme, absolute or home path
        if (!/^[\w.@/-]+$/.test(file)) continue; // placeholder, call, chord, regex: not a path
        if (/^\d+\/\d+$/.test(file)) continue; // a ratio
        if (!HAS_EXT.test(file) && /^[^/]*\./.test(file)) continue; // Foo.A/B alternatives
        if (file.startsWith('.') && !file.includes('/')) continue; // extension fragment
        if (file.endsWith('.trie.json')) continue;
        const pkgName = file.startsWith('@')
          ? file.split('/').slice(0, 2).join('/')
          : file.split('/')[0];
        if (packages.has(pkgName)) continue;
        claims++;
        if (!pathExists(file, doc)) failures.push({ doc, line: i + 1, token, kind: 'path' });
        const fn = member?.replace(/\(\)$/, '');
        if (fn && /^[A-Za-z_$][\w$]*$/.test(fn)) {
          claims++;
          if (!codeWords.has(fn))
            failures.push({ doc, line: i + 1, token: fn, kind: 'identifier' });
        }
        continue;
      }

      if (!IDENT.test(token) || !isCodeShaped(token)) continue;
      const name = token.replace(/\(\)$/, '').split('.').pop() as string;
      if (EXTERNAL.has(name)) continue;
      claims++;
      if (!codeWords.has(name)) failures.push({ doc, line: i + 1, token, kind: 'identifier' });
    }
  });
}

if (failures.length > 0) {
  console.error(
    `check-doc-claims: ${failures.length} of ${claims} claims name code that does not exist:`
  );
  for (const f of failures) console.error(`  ${f.doc}:${f.line}  ${f.kind} \`${f.token}\``);
  console.error(
    '\nRewrite the sentence in the present tense or delete it; a renamed symbol gets its new name.' +
      '\nA real name from outside this repo goes in EXTERNAL in scripts/check-doc-claims.ts.'
  );
  process.exit(1);
}

console.log(`check-doc-claims: ${claims} claims in ${docs.length} docs, all resolve.`);
