/**
 * Shared type definitions for dictionary entries and metadata
 */

import type { SemanticType, PatternSemanticTypeRef } from '../constants/SemanticTypes';
import type { EntryFields, EntryPatch } from '../utils/dictionary/EntryValue';
import type { DictionaryTypesCollection } from './ComponentTypes';
import type { ImportOutcome } from '../components/dictionary/DictionaryStore';
import type { LoadOutcome } from '../utils/dictionary/DictionaryLoadClassifier';
import type { EntryRef, NewEntry } from '../utils/dictionary/DictionaryEdit';

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
 * Interface for DictionaryContext. `setSelectedDictionary` is declared by the
 * concrete context value since its return type depends on loading strategy.
 */
export interface DictionaryContextInterface {
  /** All loaded dictionaries */
  dictionaries: { [key: string]: DictionaryData };
  /** Dictionaries whose file failed to load; each is absent from `dictionaries`, and edits
   * to it are refused until a Reload reads it (GLOSSARY.md "Unread dictionary"). */
  unreadDictionaryIds: string[];
  /** Whether initial loading is in progress */
  isLoading: boolean;
  /**
   * Error message when the last full load (startup, force reload, import) read no dictionary
   * or threw, or null otherwise — the Dictionary Store's `lastLoad`, so a later good load
   * clears it.
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
  /**
   * Add many entries, each to its own dictionary, as one Dictionary Edit (one undo, all or
   * nothing on disk). Toasts its own outcome; rejects, already toasted, on failure.
   */
  addEntries: (rows: NewEntry[]) => Promise<void>;
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
   * so history and toasts are the same. See `utils/dictionary/EntryValue.ts`.
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
  /**
   * Delete one entry or many, from any number of dictionaries, as one Dictionary Edit (one undo,
   * all or nothing on disk). Toasts its own outcome; rejects, already toasted, on failure.
   */
  bulkDeleteEntries: (targets: EntryRef[]) => Promise<{ count: number; missing: EntryRef[] }>;
  /**
   * Move one entry or many between dictionaries as one Dictionary Edit. Nothing found rejects
   * (no toast: `MoveDialog` shows it); some missing succeeds with a warning toast.
   */
  moveEntries: (
    sourceDictId: string,
    targetDictId: string,
    sources: string[],
    targetDictLabel: string
  ) => Promise<void>;
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
  /** Read one dictionary from disk (GLOSSARY.md "Dictionary Store"). A failed read makes it
   * unread; a new id is listed. */
  loadDictionary: (dictionaryId: string) => Promise<void>;
  /** Apply renames Rust already made on disk — load each new id, drop each old one — in one
   * turn of the store's queue. Clears history: its edits name the old ids. */
  applyRename: (renames: ReadonlyArray<readonly [string, string]>) => Promise<void>;
  /** What memory holds right now, read from the store rather than the last render — for a
   * caller that rebuilds the engine right after a store operation, before React re-renders. */
  getDictionaries: () => { [key: string]: DictionaryData };
  /** Re-read every dictionary for force reload; resolves to what memory then holds and how
   * the load went (a `critical` outcome means no dictionary loaded). */
  reloadAllDictionaries: () => Promise<{
    dictionaries: { [key: string]: DictionaryData };
    outcome: LoadOutcome;
  }>;
  /** Imports dictionary files and re-reads every dictionary, clearing history (ADR-055). */
  importDictionaries: () => Promise<ImportOutcome>;
  /** Currently selected dictionary */
  selectedDictionary: string;
}
