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
