import { DICTIONARY_LOOKUP } from '../../constants/TranslationConstants.js';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import type { LookupIndexDictionary, LookupIndexEntry } from '../../tauriAPI';
import { logger } from '../logger';
import toast from '../toast';
import { getTextPositionForTokenIndex, reconstructTextFromIndex } from '../TokenHelpers';
import type { TextToken } from '../TokenHelpers';
import { compareMatchesBySpecificityThenPriority } from './MatchComparator';

/**
 * The matches for "which dictionary entries start at this token, in this category" — one
 * question, answered by one of two adapters chosen once per translation:
 *
 * - the Rust lookup index, built for the whole text before the phases run (texts of
 *   `MIN_TEXT_FOR_RUST_INDEX` or more characters, Rust healthy), read per position;
 * - the JS trie (`DictionaryManager.findAllMatches`) over the text that follows the token.
 *
 * Callers never see which one answered. `src/test/fixtures/lookup_index_parity.json` holds
 * both to one definition of a correct answer (ADR-082).
 *
 * Interface: `openMatchSource(text, deps)`, then `source.forPhase(dictionaryOrder)`, which
 * returns `(tokens, pos, category) => matches`, longest first, lower priority number on a tie.
 * `dictionaryOrder` names the dictionaries the phase searches; every one of them must have the
 * Rust category `category` (an id Rust does not recognise counts as `phrases`), as the
 * `properNouns` phase (the properNouns dictionaries) and the character-only pass (`characters`)
 * do. A match carries `word`, `translation`, `dictionary` and `priority`; its `metadata` is
 * the parsed object from the trie and the raw string from the index, and nothing reads it.
 */

export type DictionaryCategory = 'patterns' | 'properNouns' | 'phrases' | 'characters' | 'numbers';

export type Match = {
  word: string;
  priority?: number;
  dictionary?: string;
  [key: string]: unknown;
};

export type MatchesAt = (tokens: TextToken[], pos: number, category: DictionaryCategory) => Match[];

export interface MatchSource {
  forPhase(dictionaryOrder: string[]): MatchesAt;
}

interface MatchSourceDictionaryManager {
  flatEntries: Map<string, LookupIndexEntry[]>;
  getDefaultSearchOrder(): string[];
  getPriorityForDictionary(dictionaryName: string): number;
  findAllMatches(text: string, startPos: number, dictionaryOrder: string[]): Match[];
}

interface MatchSourceDeps {
  dictionaryManager: MatchSourceDictionaryManager;
  logWarn: (message: string) => void;
}

type LookupIndex = Map<number, Record<string, Match[]>>;

// Three consecutive failures stop the Rust build for the rest of the session and show one toast;
// a success in between resets the count, and once stopped it stays stopped.
// Module state on purpose: it outlives every engine, and a dictionary reload builds a new engine.
const MAX_FAILURES = 3;
let consecutiveFailures = 0;
let buildStopped = false;

function recordFailure(error: unknown): void {
  consecutiveFailures++;
  logger.error(`Rust lookup index failure (${consecutiveFailures}/${MAX_FAILURES}):`, error);
  if (consecutiveFailures >= MAX_FAILURES && !buildStopped) {
    buildStopped = true;
    logger.warn('🚨 Rust lookup index entering fallback mode after repeated failures');
    toast.warning('High-performance indexing unavailable. Large texts may translate slower.', {
      duration: TOAST_DURATIONS.LOAD_FAILURE,
      id: TOAST_IDS.RUST_INDEX_UNAVAILABLE,
    });
  }
}

/**
 * The dictionaries in search order, each with its real priority — not its array position, which
 * only matched while every caller pre-sorted by priority (CONTEXT.md, MatchSource).
 * A name with no entries is skipped.
 */
function toRustDictionaries(
  dictionaryManager: MatchSourceDictionaryManager,
  dictionaryOrder: string[]
): LookupIndexDictionary[] {
  const { flatEntries } = dictionaryManager;
  const dictionaries: LookupIndexDictionary[] = [];
  for (const name of dictionaryOrder) {
    const entries = flatEntries.get(name);
    if (!entries) continue;
    dictionaries.push({
      name,
      entries,
      priority: dictionaryManager.getPriorityForDictionary(name),
    });
  }
  return dictionaries;
}

// The index is keyed by code point, tokens by UTF-16 offset: they agree until the first
// surrogate pair. Text with one reads the trie instead — and with no surrogate, `text.length`
// is the code-point count Rust gates on.
const SURROGATE = /[\uD800-\uDFFF]/;

/** The trie adapter: the text that follows the token, up to the next punctuation. */
function trieSource(dictionaryManager: MatchSourceDictionaryManager): MatchSource {
  return {
    forPhase(dictionaryOrder) {
      return (tokens, pos) => {
        if (pos >= tokens.length) {
          logger.error(`⚠️ Token index ${pos} out of bounds (length: ${tokens.length})`);
          return [];
        }
        return dictionaryManager.findAllMatches(
          reconstructTextFromIndex(tokens, pos),
          0,
          dictionaryOrder
        );
      };
    },
  };
}

// Rust stores matches in dictionary-iteration (priority) order, not length order.
// Only site where priority can be missing — default to 0 before the shared comparator,
// which requires priority: number.
function sortMatchesByPrecedence(matches: Match[]): Match[] {
  return [...matches].sort((a, b) =>
    compareMatchesBySpecificityThenPriority(
      { word: a.word, priority: a.priority ?? 0 },
      { word: b.word, priority: b.priority ?? 0 }
    )
  );
}

/**
 * The index adapter. Rust's `DictionaryType::from_name` (lookup_index_engine.rs) alone decides
 * which category a dictionary's matches land in, and it sends ids it does not know to Phrases,
 * harmless only because each phase filters by its own dictionary set — do not drop that filter.
 */
function indexSource(lookupIndex: LookupIndex): MatchSource {
  return {
    forPhase(dictionaryOrder) {
      const dictionarySet = new Set(dictionaryOrder);
      return (tokens, pos, category) => {
        const atPosition = lookupIndex.get(getTextPositionForTokenIndex(tokens, pos));
        const inCategory = atPosition?.[category] ?? [];
        const inSet = inCategory.filter((match) => dictionarySet.has(match.dictionary as string));
        return inSet.length > 1 ? sortMatchesByPrecedence(inSet) : inSet;
      };
    },
  };
}

/**
 * Opens the match source for `text`: builds the Rust index when the text is long enough and
 * Rust is healthy, and otherwise (short text, astral text, circuit open, any Rust failure)
 * reads the JS trie. Never rejects.
 */
export async function openMatchSource(
  text: string,
  { dictionaryManager, logWarn }: MatchSourceDeps
): Promise<MatchSource> {
  const fallback = trieSource(dictionaryManager);
  if (
    text.length < DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX ||
    SURROGATE.test(text) ||
    buildStopped
  ) {
    return fallback;
  }

  try {
    const dictionaryOrder = dictionaryManager.getDefaultSearchOrder() || [];
    const dictionaries = toRustDictionaries(dictionaryManager, dictionaryOrder);

    const startedAt = performance.now();
    const indexResult = await window.electronAPI.buildLookupIndex(
      text,
      dictionaries,
      dictionaryOrder,
      DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX
    );
    // The whole round trip — argument serialization, IPC both ways, Rust — not only Rust's
    // own `buildTimeMs`, which leaves out the payload of every dictionary's entries (~4 MB).
    logger.log(
      `🦀 Lookup index: ${(performance.now() - startedAt).toFixed(1)}ms round trip (Rust ${indexResult.buildTimeMs ?? '?'}ms, ${text.length} chars, ${dictionaries.reduce((n, d) => n + d.entries.length, 0)} entries shipped)`
    );

    if (!indexResult.success || !indexResult.index) {
      recordFailure(indexResult.error);
      return fallback;
    }
    consecutiveFailures = 0;

    // Convert to Map for faster lookups; string keys from JSON back to numbers
    return indexSource(
      new Map(Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])) as LookupIndex
    );
  } catch (error) {
    recordFailure(error);
    logWarn(
      `⚠️ Rust lookup index build failed, using traditional lookup: ${(error as Error).message}`
    );
    return fallback;
  }
}
