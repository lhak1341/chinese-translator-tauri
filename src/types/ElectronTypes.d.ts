/**
 * Electron API types for IPC communication
 *
 * Type definitions for Electron main/renderer process communication via the electronAPI bridge.
 * This file ensures type safety when using window.electronAPI in renderer process.
 *
 * Usage: Types are automatically available via global Window interface augmentation.
 */

import type { AppConfiguration, DictionaryInfo, AppearanceSettings } from './ComponentTypes';
import type { DictionaryData } from './DictionaryTypes';
import type { TransformRule } from './TransformRuleTypes';
import type {
  BookFingerprint,
  BookLines,
  BookRecords,
  LibraryScan,
  OpenBookResult,
} from './ReaderTypes';

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
 * Proper-nouns dictionary creation result. `dictionaries`, when present, is the true
 * post-operation `activeProperNouns` list (Rust re-reads config.json rather than
 * assuming its own best-effort activation write succeeded) — callers should sync active
 * dictionary state from this field instead of assuming creation activates.
 */
export interface ProperNounsListResult extends ElectronResult {
  /** Updated activeProperNouns list after creation, if the command reports one */
  dictionaries?: string[];
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
// File Selection Types
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

export interface ElectronAPI {
  // Dictionary operations
  /** Load a dictionary from file system */
  loadDictionary: (path: string) => Promise<DictionaryLoadResult>;
  /** Load multiple dictionaries in parallel (Rust multi-core parallelization) */
  loadDictionariesParallel: (dictionaryIds: string[]) => Promise<BatchDictionaryResponse>;
  /** Save dictionary data to file system */
  saveDictionary: (path: string, data: any) => Promise<SaveResult>;
  /** List all available proper nouns dictionaries */
  listProperNounsDictionaries: () => Promise<DictionaryListResult>;
  /** List all fiction structural pattern dictionaries (patterns-f_*) */
  listFictionPatternDictionaries: () => Promise<DictionaryListResult>;
  /** Create a new proper nouns dictionary */
  createProperNounsDictionary: (id: string) => Promise<ProperNounsListResult>;
  /** Create a new fiction structural patterns dictionary (patterns-f_*) */
  createStructuralPatternsDictionary: (id: string) => Promise<SaveResult>;
  /** Atomically create a fiction proper nouns dictionary together with its paired patterns-f_* dictionary (ADR-027) */
  createFictionDictionaryPair: (properNounId: string) => Promise<ProperNounsListResult>;
  /** Rename a proper nouns dictionary (cascades to paired patterns-f_* file) */
  renameProperNounsDictionary: (
    oldDictionaryId: string,
    newDictionaryId: string
  ) => Promise<DictionaryOperationResult>;
  /** Rename a structural patterns dictionary */
  renameStructuralPatternsDictionary: (
    oldDictionaryId: string,
    newDictionaryId: string
  ) => Promise<DictionaryOperationResult>;

  // Configuration operations
  /** Load application configuration */
  loadConfiguration: () => Promise<ConfigurationResult>;
  /** Save application configuration */
  saveConfiguration: (config: AppConfiguration) => Promise<SaveResult>;

  // Appearance operations
  /** Load appearance settings */
  loadAppearanceSettings: () => Promise<AppearanceResult>;
  /** Save appearance settings */
  saveAppearanceSettings: (settings: AppearanceSettings) => Promise<SaveResult>;

  // Transform Rule operations
  /** Load persisted Transform Rules */
  loadTransformRules: () => Promise<TransformRulesResult>;
  /** Save the full Transform Rule list */
  saveTransformRules: (rules: TransformRule[]) => Promise<SaveResult>;

  // Book record operations
  /** Load persisted book records, keyed by fingerprint */
  loadBookRecords: () => Promise<BookRecordsResult>;
  /** Save the full book records map */
  saveBookRecords: (records: BookRecords) => Promise<SaveResult>;

  // File operations
  /** Open file selection dialog */
  selectFile: (options: FileSelectOptions) => Promise<FileSelectResult>;
  /** Open directory selection dialog */
  selectDirectory: (options: DirectorySelectOptions) => Promise<DirectorySelectResult>;
  /** Open dictionaries folder in system file explorer */
  openDictionaryFolder: () => Promise<ElectronResult>;

  // Dictionary bulk operations
  /** Export all dictionaries to ZIP file */
  exportDictionaries: () => Promise<DictionaryOperationResult>;
  /** Import dictionaries from ZIP file */
  importDictionaries: () => Promise<DictionaryOperationResult>;

  // Clipboard operations
  /** Read text from clipboard */
  readClipboard: () => Promise<string>;
  /** Write text to clipboard */
  writeClipboard: (text: string) => Promise<void>;

  // Window operations
  /** Minimize application window */
  minimizeWindow: () => void;
  /** Maximize/restore application window */
  maximizeWindow: () => void;
  /** Close application window */
  closeWindow: () => void;

  // Reader operations (see src/types/ReaderTypes.ts — these reject on failure rather
  // than returning a success envelope)
  /** List every text file in the library folder */
  scanLibrary: (libraryPath?: string | null) => Promise<LibraryScan>;
  /** Decode a book into the Rust-side cache */
  openBook: (
    fileName: string,
    libraryPath?: string | null,
    encodingOverride?: string | null
  ) => Promise<OpenBookResult>;
  /** Read lines [start, end) of the open book */
  readBookLines: (fingerprint: string, start: number, end: number) => Promise<BookLines>;
  /** Drop the cached book */
  closeBook: (fingerprint?: string | null) => Promise<boolean>;
  /** Fingerprint one library file without decoding it */
  fingerprintBook: (fileName: string, libraryPath?: string | null) => Promise<BookFingerprint>;

  // Development tools
  /** Open developer tools */
  openDevTools: () => void;
  /** Reload application window */
  reloadWindow: () => void;
}

// =============================================================================
// Global Window Interface Augmentation
// =============================================================================

declare global {
  interface Window {
    /** Electron API bridge for IPC communication */
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

// Export empty object to make this a module
export {};
