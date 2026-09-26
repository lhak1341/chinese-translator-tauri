/**
 * Category-indexed lookup into the Rust-built lookup index. The index is keyed by
 * DictionaryCategory; Rust's `DictionaryType::from_name` (lookup_index_engine.rs) is the
 * only code that decides which category a dictionary's matches land in.
 *
 * The Rust-built lookup index uses camelCase field names (e.g.
 * properNouns) — `CategorizedMatches`/`DictionaryMatch` in lookup_index_engine.rs
 * carry `#[serde(rename_all = "camelCase")]`, so there is no snake_case variant
 * to bridge here anymore (there used to be — see git history if you're hunting
 * for why an index lookup by category key ever needed two keys).
 */

import { compareMatchesBySpecificityThenPriority } from './MatchComparator';

export type DictionaryCategory = 'patterns' | 'properNouns' | 'phrases' | 'characters' | 'numbers';

type IndexedMatch = { word: string; priority?: number; [key: string]: unknown };

// Rust stores matches in dictionary-iteration (priority) order, not length order.
// Only site where priority can be missing — default to 0 before the shared comparator,
// which requires priority: number.
function sortMatchesByPrecedence(matches: IndexedMatch[]): IndexedMatch[] {
  return [...matches].sort((a, b) =>
    compareMatchesBySpecificityThenPriority(
      { word: a.word, priority: a.priority ?? 0 },
      { word: b.word, priority: b.priority ?? 0 }
    )
  );
}

/**
 * Returns sorted matches for a position + category from a pre-built lookup index.
 * Sort: longer match first, lower priority number wins on equal length.
 */
export function getIndexedMatches(
  lookupIndex: Map<number, Record<string, IndexedMatch[]>>,
  position: number,
  category: DictionaryCategory
): IndexedMatch[] {
  const positionMatches = lookupIndex.get(position);
  if (!positionMatches) return [];
  const result = positionMatches[category] ?? [];
  return result.length > 1 ? sortMatchesByPrecedence(result) : result;
}
