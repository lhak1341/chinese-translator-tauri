/**
 * Electron API types for IPC communication
 *
 * Type definitions for Electron main/renderer process communication via the electronAPI bridge.
 * This file ensures type safety when using window.electronAPI in renderer process.
 *
 * Usage: Types are automatically available via global Window interface augmentation.
 */

import type { AppConfiguration, DictionaryInfo, AppearanceSettings } from './ComponentTypes';

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
  data?: any;
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
  /** Create a new proper nouns dictionary */
  createProperNounsDictionary: (id: string) => Promise<SaveResult>;
  /** Rename a proper nouns dictionary */
  renameProperNounsDictionary: (
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
  }
}

// Export empty object to make this a module
export {};
