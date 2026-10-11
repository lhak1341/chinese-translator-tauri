/**
 * The scan every source-reading guard test shares: which files are production source, and
 * that source without its comments. Guards (`SourceConventionScan`, `EngineAccess.guard`,
 * `TauriApiAccessPath`, `IpcCommands.parity`, `WasmCascadeDiscipline`) each carried their own
 * copy, and the copies disagreed (comment rule, skipped directories). A new guard imports
 * this file instead of writing a fifth walker.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

/** Directories no guard treats as production source. */
const DEFAULT_SKIP_DIRS = ['__tests__', 'test', 'node_modules', '__devtools__'];

const SOURCE_FILE = /\.(js|jsx|ts|tsx)$/;
const NOT_PRODUCTION_FILE = /\.(test|spec)\.[jt]sx?$|\.d\.ts$/;

interface SourceScanOptions {
  /** Directory names skipped at any depth. Replaces the default list. */
  skipDirs?: readonly string[];
  /** Paths relative to `dir`, forward slashes, trailing slash for a directory (`'wasm/'`). */
  skipPaths?: readonly string[];
}

/**
 * Absolute paths of the `.js/.jsx/.ts/.tsx` files under `dir`, minus test files, `.spec.`
 * files and `.d.ts` declarations. Directory order is the filesystem's, so sort before
 * comparing lists.
 */
export function productionSources(
  dir: string,
  { skipDirs = DEFAULT_SKIP_DIRS, skipPaths = [] }: SourceScanOptions = {}
): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (skipDirs.includes(entry.name)) continue;
        if (skipPaths.includes(`${rel}/`)) continue;
        walk(full);
      } else if (SOURCE_FILE.test(entry.name) && !NOT_PRODUCTION_FILE.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Line and block comments carry violating snippets as prose examples; strip before scanning.
 * `//` after a `:` is kept, so `https://x` survives. A `//` inside a string literal is still
 * read as a comment: acceptable for a scan, wrong for a parser.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
