/**
 * DuplicateAnalyzer - Utility for finding duplicate dictionary entries
 *
 * Scans all dictionaries to find entries where the same source text
 * appears with different translations across dictionaries.
 */

import type { DictionaryEntryValue } from '../../types/DictionaryTypes';
import { getDictionaryLabel } from './DictionaryLabels';
import { entryFields } from './EntryValue';

/**
 * Represents a single row in the duplicate view table
 */
export interface DuplicateRow {
  /** Source text (Chinese) */
  source: string;
  /** Translation text (Vietnamese) */
  translation: string;
  /** Dictionary ID (e.g., 'properNouns', 'properNouns-HarryPotter') */
  dictionaryId: string;
  /** Human-readable dictionary label for display */
  dictionaryLabel: string;
  /** Metadata read through `entryFields`: a string-valued entry reads as `false` / `''` */
  metadata?: DuplicateRowMetadata;
}

export interface DuplicateRowMetadata {
  allowAsPatternVariable?: boolean;
  semanticType?: string;
}

/**
 * Finds entries with the same source text that appear in multiple dictionaries.
 * Returns ALL duplicate entries, regardless of whether translations match or differ.
 *
 * @param dictionaries - Map of dictionary ID to dictionary entries
 * @returns Array of duplicate rows sorted by source text, then dictionary name
 *
 * @example
 * const dictionaries = {
 *   'properNouns': { '哈利': 'Harry' },
 *   'properNouns-Novel1': { '哈利': 'Harry' }  // Same translation
 * };
 * const duplicates = findConflictingEntries(dictionaries);
 * // Returns both entries (duplicate source across dictionaries):
 * // [
 * //   { source: '哈利', translation: 'Harry', dictionaryId: 'properNouns', ... },
 * //   { source: '哈利', translation: 'Harry', dictionaryId: 'properNouns-Novel1', ... }
 * // ]
 */
/**
 * Metadata keys that should be excluded from duplicate detection
 * These are internal dictionary metadata, not actual translation entries
 */
const METADATA_KEYS = new Set([
  'checksum',
  'sourceFile',
  'metadata',
  'version',
  '__metadata__',
  '_metadata',
]);

/**
 * Checks if a key should be skipped (metadata or invalid entry)
 */
export function shouldSkipKey(key: string): boolean {
  // Skip metadata keys
  if (METADATA_KEYS.has(key)) {
    return true;
  }
  // Skip keys starting with underscore or dollar sign
  if (key.startsWith('_') || key.startsWith('$')) {
    return true;
  }
  // Skip keys ending with .trie (internal file references)
  if (key.endsWith('.trie')) {
    return true;
  }
  // Skip empty keys
  if (!key || key.trim() === '') {
    return true;
  }
  return false;
}

export function findConflictingEntries(
  dictionaries: Record<string, Record<string, DictionaryEntryValue | string>>
): DuplicateRow[] {
  // Step 1: Build index - source → [{dictId, translation, metadata}]
  const sourceIndex = new Map<
    string,
    Array<{
      dictionaryId: string;
      translation: string;
      metadata?: DuplicateRowMetadata;
    }>
  >();

  for (const [dictId, dict] of Object.entries(dictionaries)) {
    if (!dict) {
      continue;
    }

    // Skip .trie files (internal trie data structures, not dictionaries)
    if (dictId.endsWith('.trie')) {
      continue;
    }

    // Skip characters dictionary (single chars naturally overlap with phrases/proper nouns)
    if (dictId === 'characters') {
      continue;
    }

    for (const [source, value] of Object.entries(dict)) {
      // Skip metadata keys and invalid entries
      if (shouldSkipKey(source)) {
        continue;
      }

      // Extract translation and metadata
      const { translation, allowAsPatternVariable, semanticType } = entryFields(value);
      const metadata = { allowAsPatternVariable, semanticType };

      if (!sourceIndex.has(source)) {
        sourceIndex.set(source, []);
      }
      sourceIndex.get(source)!.push({ dictionaryId: dictId, translation, metadata });
    }
  }

  // Step 2: Filter to entries that appear in multiple dictionaries
  const duplicates: DuplicateRow[] = [];

  for (const [source, entries] of sourceIndex.entries()) {
    if (entries.length > 1) {
      // Add all entries that appear in multiple dictionaries
      for (const entry of entries) {
        duplicates.push({
          source,
          translation: entry.translation,
          dictionaryId: entry.dictionaryId,
          dictionaryLabel: getDictionaryLabel(entry.dictionaryId),
          metadata: entry.metadata,
        });
      }
    }
  }

  // Step 3: Sort by source (groups duplicates together), then by dictionary
  const sorted = duplicates.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }
    return a.dictionaryLabel.localeCompare(b.dictionaryLabel);
  });

  return sorted;
}
