import { DICTIONARY_LOOKUP } from '../../constants/TranslationConstants.js';

interface LookupIndexOptions {
  lookupIndex?: unknown;
  useSharedLookupIndex?: boolean;
  [key: string]: unknown;
}

interface LookupIndexDictionaryManager {
  flatEntries: Record<string, unknown>;
  getDefaultSearchOrder(): string[];
  buildComprehensiveLookupIndex(
    text: string,
    options: { enableLookupIndexing: boolean }
  ): Promise<Map<number, unknown>>;
}

interface LookupIndexBuilderDeps {
  dictionaryManager: LookupIndexDictionaryManager;
  logDebug: (message: string) => void;
  logWarn: (message: string) => void;
}

/**
 * Builds a Rust-powered lookup index for `text` and writes it onto `options.lookupIndex`,
 * falling back to a JS-computed comprehensive index on Rust failure, and to no index at all
 * (traditional per-position lookup) if both tiers fail. Mutates `options` in place — no return
 * value — matching the shape both call sites already expect.
 *
 * Shared by translateSinglePass and translateWithCharactersOnly (TranslationEngine.js) — was
 * duplicated verbatim between the two before unification, with translateWithCharactersOnly
 * silently missing the JS-fallback tier.
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

    const indexResult = await rustLookupIndexManager.buildLookupIndex(
      text,
      dictionaryManager.flatEntries, // Map of dictionary name -> flat entries (computed once at load)
      dictionaryOrder,
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
    logWarn(
      `⚠️ Rust lookup index build failed, falling back to JavaScript indexing: ${(error as Error).message}`
    );

    try {
      const jsIndexStartTime = performance.now();
      const jsLookupIndex = await dictionaryManager.buildComprehensiveLookupIndex(text, {
        enableLookupIndexing: true,
      });
      options.lookupIndex = jsLookupIndex;
      options.useSharedLookupIndex = true;

      const jsIndexTime = performance.now() - jsIndexStartTime;
      logDebug(
        `📋 JavaScript lookup index built: ${jsLookupIndex.size} positions in ${jsIndexTime.toFixed(1)}ms`
      );
    } catch (jsError) {
      logWarn(
        `⚠️ JavaScript lookup index build failed, using traditional lookup: ${(jsError as Error).message}`
      );
      // Final fallback: continue without lookup index
    }
  }
}
