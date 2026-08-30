#!/usr/bin/env node
/**
 * Rebuild the WASM bundle if it is older than the Rust sources it was built from.
 *
 * `src/wasm/` is gitignored wasm-pack output. `pnpm dev`, `pnpm build`, `pnpm tauri:dev` and
 * `pnpm tauri:build` all rebuild it first, but `pnpm test` did not — so editing wasm-core and
 * running the test suite validated the *previous* binary and passed, which is worse than
 * failing. This makes that state unreachable: stale output is rebuilt before tests run.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(root, 'src', 'wasm', 'translation_wasm_core_bg.wasm');

// wasm-core/src also holds generated wasm-pack output; scanning it would always look newer.
const GENERATED = new Set(['wasm', 'wasm-core', 'pkg', 'target']);

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (GENERATED.has(entry.name)) continue;
      newest = Math.max(newest, newestMtime(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.rs')) {
      newest = Math.max(newest, statSync(path.join(dir, entry.name)).mtimeMs);
    }
  }
  return newest;
}

let newestSource = newestMtime(path.join(root, 'wasm-core', 'src'));
for (const f of ['Cargo.toml', 'Cargo.lock']) {
  const p = path.join(root, 'wasm-core', f);
  if (existsSync(p)) newestSource = Math.max(newestSource, statSync(p).mtimeMs);
}

const built = existsSync(artifact) ? statSync(artifact).mtimeMs : 0;

if (built >= newestSource) {
  console.log('wasm: build output is up to date with wasm-core sources.');
  process.exit(0);
}

console.log(
  built === 0
    ? 'wasm: no build output found — building.'
    : 'wasm: build output is older than wasm-core sources — rebuilding.'
);
execFileSync('pnpm', ['run', 'build-wasm-dev'], { cwd: root, stdio: 'inherit' });
