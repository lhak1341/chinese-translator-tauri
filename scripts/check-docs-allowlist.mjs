#!/usr/bin/env node
/**
 * Fails when a markdown file outside the allowlist is in the git index.
 *
 * Docs here describe the code as it is. History (what was tried, removed, reviewed or
 * planned) belongs in commit messages, and retired documents are read from git
 * (docs/README.md "Archive"). A new .md has to be added to this list on purpose.
 *
 * Reads the index, not the working tree: an unstaged draft does not fail, a staged one does.
 * Index entries already deleted on disk are skipped, so a removal passes before it is staged.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_PATTERNS = [
  /^(.+\/)?CLAUDE\.md$/,
  /^docs\/adr\/ADR-\d{3}-[A-Za-z0-9-]+\.md$/,
  /^docs\/guides\/[a-z0-9-]+\.md$/,
];

const ALLOWED_FILES = new Set([
  'GLOSSARY.md',
  'README.md',
  'docs/README.md',
  'docs/CSP_SECURITY.md',
  'docs/HOTKEYS.md',
  'docs/adr/README.md',
  'docs/agents/issue-tracker.md',
  'docs/prototypes/README.md',
  'memory/MEMORY.md',
  'tests/README.md',
  'vendor/lhak-style/fonts/README.md',
  'wasm-core/WARNINGS.md',
]);

const indexed = execFileSync('git', ['ls-files', '--cached', '-z', '--', '*.md'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

if (indexed.length === 0) {
  console.error('check-docs-allowlist: git ls-files returned no markdown; refusing to pass.');
  process.exit(1);
}

const present = indexed.filter((file) => existsSync(path.join(root, file)));
const offenders = present.filter(
  (file) => !ALLOWED_FILES.has(file) && !ALLOWED_PATTERNS.some((pattern) => pattern.test(file))
);

if (offenders.length > 0) {
  console.error('Markdown outside the docs allowlist:');
  for (const file of offenders) console.error(`  ${file}`);
  console.error(
    '\nPut the content in an existing guide, a scoped CLAUDE.md, an ADR or a commit message.' +
      '\nIf none fits, add the path to scripts/check-docs-allowlist.mjs.'
  );
  process.exit(1);
}

console.log(`check-docs-allowlist: ${present.length} markdown files, all allowed.`);
