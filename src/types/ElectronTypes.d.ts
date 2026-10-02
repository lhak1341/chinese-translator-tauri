/**
 * Result types for the Tauri IPC wrapper (`src/tauriAPI.ts`), and the `window.electronAPI`
 * declaration. The name is from the Electron days; the global kept it.
 *
 * `ElectronAPI` is derived from `tauriAPI`, not declared here: a command is declared once, in
 * the wrapper, so the type cannot drift from what the wrapper implements.
 *
 * Usage: Types are automatically available via global Window interface augmentation.
 */

import type { AppConfiguration, DictionaryInfo, AppearanceSettings } from './ComponentTypes';
import type { DictionaryData } from './DictionaryTypes';
import type { TransformRule } from './TransformRuleTypes';
import type { BookRecords } from './ReaderTypes';

// =============================================================================
// Result Types
// =============================================================================

/**
 * Generic success/error result type
 */
export interface ElectronResult<T = any> {
  /** Whether operation succeeded */
  success: boolean;
  /** Result data (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** Set by the four app-file loads when the file could not be read and was renamed aside
   * (the new file name) — see `utils/appFile.ts`. */
  quarantined?: string;
}

/**
 * Dictionary load result
 */
export interface DictionaryLoadResult extends ElectronResult<any> {
  /** Dictionary data */
  data?: any;
}

/**
 * Dictionary list result
 */
export interface DictionaryListResult extends ElectronResult<DictionaryInfo[]> {
  /** List of available dictionaries */
  dictionaries?: DictionaryInfo[];
}

/**
 * Proper-nouns dictionary listing result: the ids on disk.
 */
export interface ProperNounsListResult extends ElectronResult {
  dictionaries?: string[];
}

/**
 * Proper-nouns dictionary creation result. The command only creates files. Activating the
 * dictionary is a separate step (`BookBindingStore.createDictionary`), and `warning` is
 * what that step reports when the dictionary exists but could not be activated.
 */
export interface DictionaryCreateResult extends ElectronResult {
  warning?: string;
}

/**
 * Configuration load result
 */
export interface ConfigurationResult extends ElectronResult<AppConfiguration> {
  /** Configuration data */
  data?: AppConfiguration;
}

/**
 * Appearance settings load result
 */
export interface AppearanceResult extends ElectronResult<AppearanceSettings> {
  /** Appearance settings data */
  data?: AppearanceSettings;
}

/**
 * Transform rules load result
 */
export interface TransformRulesResult extends ElectronResult<TransformRule[]> {
  /** Persisted Transform Rule list */
  data?: TransformRule[];
}

/**
 * Book records load result
 */
export interface BookRecordsResult extends ElectronResult<BookRecords> {
  /** Persisted book records, keyed by fingerprint */
  data?: BookRecords;
}

/**
 * Save operation result
 */
export interface SaveResult extends ElectronResult {
  // success and error inherited from ElectronResult
}

/**
 * Dictionary operation result with message
 */
export interface DictionaryOperationResult extends ElectronResult {
  /** Success/error message */
  message?: string;
}

// =============================================================================

/**
 * File filter for file selection dialogs
 */
export interface FileFilter {
  /** Filter name (e.g., 'Images', 'Documents') */
  name: string;
  /** File extensions (e.g., ['png', 'jpg']) */
  extensions: string[];
}

/**
 * Options for file selection dialog
 */
export interface FileSelectOptions {
  /** Dialog title */
  title?: string;
  /** Default path to open dialog in */
  defaultPath?: string;
  /** Button label */
  buttonLabel?: string;
  /** File type filters */
  filters?: FileFilter[];
  /** Selection properties */
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
}

/**
 * File selection result
 */
export interface FileSelectResult {
  /** Whether user canceled the dialog */
  canceled: boolean;
  /** Selected file paths */
  filePaths: string[];
}

/**
 * Options for directory selection dialog
 */
export interface DirectorySelectOptions {
  /** Dialog title */
  title?: string;
  /** Default path to open dialog in */
  defaultPath?: string;
  /** Button label */
  buttonLabel?: string;
}

/**
 * Directory selection result
 */
export interface DirectorySelectResult {
  /** Whether user canceled the dialog */
  canceled: boolean;
  /** Selected directory paths */
  filePaths: string[];
}

// =============================================================================
// Electron API Interface
// =============================================================================

/**
 * Complete Electron API exposed via preload script
 */
/**
 * Batch dictionary loading result (for parallel operations)
 */
export interface BatchDictionaryResult {
  dictionary_id: string;
  success: boolean;
  data?: DictionaryData;
  error?: string;
}

/**
 * Batch dictionary loading response
 */
export interface BatchDictionaryResponse {
  total: number;
  successful: number;
  failed: number;
  results: BatchDictionaryResult[];
}

// =============================================================================
// Global Window Interface Augmentation
// =============================================================================

declare global {
  interface Window {
    /** The Tauri IPC wrapper (`src/tauriAPI.ts`), installed there. Its type is the module's own,
     * so a command is declared once, in the wrapper. */
    electronAPI: ElectronAPI;
    /** Translation engine instance (development mode only) */
    translationEngine?: any;
    /** Performance dashboard (development mode only) */
    performanceDashboard?: any;
    /** System performance monitor (development mode only) */
    systemPerformanceMonitor?: any;
    /** Check real memory usage (development mode only) */
    checkRealMemory?: () => void;
  }
}

/** The shape of `window.electronAPI`: whatever `tauriAPI.ts` implements. */
export type ElectronAPI = typeof import('../tauriAPI').default;
