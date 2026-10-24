/**
 * Result types for the Tauri IPC wrapper (`src/tauriAPI.ts`), and the `window.electronAPI`
 * declaration. The name is from the Electron days; the global kept it (renaming it is its own
 * change — see GLOSSARY.md "tauriAPI"). `window.electronAPI` is the only way production code
 * reaches the adapter; `TauriApiAccessPath.test.js` enforces it.
 *
 * `ElectronAPI` is derived from `tauriAPI`, not declared here: a command is declared once, in
 * the wrapper, so the type cannot drift from what the wrapper implements.
 *
 * Usage: Types are automatically available via global Window interface augmentation.
 */

import type { AppConfiguration, AppearanceSettings } from './ComponentTypes';
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
 * Proper-nouns dictionary listing result: the ids on disk.
 */
export interface ProperNounsListResult extends ElectronResult {
  dictionaries?: string[];
}

/**
 * Proper-nouns dictionary creation result. The command only creates files; activating the
 * dictionary is a separate step whose outcome is `DictionaryCreateOutcome`
 * (`components/BookBindingStore.ts`).
 */
export type DictionaryCreateResult = ElectronResult;

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
// Batch Dictionary Loading
// =============================================================================

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
  }
}

/** The shape of `window.electronAPI`: whatever `tauriAPI.ts` implements. */
export type ElectronAPI = typeof import('../tauriAPI').default;
