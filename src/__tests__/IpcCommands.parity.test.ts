/**
 * The IPC command list is held to Rust's by this test, not by convention (architecture
 * review 2026-10-03, candidate #4 grilling). CONTEXT.md's tauriAPI entry says "adding a
 * command is a Rust function plus a wrapper here"; three ways that goes wrong silently:
 * a `#[tauri::command]` fn nobody registered in `generate_handler!` (invoke fails at
 * runtime: "command not found"), a `CMD` name Rust does not register, and a registered
 * command with no wrapper (dead surface).
 *
 * It reads the Rust source as text, so it checks what is really there, with a regex
 * where a macro would otherwise hide it. If this test breaks on a Rust refactor, fix the
 * extraction below, not the assertions.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CMD } from '../tauriAPI';

const RUST_SRC = join(process.cwd(), 'src-tauri', 'src');

function rustFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? rustFiles(join(dir, entry.name))
      : entry.name.endsWith('.rs')
        ? [join(dir, entry.name)]
        : []
  );
}

/** Names inside `tauri::generate_handler![ ... ]`, without their module paths. */
function registeredCommands(): string[] {
  const lib = readFileSync(join(RUST_SRC, 'lib.rs'), 'utf8');
  const start = lib.indexOf('generate_handler![');
  if (start === -1) throw new Error('generate_handler![ not found in src-tauri/src/lib.rs');
  const body = lib.slice(start + 'generate_handler!['.length, lib.indexOf(']', start));
  return body
    .split(',')
    .map((item) => item.trim().split('::').pop() ?? '')
    .filter((name) => name.length > 0);
}

/** Every fn under a `#[tauri::command]` attribute, in any Rust file. */
function declaredCommands(): string[] {
  const pattern =
    /#\[tauri::command\]\s*(?:#\[[^\]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/g;
  return rustFiles(RUST_SRC).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(pattern)].map((m) => m[1])
  );
}

const wrapped = Object.values(CMD) as string[];

describe('IPC commands — tauriAPI CMD vs the Rust handler list', () => {
  test('the extraction found the lists (a broken regex would pass everything below)', () => {
    expect(registeredCommands().length).toBeGreaterThan(20);
    expect(declaredCommands().length).toBeGreaterThan(20);
  });

  test('every CMD name is registered in generate_handler!', () => {
    const registered = new Set(registeredCommands());
    expect(wrapped.filter((name) => !registered.has(name))).toEqual([]);
  });

  test('every registered command has a CMD wrapper', () => {
    const names = new Set(wrapped);
    expect(registeredCommands().filter((name) => !names.has(name))).toEqual([]);
  });

  test('every #[tauri::command] fn is registered', () => {
    const registered = new Set(registeredCommands());
    expect(declaredCommands().filter((name) => !registered.has(name))).toEqual([]);
  });

  test('no command is registered twice', () => {
    const registered = registeredCommands();
    expect(registered.filter((name, i) => registered.indexOf(name) !== i)).toEqual([]);
  });
});
