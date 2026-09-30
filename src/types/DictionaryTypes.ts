/**
 * Shared type definitions for dictionary entries and metadata
 */

import type { SemanticType, PatternSemanticTypeRef } from '../constants/SemanticTypes';
import type { EntryFields, EntryPatch } from '../utils/dictionary/EntryValue';
import type { DictionaryTypesCollection } from './ComponentTypes';

/**
 * Dictionary entry value type (can be string or object with metadata)
 * Used across all dictionary operations and components
 */
export type DictionaryEntryValue = {
  translation: string;
  allowAsPatternVariable?: boolean;
  semanticType?: SemanticType | PatternSemanticTypeRef;
  allowedVariableTypes?: Record<string, string[]>;
};

/**
 * Metadata for dictionary operations
 */
export interface DictionaryEntryMetadata {
  allowAsPatternVariable?: boolean;
  semanticType?: SemanticType | PatternSemanticTypeRef;
  allowedVariableTypes?: Record<string, string[]>;
}

/**
 * Dictionary data structure (key-value pairs)
 * String values are used by pure lookup-table dicts (characters, conversion, punctuation).
 * Complex entry dicts (phrases, properNouns, patterns) always use DictionaryEntryValue objects.
 */
export interface DictionaryData {
  [key: string]: DictionaryEntryValue | string;
}

/**
 * Entry data structure for editing or creating dictionary entries
 */
export interface EditingEntryData {
  source: string;
  translation: string | DictionaryEntryValue;
  allowAsPatternVariable?: boolean;
  /** Owning dictionary — differs from the table's selected one in the duplicate view. */
  dictionaryId?: string;
}

/**
 * Entry data structure for moving a dictionary entry to another dictionary
 */
export interface MoveEntryData {
  source: string;
  translation: string;
  /** Owning dictionary — differs from the table's selected one in the duplicate view. */
  dictionaryId: string;
}

/**
 * Existing-entry detection result for the DictionaryEntry form
 */
export interface ExistingEntryData {
  dictionaryId: string;
  dictionaryName: string;
  source: string;
  translation: string;
  isSelectedDictionary: boolean;
}

/**
 * Sorting statistics returned by IncrementalDictionarySorter
 */
export interface SortingStats {
  fullSorts: number;
  incrementalSorts: number;
  timeSaved: number;
  averageFullSortTime: number;
  averageIncrementalSortTime: number;
  totalSorts: number;
  timeSavedSeconds: string;
  efficiencyGain: string;
  incrementalPercentage: string;
}

/**
 * Interface for DictionaryContext. `setSelectedDictionary` is declared by the
 * concrete context value since its return type depends on loading strategy.
 */
export interface DictionaryContextInterface {
  /** All loaded dictionaries */
  dictionaries: { [key: string]: DictionaryData };
  /** Dictionaries whose file failed to load; each is absent from `dictionaries`, and edits
   * to it are refused until a Reload reads it (CONTEXT.md "Unread dictionary"). */
  unreadDictionaryIds: string[];
  /** Whether initial loading is in progress */
  isLoading: boolean;
  /**
   * Error message from initial dictionary load failure, or null on success.
   * Consumers (e.g. Translator) MUST check this before initializing the
   * translation engine — `dictionaries` will be `{}` on failure and the
   * engine would otherwise initialize with empty tries, producing garbage
   * translations with no user feedback.
   */
  loadError: string | null;
  /** Add a new entry to dictionary */
  addEntry: (
    dictionaryId: string,
    source: string,
    translation: string,
    metadata?: DictionaryEntryMetadata
  ) => Promise<void>;
  /** Update an existing entry */
  updateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: DictionaryEntryMetadata
  ) => Promise<void>;
  /**
   * Change some fields of an existing entry, leaving the rest as stored. Reads the current
   * value itself, so callers pass only what changes — never a snapshot of the other fields.
   * The patch may be a function of the current fields (toggling one allowed variable type).
   * An empty `semanticType`/`allowedVariableTypes` removes the key; a string value is written
   * back as an object; a lookup table keeps only `translation`. Goes through `updateEntry`,
   * so history, toasts and engine invalidation are the same. See `utils/dictionary/EntryValue.ts`.
   */
  patchEntry: (
    dictionaryId: string,
    source: string,
    patch: EntryPatch | ((current: EntryFields) => EntryPatch)
  ) => Promise<void>;
  /**
   * Re-key an entry to a new source, keeping every other field as stored when the commit runs.
   * Like `patchEntry`, it reads the current value itself; callers pass no snapshot.
   */
  renameEntry: (dictionaryId: string, oldSource: string, newSource: string) => Promise<void>;
  /** Delete an entry from dictionary */
  deleteEntry: (dictionaryId: string, source: string) => Promise<void>;
  /** Delete multiple entries from a dictionary in one operation */
  bulkDeleteEntries: (
    dictionaryId: string,
    sources: string[]
  ) => Promise<{ successCount: number; errors: string[] }>;
  /** Move a single entry between dictionaries atomically */
  moveEntry: (
    sourceDictId: string,
    targetDictId: string,
    source: string,
    targetDictLabel: string
  ) => Promise<void>;
  /** Move multiple entries between dictionaries atomically */
  bulkMoveEntries: (
    sourceDictId: string,
    targetDictId: string,
    sources: string[],
    targetDictLabel: string
  ) => Promise<{ movedCount: number; errors: string[] }>;
  /** Undo last operation */
  undo: () => Promise<boolean>;
  /** Redo previously undone operation */
  redo: () => Promise<boolean>;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Forget undo history — after dictionaries were rewritten outside it (import) */
  clearHistory: () => void;
  /** Every dictionary that exists, with its label — kept by the Dictionary Store, refreshed by
   * the operations that can change it (reload of a new id, rename, reload all). */
  dictionaryTypes: DictionaryTypesCollection;
  /** Read one dictionary from disk (CONTEXT.md "Dictionary Store"). A failed read makes it
   * unread; a new id is listed. */
  loadDictionary: (dictionaryId: string) => Promise<void>;
  /** Apply renames Rust already made on disk — load each new id, drop each old one — in one
   * turn of the store's queue. Clears history: its edits name the old ids. */
  applyRename: (renames: ReadonlyArray<readonly [string, string]>) => Promise<void>;
  /** Re-read every dictionary for force reload; resolves to what memory then holds. */
  reloadAllDictionaries: () => Promise<{ [key: string]: DictionaryData }>;
  /** Re-read every dictionary after import rewrote the files: invalidates the engine for each,
   * and clears history in the same turn. */
  reloadAfterImport: () => Promise<void>;
  /** Currently selected dictionary */
  selectedDictionary: string;
  /** Get sorting statistics */
  getSortingStats: () => SortingStats;
  /** Reset sorting statistics */
  resetSortingStats: () => void;
}
