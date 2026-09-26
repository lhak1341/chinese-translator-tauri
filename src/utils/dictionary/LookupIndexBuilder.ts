import { DICTIONARY_LOOKUP } from '../../constants/TranslationConstants.js';

interface LookupIndexOptions {
  lookupIndex?: unknown;
  useSharedLookupIndex?: boolean;
  [key: string]: unknown;
}

interface LookupIndexDictionaryManager {
  flatEntries: Record<string, unknown>;
  getDefaultSearchOrder(): string[];
  getPriorityForDictionary(dictionaryName: string): number;
}

interface LookupIndexBuilderDeps {
  dictionaryManager: LookupIndexDictionaryManager;
  logDebug: (message: string) => void;
  logWarn: (message: string) => void;
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
  { dictionaryManager, logDebug, logWarn }: LookupIndexBuilderDeps
): Promise<void> {
  if (
    options.lookupIndex ||
    text.length < DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX ||
    options.useSharedLookupIndex === false
  ) {
    return;
  }

  try {
    const { rustLookupIndexManager } = await import('../RustLookupIndexManager.js');

    if (!rustLookupIndexManager.isAvailable()) {
      return;
    }

    const indexStartTime = performance.now();
    const dictionaryOrder = dictionaryManager.getDefaultSearchOrder() || [];
    // Real per-dictionary priority, not dictionaryOrder's array position — see CONTEXT.md's
    // LookupIndexBuilder entry (2026-08-07 fix). Mirrors DictionaryWasmLookup's own
    // priorityByName pattern for the same "priority per dictionary name" need on the WASM path.
    const priorityByName = new Map(
      dictionaryOrder.map((name) => [name, dictionaryManager.getPriorityForDictionary(name)])
    );

    const indexResult = await rustLookupIndexManager.buildLookupIndex(
      text,
      dictionaryManager.flatEntries, // Map of dictionary name -> flat entries (computed once at load)
      dictionaryOrder,
      priorityByName,
      {
        minTextLength: 50,
        enableIndexing: true,
        useParallel: true,
      }
    );

    if (indexResult.success && indexResult.index) {
      // Convert to Map for faster lookups; string keys from JSON back to numbers
      options.lookupIndex = new Map(
        Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])
      );
      options.useSharedLookupIndex = true;

      const indexTime = performance.now() - indexStartTime;
      logDebug(
        `🦀 Rust lookup index built: ${indexResult.positionsIndexed} positions, ${indexResult.indexSize} matches in ${indexTime.toFixed(1)}ms (Rust: ${indexResult.buildTimeMs}ms)`
      );
    }
  } catch (error) {
    // No index: phases fall back to traditional per-position lookup.
    logWarn(
      `⚠️ Rust lookup index build failed, using traditional lookup: ${(error as Error).message}`
    );
  }
}
