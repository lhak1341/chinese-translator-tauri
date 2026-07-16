/**
 * Pure utilities for dictionary category classification and category-indexed lookup.
 *
 * Two concerns share this file because they are two sides of the same abstraction:
 * `isDictionaryCategory` classifies a dictionary name into a DictionaryCategory;
 * `getIndexedMatches` reads from an index keyed by those same categories.
 * DictionaryCategory is authoritative here.
 *
 * camelCase↔snake_case bridge: the JS lookup index uses camelCase field names
 * (e.g. properNouns); a Rust-built index uses snake_case (e.g. proper_nouns).
 * `getIndexedMatches` normalises both.
 */

import { compareMatchesBySpecificityThenPriority } from './MatchComparator';

export type DictionaryCategory = 'patterns' | 'properNouns' | 'phrases' | 'characters' | 'numbers';

type IndexedMatch = { word: string; priority?: number; [key: string]: unknown };

// Rust-built indexes use snake_case; only properNouns actually differs.
const RUST_KEY: Record<DictionaryCategory, string> = {
  properNouns: 'proper_nouns',
  phrases: 'phrases',
  characters: 'characters',
  patterns: 'patterns',
  numbers: 'numbers',
};

// Rust stores matches in dictionary-iteration (priority) order, not length order.
// JS-built index entries are already sorted by findAllMatchesSequential, but a
// re-sort is harmless (TimSort on pre-sorted input is O(n)).
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
 * Returns true when a dictionary name belongs to the given phase category.
 * Classification is name-convention only — no instance state required.
 */
export function isDictionaryCategory(name: string, category: DictionaryCategory): boolean {
  switch (category) {
    case 'patterns':
      return name.includes('pattern');
    case 'properNouns':
      return (
        name.includes('proper') ||
        name.includes('noun') ||
        name.includes('character') ||
        name.includes('place')
      );
    case 'phrases':
      return name.includes('phrase') || name === 'phrases';
    case 'characters':
      return name === 'characters';
    case 'numbers':
      return name.includes('number');
  }
}

/**
 * Returns sorted matches for a position + category from a pre-built lookup index.
 * Handles both JS-built (camelCase) and Rust-built (snake_case) index field names.
 * Sort: longer match first, lower priority number wins on equal length.
 */
export function getIndexedMatches(
  lookupIndex: Map<number, Record<string, IndexedMatch[]>>,
  position: number,
  category: DictionaryCategory
): IndexedMatch[] {
  const positionMatches = lookupIndex.get(position);
  if (!positionMatches) return [];
  const matches = positionMatches[category] ?? positionMatches[RUST_KEY[category]];
  const result = matches ?? [];
  return result.length > 1 ? sortMatchesByPrecedence(result) : result;
}
