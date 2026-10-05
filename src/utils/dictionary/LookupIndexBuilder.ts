import { DICTIONARY_LOOKUP } from '../../constants/TranslationConstants.js';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import type { LookupIndexDictionary, LookupIndexEntry } from '../../tauriAPI';
import { logger } from '../logger';
import { FallbackManager } from '../FallbackManager';

interface LookupIndexOptions {
  lookupIndex?: unknown;
  useSharedLookupIndex?: boolean;
  [key: string]: unknown;
}

interface LookupIndexDictionaryManager {
  flatEntries: Map<string, LookupIndexEntry[]> | Record<string, LookupIndexEntry[]>;
  getDefaultSearchOrder(): string[];
  getPriorityForDictionary(dictionaryName: string): number;
}

interface LookupIndexBuilderDeps {
  dictionaryManager: LookupIndexDictionaryManager;
  logWarn: (message: string) => void;
}

// Three consecutive failures stop the Rust build for the rest of the session and show one toast.
// Module state on purpose: it outlives every engine, and a dictionary reload builds a new engine.
const failures = new FallbackManager({
  systemName: 'Rust Lookup Index',
  maxFailures: 3,
  toastMessage: 'High-performance indexing unavailable. Large texts may translate slower.',
  toastId: TOAST_IDS.RUST_INDEX_UNAVAILABLE,
  toastDuration: TOAST_DURATIONS.LOAD_FAILURE,
});

function recordFailure(error: unknown): void {
  failures.recordFailure();
  logger.error(
    `Rust lookup index failure (${failures.getFailureCount()}/${failures.maxFailures}):`,
    error
  );
}

/**
 * The dictionaries in search order, each with its real priority — not its array position, which
 * only matched while every caller pre-sorted by priority (CONTEXT.md, LookupIndexBuilder).
 * A name with no entries is skipped.
 */
function toRustDictionaries(
  dictionaryManager: LookupIndexDictionaryManager,
  dictionaryOrder: string[]
): LookupIndexDictionary[] {
  const { flatEntries } = dictionaryManager;
  const dictionaries: LookupIndexDictionary[] = [];
  for (const name of dictionaryOrder) {
    const entries = flatEntries instanceof Map ? flatEntries.get(name) : flatEntries[name];
    if (!entries) continue;
    dictionaries.push({
      name,
      entries,
      priority: dictionaryManager.getPriorityForDictionary(name),
    });
  }
  return dictionaries;
}

/**
 * Builds a Rust-powered lookup index for `text` and writes it onto `options.lookupIndex`,
 * falling back to no index at all (traditional per-position lookup) on any Rust failure.
 * Mutates `options` in place — no return value — matching the shape both call sites expect.
 *
 * Shared by translateSinglePass and translateWithCharactersOnly (TranslationEngine.js). A JS
 * tier between the two (`DictionaryManager.buildComprehensiveLookupIndex`) was deleted
 * 2026-09-26 — see docs/guides/deleted-symbols.md.
 */
export async function buildLookupIndexOrFallback(
  text: string,
  options: LookupIndexOptions,
  { dictionaryManager, logWarn }: LookupIndexBuilderDeps
): Promise<void> {
  if (
    options.lookupIndex ||
    text.length < DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX ||
    options.useSharedLookupIndex === false ||
    failures.isInFallbackMode()
  ) {
    return;
  }

  try {
    const dictionaryOrder = dictionaryManager.getDefaultSearchOrder() || [];
    const dictionaries = toRustDictionaries(dictionaryManager, dictionaryOrder);

    // Rust applies its own defaults for the minimum text length, indexing and parallelism.
    const startedAt = performance.now();
    const indexResult = await window.electronAPI.buildLookupIndex(
      text,
      dictionaries,
      dictionaryOrder
    );
    // The whole round trip — argument serialization, IPC both ways, Rust — not only Rust's
    // own `buildTimeMs`, which leaves out the payload of every dictionary's entries (~4 MB).
    logger.log(
      `🦀 Lookup index: ${(performance.now() - startedAt).toFixed(1)}ms round trip (Rust ${indexResult.buildTimeMs ?? '?'}ms, ${text.length} chars, ${dictionaries.reduce((n, d) => n + d.entries.length, 0)} entries shipped)`
    );

    if (!indexResult.success || !indexResult.index) {
      recordFailure(indexResult.error);
      return;
    }
    failures.recordSuccess();

    // Convert to Map for faster lookups; string keys from JSON back to numbers
    options.lookupIndex = new Map(
      Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])
    );
    options.useSharedLookupIndex = true;
  } catch (error) {
    // No index: phases fall back to traditional per-position lookup.
    recordFailure(error);
    logWarn(
      `⚠️ Rust lookup index build failed, using traditional lookup: ${(error as Error).message}`
    );
  }
}
