/**
 * Dictionary subsystem public API — only what other modules import through the barrel.
 * Everything else in this directory (DictionaryManager, the trie, the loaders, the id
 * classifier's tier helpers, the validators beyond these) is imported from its own file.
 *
 * Primary entry points:
 *   - sortDictionaryEntries()    — sort a dict by length then alphabetically
 *   - entryFields() / buildEntryMetadata() — read and build a dictionary entry's value
 */

// --- Sorting ---
export { sortDictionaryEntries } from './sortDictionaryEntries';

// --- Duplicate detection ---
export type { DuplicateRow } from './DuplicateAnalyzer';
export { findConflictingEntries } from './DuplicateAnalyzer';

// --- Entry validation ---
export { sanitizeDictionaryEntry } from './DictionaryEntrySanitizer';
export type { EntryFields, EntryPatch } from './EntryValue';
export { buildEntryMetadata, entryFields, applyEntryPatch, toggleVariableType } from './EntryValue';

// --- Dictionary ID classification ---
export {
  isPatternsDict,
  isPhrasesDict,
  isProperNounsDict,
  isLookupTableDict,
  toProperNounsDictionaryId,
  dictionaryNameProblem,
  isFictionProperNounsId,
  getMoveFamily,
  canMoveBetween,
  entryCapabilities,
  showsSemanticType,
} from './DictionaryIdClassifier';

// --- Dictionary reload (one action, triggered from the Translator or the Reader) ---
export { registerDictionaryReload, requestDictionaryReload } from './DictionaryReloadRegistry';
