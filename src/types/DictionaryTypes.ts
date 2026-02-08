/**
 * Shared type definitions for dictionary entries and metadata
 */

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
    };

/**
 * Metadata for dictionary operations
 */
export interface DictionaryEntryMetadata {
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
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
export type HistoryOperationType = 'add' | 'update' | 'delete' | 'bulk_delete';

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
  /** For bulk_delete: all deleted entries for rollback */
  oldEntries?: Array<{ source: string; value: DictionaryEntryValue }>;
  /** For update: old source key if it changed */
  oldSource?: string;
  timestamp: number;
}
