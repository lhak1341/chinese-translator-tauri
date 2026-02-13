/**
 * DuplicateAnalyzer - Utility for finding duplicate dictionary entries
 *
 * Scans all dictionaries to find entries where the same source text
 * appears with different translations across dictionaries.
 */

import type { DictionaryEntryValue } from '../types/DictionaryTypes';
import {
  getDictionaryLabel,
  getDictionaryDropdownLabel,
  compareDictionaryOrder,
} from './dictionaryHelpers';
export { getDictionaryLabel, getDictionaryDropdownLabel, compareDictionaryOrder };

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
  /** Metadata for patterns/phrases (if applicable) */
  metadata?: {
    allowAsPatternVariable?: boolean;
    lowPriority?: boolean;
  };
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
function shouldSkipKey(key: string): boolean {
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
  dictionaries: Record<string, Record<string, DictionaryEntryValue>>
): DuplicateRow[] {
  // Step 1: Build index - source → [{dictId, translation, metadata}]
  const sourceIndex = new Map<
    string,
    Array<{
      dictionaryId: string;
      translation: string;
      metadata?: { allowAsPatternVariable?: boolean; lowPriority?: boolean };
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
      const translation = typeof value === 'string' ? value : value.translation;
      const metadata =
        typeof value === 'object'
          ? {
              allowAsPatternVariable: value.allowAsPatternVariable,
              lowPriority: value.lowPriority,
            }
          : undefined;

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

/**
 * Creates a unique composite key for a duplicate row
 * Used for selection tracking since source alone is not unique
 *
 * SECURITY: Validates that neither component contains "::" to prevent ambiguous keys
 *
 * IMPORTANT: This function throws if source or dictionaryId contains "::", but
 * parseDuplicateKey can handle source text with "::" using lastIndexOf. This asymmetry
 * is intentional:
 * - createDuplicateKey: Prevents CREATION of ambiguous keys (strict validation)
 * - parseDuplicateKey: Allows PARSING of legacy data with "::" in source (uses lastIndexOf)
 *
 * This design prevents new ambiguous keys while gracefully handling existing data.
 *
 * @param source - Source text
 * @param dictionaryId - Dictionary ID
 * @returns Composite key in format "source::dictionaryId"
 * @throws Error if source or dictionaryId contains "::" separator
 */
export function createDuplicateKey(source: string, dictionaryId: string): string {
  // Validate inputs to prevent ambiguous keys
  if (source.includes('::')) {
    throw new Error('Source text cannot contain "::" separator');
  }
  if (dictionaryId.includes('::')) {
    throw new Error('Dictionary ID cannot contain "::" separator');
  }

  return `${source}::${dictionaryId}`;
}

/**
 * Parses a composite key back into source and dictionaryId
 *
 * SECURITY: Uses lastIndexOf to handle source text containing "::" separator
 * This prevents DoS attacks and undefined dictionaryId errors. By using lastIndexOf,
 * a key like "a::b::properNouns" is parsed as source="a::b", dictionaryId="properNouns".
 *
 * NOTE: While createDuplicateKey prevents creation of keys with "::" in source,
 * this function can parse such keys if they exist (e.g., from legacy data).
 * See createDuplicateKey documentation for the rationale behind this asymmetry.
 *
 * @param key - Composite key in format "source::dictionaryId"
 * @returns Object with source and dictionaryId
 * @throws Error if key format is invalid
 */
export function parseDuplicateKey(key: string): { source: string; dictionaryId: string } {
  // Use lastIndexOf to handle source text containing ::
  const separatorIndex = key.lastIndexOf('::');

  // Validate: separator must exist and not be at start/end
  if (separatorIndex === -1 || separatorIndex === 0 || separatorIndex === key.length - 2) {
    throw new Error('Invalid duplicate key format');
  }

  return {
    source: key.substring(0, separatorIndex),
    dictionaryId: key.substring(separatorIndex + 2),
  };
}
