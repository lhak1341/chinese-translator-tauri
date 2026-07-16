/**
 * Tauri API Wrapper
 *
 * Typed IPC seam between JS/TS callers and the Rust backend.
 * All Rust command names are constants — a rename surfaces here as a build error.
 */

import { invoke } from '@tauri-apps/api/core';
import { logger } from './utils/logger.js';
import type {
  ElectronResult,
  DictionaryLoadResult,
  BatchDictionaryResponse,
  SaveResult,
  DictionaryOperationResult,
  ConfigurationResult,
  AppearanceResult,
} from './types/ElectronTypes';
import type { AppConfiguration, AppearanceSettings } from './types/ComponentTypes';

// ── Rust command name constants ───────────────────────────────────────────────
const CMD = {
  READ_CLIPBOARD: 'read_clipboard',
  SAVE_DICTIONARY: 'save_dictionary',
  LOAD_DICTIONARY: 'load_dictionary',
  LOAD_DICTIONARIES_PARALLEL: 'load_dictionaries_parallel',
  OPEN_DICTIONARY_FOLDER: 'open_dictionary_folder',
  LIST_PROPER_NOUNS_DICTIONARIES: 'list_proper_nouns_dictionaries',
  LIST_FICTION_PATTERN_DICTIONARIES: 'list_fiction_pattern_dictionaries',
  CREATE_PROPER_NOUNS_DICTIONARY: 'create_proper_nouns_dictionary',
  CREATE_STRUCTURAL_PATTERNS_DICTIONARY: 'create_structural_patterns_dictionary',
  CREATE_FICTION_DICTIONARY_PAIR: 'create_fiction_dictionary_pair',
  RENAME_PROPER_NOUNS_DICTIONARY: 'rename_proper_nouns_dictionary',
  RENAME_STRUCTURAL_PATTERNS_DICTIONARY: 'rename_structural_patterns_dictionary',
  LOAD_CONFIGURATION: 'load_configuration',
  SAVE_CONFIGURATION: 'save_configuration',
  LOAD_APPEARANCE_SETTINGS: 'load_appearance_settings',
  SAVE_APPEARANCE_SETTINGS: 'save_appearance_settings',
  EXPORT_DICTIONARIES: 'export_dictionaries',
  IMPORT_DICTIONARIES: 'import_dictionaries',
  RESET_DICTIONARIES: 'reset_dictionaries',
  BUILD_LOOKUP_INDEX: 'build_lookup_index',
} as const;

// ── Tauri-specific types ──────────────────────────────────────────────────────

interface ProperNounsListResult extends ElectronResult {
  dictionaries?: string[];
}

export interface ResetDictionariesOptions {
  backup?: boolean;
}

export interface LookupIndexEntry {
  chinese: string;
  vietnamese: string;
  metadata?: string;
}

export interface LookupIndexDictionary {
  name: string;
  entries: LookupIndexEntry[];
  priority?: number;
}

export interface LookupIndexOptions {
  minTextLength?: number;
  enableIndexing?: boolean;
  useParallel?: boolean;
}

export interface LookupIndexResult extends ElectronResult {
  index: Record<string, unknown>;
  buildTimeMs: number;
  positionsIndexed: number;
  indexSize: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

// CODE REVIEW FIX (CRITICAL-2): Whitelist validation for dictionary IDs to prevent path traversal
const VALID_DICTIONARY_ID = /^[a-zA-Z0-9_.-]+$/;

function validateDictionaryId(dictionaryId: string): boolean {
  if (!dictionaryId || typeof dictionaryId !== 'string') return false;
  if (!VALID_DICTIONARY_ID.test(dictionaryId)) return false;
  if (dictionaryId.includes('..') || dictionaryId.includes('/') || dictionaryId.includes('\\'))
    return false;
  if (dictionaryId.startsWith('/') || /^[a-zA-Z]:/.test(dictionaryId)) return false;
  return true;
}

// ── API ───────────────────────────────────────────────────────────────────────

const tauriAPI = {
  readClipboard: async (): Promise<string> => {
    try {
      return await invoke<string>(CMD.READ_CLIPBOARD);
    } catch (error) {
      logger.error('Error reading clipboard:', error);
      throw error;
    }
  },

  saveDictionary: async (dictionaryId: string, data: unknown): Promise<SaveResult> => {
    if (!validateDictionaryId(dictionaryId)) {
      logger.error('Invalid dictionary ID format:', dictionaryId);
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      const result = await invoke<SaveResult>(CMD.SAVE_DICTIONARY, { dictionaryId, data });
      if (!result.success && result.error) {
        logger.error('Save dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      logger.error('Error in saveDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  loadDictionary: async (dictionaryId: string): Promise<DictionaryLoadResult> => {
    if (!validateDictionaryId(dictionaryId)) {
      logger.error('Invalid dictionary ID format:', dictionaryId);
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      const result = await invoke<DictionaryLoadResult>(CMD.LOAD_DICTIONARY, { dictionaryId });
      if (!result.success && result.error !== 'File not found') {
        logger.error('Load dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      logger.error('Error in loadDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  loadDictionariesParallel: async (dictionaryIds: string[]): Promise<BatchDictionaryResponse> => {
    const invalidIds = dictionaryIds.filter((id) => !validateDictionaryId(id));
    if (invalidIds.length > 0) {
      logger.error('Invalid dictionary ID format(s):', invalidIds);
      return {
        total: dictionaryIds.length,
        successful: 0,
        failed: dictionaryIds.length,
        results: dictionaryIds.map((id) => ({
          dictionary_id: id,
          success: false,
          error: validateDictionaryId(id)
            ? 'Batch validation failed'
            : 'Invalid dictionary ID format (no path traversal allowed)',
        })),
      };
    }
    try {
      return await invoke<BatchDictionaryResponse>(CMD.LOAD_DICTIONARIES_PARALLEL, {
        dictionaryIds,
      });
    } catch (error) {
      logger.error('Error in loadDictionariesParallel:', error);
      return {
        total: dictionaryIds.length,
        successful: 0,
        failed: dictionaryIds.length,
        results: dictionaryIds.map((id) => ({
          dictionary_id: id,
          success: false,
          error: String(error),
        })),
      };
    }
  },

  openDictionaryFolder: async (): Promise<ElectronResult> => {
    try {
      return await invoke<ElectronResult>(CMD.OPEN_DICTIONARY_FOLDER);
    } catch (error) {
      logger.error('Error in openDictionaryFolder:', error);
      return { success: false, error: String(error) };
    }
  },

  listProperNounsDictionaries: async (): Promise<ProperNounsListResult> => {
    try {
      return await invoke<ProperNounsListResult>(CMD.LIST_PROPER_NOUNS_DICTIONARIES);
    } catch (error) {
      logger.error('Error in listProperNounsDictionaries:', error);
      return { success: false, error: String(error) };
    }
  },

  listFictionPatternDictionaries: async (): Promise<ProperNounsListResult> => {
    try {
      return await invoke<ProperNounsListResult>(CMD.LIST_FICTION_PATTERN_DICTIONARIES);
    } catch (error) {
      logger.error('Error in listFictionPatternDictionaries:', error);
      return { success: false, error: String(error) };
    }
  },

  createProperNounsDictionary: async (dictionaryId: string): Promise<SaveResult> => {
    if (!validateDictionaryId(dictionaryId)) {
      logger.error('Invalid dictionary ID format:', dictionaryId);
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      return await invoke<SaveResult>(CMD.CREATE_PROPER_NOUNS_DICTIONARY, { dictionaryId });
    } catch (error) {
      logger.error('Error in createProperNounsDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  createStructuralPatternsDictionary: async (dictionaryId: string): Promise<SaveResult> => {
    if (!validateDictionaryId(dictionaryId)) {
      logger.error('Invalid dictionary ID format:', dictionaryId);
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      return await invoke<SaveResult>(CMD.CREATE_STRUCTURAL_PATTERNS_DICTIONARY, { dictionaryId });
    } catch (error) {
      logger.error('Error in createStructuralPatternsDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  createFictionDictionaryPair: async (properNounId: string): Promise<SaveResult> => {
    if (!validateDictionaryId(properNounId)) {
      logger.error('Invalid dictionary ID format:', properNounId);
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      return await invoke<SaveResult>(CMD.CREATE_FICTION_DICTIONARY_PAIR, { properNounId });
    } catch (error) {
      logger.error('Error in createFictionDictionaryPair:', error);
      return { success: false, error: String(error) };
    }
  },

  renameProperNounsDictionary: async (
    oldDictionaryId: string,
    newDictionaryId: string
  ): Promise<DictionaryOperationResult> => {
    if (!validateDictionaryId(oldDictionaryId) || !validateDictionaryId(newDictionaryId)) {
      logger.error('Invalid dictionary ID format:', { oldDictionaryId, newDictionaryId });
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      return await invoke<DictionaryOperationResult>(CMD.RENAME_PROPER_NOUNS_DICTIONARY, {
        oldDictionaryId,
        newDictionaryId,
      });
    } catch (error) {
      logger.error('Error in renameProperNounsDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  renameStructuralPatternsDictionary: async (
    oldDictionaryId: string,
    newDictionaryId: string
  ): Promise<DictionaryOperationResult> => {
    if (!validateDictionaryId(oldDictionaryId) || !validateDictionaryId(newDictionaryId)) {
      logger.error('Invalid dictionary ID format:', { oldDictionaryId, newDictionaryId });
      return { success: false, error: 'Invalid dictionary ID format (no path traversal allowed)' };
    }
    try {
      return await invoke<DictionaryOperationResult>(CMD.RENAME_STRUCTURAL_PATTERNS_DICTIONARY, {
        oldDictionaryId,
        newDictionaryId,
      });
    } catch (error) {
      logger.error('Error in renameStructuralPatternsDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  loadConfiguration: async (): Promise<ConfigurationResult> => {
    try {
      return await invoke<ConfigurationResult>(CMD.LOAD_CONFIGURATION);
    } catch (error) {
      logger.error('Error in loadConfiguration:', error);
      return { success: false, error: String(error) };
    }
  },

  saveConfiguration: async (config: AppConfiguration): Promise<SaveResult> => {
    try {
      return await invoke<SaveResult>(CMD.SAVE_CONFIGURATION, { config });
    } catch (error) {
      logger.error('Error in saveConfiguration:', error);
      return { success: false, error: String(error) };
    }
  },

  loadAppearanceSettings: async (): Promise<AppearanceResult> => {
    try {
      return await invoke<AppearanceResult>(CMD.LOAD_APPEARANCE_SETTINGS);
    } catch (error) {
      logger.error('Error in loadAppearanceSettings:', error);
      return { success: false, error: String(error) };
    }
  },

  saveAppearanceSettings: async (settings: AppearanceSettings): Promise<SaveResult> => {
    try {
      return await invoke<SaveResult>(CMD.SAVE_APPEARANCE_SETTINGS, {
        appearanceSettings: settings,
      });
    } catch (error) {
      logger.error('Error in saveAppearanceSettings:', error);
      return { success: false, error: String(error) };
    }
  },

  exportDictionaries: async (): Promise<DictionaryOperationResult> => {
    try {
      return await invoke<DictionaryOperationResult>(CMD.EXPORT_DICTIONARIES);
    } catch (error) {
      logger.error('Error in exportDictionaries:', error);
      return { success: false, error: String(error) };
    }
  },

  importDictionaries: async (): Promise<DictionaryOperationResult> => {
    try {
      return await invoke<DictionaryOperationResult>(CMD.IMPORT_DICTIONARIES);
    } catch (error) {
      logger.error('Error in importDictionaries:', error);
      return { success: false, error: String(error) };
    }
  },

  resetDictionaries: async (
    options: ResetDictionariesOptions = {}
  ): Promise<DictionaryOperationResult> => {
    try {
      return await invoke<DictionaryOperationResult>(CMD.RESET_DICTIONARIES, { options });
    } catch (error) {
      logger.error('Error in resetDictionaries:', error);
      return { success: false, error: String(error) };
    }
  },

  updateDefaultDictionaries: async (_dictionaries: unknown): Promise<SaveResult> => {
    logger.warn('updateDefaultDictionaries: Not yet implemented in Tauri version');
    return { success: false, error: 'Not yet implemented' };
  },

  buildLookupIndex: async (
    text: string,
    dictionaries: LookupIndexDictionary[],
    dictionaryOrder: string[],
    options: LookupIndexOptions = {}
  ): Promise<LookupIndexResult> => {
    try {
      const result = await invoke<LookupIndexResult>(CMD.BUILD_LOOKUP_INDEX, {
        text,
        dictionaries,
        dictionaryOrder,
        options: {
          minTextLength: options.minTextLength,
          enableIndexing: options.enableIndexing,
          useParallel: options.useParallel,
        },
      });
      if (result.success && result.buildTimeMs && process.env.NODE_ENV === 'development') {
        logger.log(
          `🦀 Lookup index built in ${result.buildTimeMs}ms (${result.positionsIndexed} positions, ${result.indexSize} matches)`
        );
      }
      return result;
    } catch (error) {
      logger.error('Error in buildLookupIndex:', error);
      return {
        success: false,
        index: {},
        buildTimeMs: 0,
        positionsIndexed: 0,
        indexSize: 0,
        error: String(error),
      };
    }
  },
};

// Expose the API globally to mimic Electron's window.electronAPI
// NOTE: This is the application's public API (Tauri IPC wrapper), NOT a debug API.
// Unlike window.translationEngine or window.performanceDashboard (which expose internal
// state and should be dev-only), window.electronAPI is required for the app to function.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = tauriAPI;
}

export default tauriAPI;
