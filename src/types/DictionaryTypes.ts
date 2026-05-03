/**
 * Shared type definitions for dictionary entries and metadata
 */

import type { SemanticType } from '../constants/SemanticTypes';

/**
 * Dictionary entry value type (can be string or object with metadata)
 * Used across all dictionary operations and components
 */
export type DictionaryEntryValue =
  | string
  | {
      translation: string;
      allowAsPatternVariable?: boolean;
      lowPriority?: boolean;
      semanticType?: SemanticType;
      allowedVariableTypes?: Record<string, string[]>;
    };

/**
 * Metadata for dictionary operations
 */
export interface DictionaryEntryMetadata {
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
  semanticType?: SemanticType;
  allowedVariableTypes?: Record<string, string[]>;
}

/**
 * Dictionary data structure (key-value pairs)
 */
export interface DictionaryData {
  [key: string]: DictionaryEntryValue;
}

/**
 * History operation type for undo/redo
 */
export type HistoryOperationType =
  | 'add'
  | 'update'
  | 'delete'
  | 'bulk_delete'
  | 'move'
  | 'bulk_move';

/**
 * Entry data structure for editing or creating dictionary entries
 */
export interface EditingEntryData {
  source: string;
  translation: string | DictionaryEntryValue;
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
}

/**
 * Entry data structure for moving a dictionary entry to another dictionary
 */
export interface MoveEntryData {
  source: string;
  translation: string;
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
 * Delta-based history operation for undo/redo
 * Stores only changed entries instead of entire dictionaries
 * Memory savings: ~98% reduction (5.4GB → 100MB for 100 operations)
 */
export interface HistoryOperation {
  dictionaryId: string;
  operation: HistoryOperationType;
  /** For add/update: new entry data */
  entry?: { source: string; value: DictionaryEntryValue };
  /** For update/delete: original entry data for rollback */
  oldEntry?: { source: string; value: DictionaryEntryValue };
  /** For bulk_delete/bulk_move: all affected entries */
  oldEntries?: Array<{ source: string; value: DictionaryEntryValue }>;
  /** For update: old source key if it changed */
  oldSource?: string;
  /** For move/bulk_move: the destination dictionary */
  targetDictionaryId?: string;
  timestamp: number;
}

/**
 * Interface for DictionaryContext. `setSelectedDictionary` is declared by the
 * concrete context value since its return type depends on loading strategy.
 */
export interface DictionaryContextInterface {
  /** All loaded dictionaries */
  dictionaries: { [key: string]: DictionaryData };
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
  /** Load a specific dictionary */
  loadDictionary: (dictionaryId: string) => Promise<void>;
  /** Currently selected dictionary */
  selectedDictionary: string;
  /** Get sorting statistics */
  getSortingStats: () => SortingStats;
  /** Reset sorting statistics */
  resetSortingStats: () => void;
}
