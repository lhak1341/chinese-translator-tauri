/**
 * Dictionary pairs — creating and renaming proper-nouns dictionaries, on disk and in memory.
 *
 * A fiction (`properNouns-f_X`) or generic (`properNouns-_X`) dictionary is a **pair** with
 * its patterns half (`patterns-f_X` / `patterns-_X`), coupled by name (ADR-027, ADR-048); a
 * custom one (`properNouns-Foo`) is a single file. Rust creates and renames a pair as one
 * operation. What Rust cannot do is update the app's in-memory `dictionaries`, so every
 * caller used to re-derive which halves to load and drop — the Configuration tab for
 * generic and custom dictionaries, `BookBindingContext` for fiction. This module is that
 * rule, once: the command plus its memory side.
 *
 * `ops` is `DictionaryContext`'s own `loadDictionary`/`applyRename` — operations on the
 * Dictionary Store's queue (ADR-055) — injected so the module is testable with fakes.
 */

import { callRustConfigWrite } from '../appConfig';
import { logger } from '../logger';
import { listFictionPatternDictionaryIds } from './DictionaryBackend';
import { hasPairedPatterns, toPatternsId } from './DictionaryIdClassifier';
import type { DictionaryCreateResult } from '../../types/ElectronTypes';

export interface DictionaryPairOps {
  loadDictionary: (dictionaryId: string) => Promise<void>;
  /** Loads each new id and drops each old one, in one turn of the store's queue. */
  applyRename: (renames: ReadonlyArray<readonly [string, string]>) => Promise<void>;
}

/** Every file a proper-nouns dictionary consists of: itself, then its patterns half if paired. */
function halvesOf(properNounsId: string): string[] {
  return hasPairedPatterns(properNounsId)
    ? [properNounsId, toPatternsId(properNounsId)]
    : [properNounsId];
}

/**
 * Create a proper-nouns dictionary — the pair, or the single file for a custom one — and
 * load every half it created. Returns Rust's result unchanged. Creates files only: Rust
 * writes no config here, so there is no `callRustConfigWrite`, and activating the new
 * dictionary is the caller's (`BookBindingStore.createDictionary`). A failed create loads
 * nothing.
 */
export async function createDictionary(
  properNounsId: string,
  ops: DictionaryPairOps
): Promise<DictionaryCreateResult> {
  const result = await (hasPairedPatterns(properNounsId)
    ? window.electronAPI.createFictionDictionaryPair(properNounsId)
    : window.electronAPI.createProperNounsDictionary(properNounsId));
  if (!result.success) return result;
  for (const id of halvesOf(properNounsId)) await ops.loadDictionary(id);
  return result;
}

/**
 * Rename a proper-nouns dictionary. Rust moves both halves of a pair; this then swaps every
 * half in memory as one store operation, so no edit plans against a map holding old and new
 * ids at once. A failed rename touches nothing in memory.
 */
export async function renameDictionary(
  oldId: string,
  newId: string,
  ops: DictionaryPairOps
): Promise<{ success: boolean; error?: string }> {
  const result = await callRustConfigWrite(() =>
    window.electronAPI.renameProperNounsDictionary(oldId, newId)
  );
  if (!result.success) return { success: false, error: result.error };
  // Which halves moved is the old id's question — Rust cascades by what the file was.
  const moves: [string, string][] = [[oldId, newId]];
  if (hasPairedPatterns(oldId)) moves.push([toPatternsId(oldId), toPatternsId(newId)]);
  await ops.applyRename(moves);
  return { success: true };
}

/**
 * Create the patterns half of any paired dictionary that lacks one — dictionaries made before
 * their tier was paired (generic ones before ADR-048). Non-fatal: a failure only logs, since
 * the proper-nouns half works without it.
 */
export async function createMissingPatternHalves(
  properNounsIds: readonly string[],
  ops: Pick<DictionaryPairOps, 'loadDictionary'>
): Promise<void> {
  try {
    const existing = new Set(await listFictionPatternDictionaryIds());
    for (const id of properNounsIds.filter(hasPairedPatterns)) {
      const patternsId = toPatternsId(id);
      if (existing.has(patternsId)) continue;
      await window.electronAPI.createStructuralPatternsDictionary(patternsId);
      await ops.loadDictionary(patternsId);
    }
  } catch (cause) {
    logger.warn('Paired pattern dictionary migration failed (non-fatal):', cause);
  }
}
