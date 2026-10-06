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
 *
 * It also holds each command's ARGUMENT KEYS (architecture review 2026-10-06, candidate #4):
 * Tauri maps a JS key to a Rust parameter by name (camelCase to snake_case) and ignores a key
 * it does not know, so a renamed `Option` parameter turned the wrapper's key into a silent
 * `None`. Response shapes (`LibraryScan`, `OpenBookResult`, ...) are NOT checked: they are
 * written by hand on both sides, and checking them wants codegen (`ts-rs`, `specta`), which
 * this repo does not use. ADR-081 records why, and what would reopen it.
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

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const camel = (name: string): string =>
  name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Splits on commas outside any (), [], {}, <> nesting. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('<([{'.includes(ch)) depth++;
    if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The text between a bracket at `open` and its match. */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(' || text[i] === '{') depth++;
    if (text[i] === ')' || text[i] === '}') depth--;
    if (depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('unbalanced brackets while scanning');
}

interface RustParam {
  name: string;
  required: boolean;
}

/** Each command's data parameters: what the frontend sends, not what Tauri injects. */
function rustCommandParams(): Map<string, RustParam[]> {
  const injected = /^(tauri::)?(AppHandle|State|Window|WebviewWindow)\b/;
  const head =
    /#\[tauri::command\]\s*(?:#\[[^\]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
  const commands = new Map<string, RustParam[]>();
  for (const file of rustFiles(RUST_SRC)) {
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const match of text.matchAll(head)) {
      const open = (match.index ?? 0) + match[0].length - 1;
      const params = splitTopLevel(balanced(text, open)).flatMap((param) => {
        const colon = param.indexOf(':');
        const type = param.slice(colon + 1).trim();
        return injected.test(type)
          ? []
          : [{ name: camel(param.slice(0, colon).trim()), required: !/^Option\s*</.test(type) }];
      });
      commands.set(match[1], params);
    }
  }
  return commands;
}

/** Every `CMD.X, { ...keys }` call site in the wrapper: the keys the frontend sends. */
function wrapperCalls(): Array<{ command: string; keys: string[] }> {
  const source = stripComments(readFileSync(join(process.cwd(), 'src', 'tauriAPI.ts'), 'utf8'));
  const commandOf = CMD as Record<string, string>;
  return [...source.matchAll(/CMD\.([A-Z_]+)\s*(?:,\s*(undefined\b|\{)|\))/g)].map((match) => {
    const command = commandOf[match[1]];
    if (!command) throw new Error(`CMD.${match[1]} is not in the CMD map`);
    // `invoke(CMD.X)` and `(CMD.X, undefined, ...)` send no arguments.
    if (match[2] !== '{') return { command, keys: [] };
    const body = balanced(source, (match.index ?? 0) + match[0].length - 1);
    const keys = splitTopLevel(body).map((entry) => entry.split(':')[0].trim());
    return { command, keys };
  });
}

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

describe('IPC commands — argument keys', () => {
  const rust = rustCommandParams();
  const calls = wrapperCalls();

  test('the extraction found the signatures and every wrapper call (a broken scan would pass everything below)', () => {
    expect(rust.size).toBeGreaterThan(25);
    expect(new Set(calls.map((call) => call.command))).toEqual(new Set(wrapped));
  });

  test('camelCase mapping holds: no command renames its arguments', () => {
    const renamed = rustFiles(RUST_SRC).filter((file) =>
      /#\[tauri::command\([^)]*rename_all/.test(readFileSync(file, 'utf8'))
    );
    expect(renamed).toEqual([]);
  });

  test('every key a wrapper sends is a parameter Rust takes (Tauri ignores an unknown key)', () => {
    const unknown = calls.flatMap(({ command, keys }) => {
      const known = new Set((rust.get(command) ?? []).map((param) => param.name));
      return keys.filter((key) => !known.has(key)).map((key) => `${command}: ${key}`);
    });
    expect(unknown).toEqual([]);
  });

  test('every required Rust parameter is sent (an Option parameter may be left out)', () => {
    const missing = calls.flatMap(({ command, keys }) =>
      (rust.get(command) ?? [])
        .filter((param) => param.required && !keys.includes(param.name))
        .map((param) => `${command}: ${param.name}`)
    );
    expect(missing).toEqual([]);
  });
});
