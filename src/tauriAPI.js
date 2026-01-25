/**
 * Tauri API Wrapper
 *
 * This module provides a compatibility layer between the original Electron API
 * and Tauri's invoke system. It exposes the same interface as window.electronAPI
 * but uses Tauri commands instead of IPC.
 */

import { invoke } from '@tauri-apps/api/core';
import { logger } from './utils/logger.js';

// Create the API object that mimics window.electronAPI
const tauriAPI = {
  /**
   * Read text from clipboard
   * @returns {Promise<string>} The clipboard text content
   */
  readClipboard: async () => {
    try {
      const text = await invoke('read_clipboard');
      return text;
    } catch (error) {
      logger.error('Error reading clipboard:', error);
      throw error;
    }
  },

  /**
   * Save a dictionary to disk
   * @param {string} dictionaryId - The dictionary identifier
   * @param {object} data - The dictionary data
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  saveDictionary: async (dictionaryId, data) => {
    try {
      const result = await invoke('save_dictionary', {
        dictionaryId,
        data,
      });
      if (!result.success && result.error) {
        logger.error('Save dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      logger.error('Error in saveDictionary:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Load a dictionary from disk
   * @param {string} dictionaryId - The dictionary identifier
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  loadDictionary: async (dictionaryId) => {
    try {
      const result = await invoke('load_dictionary', { dictionaryId });
      if (!result.success && result.error !== 'File not found') {
        logger.error('Load dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      logger.error('Error in loadDictionary:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Load multiple dictionaries in parallel using Rust's multi-core parallelization
   * @param {string[]} dictionaryIds - Array of dictionary identifiers to load
   * @returns {Promise<{total: number, successful: number, failed: number, results: Array<{dictionary_id: string, success: boolean, data?: any, error?: string}>}>}
   */
  loadDictionariesParallel: async (dictionaryIds) => {
    try {
      const result = await invoke('load_dictionaries_parallel', { dictionaryIds });
      return result;
    } catch (error) {
      logger.error('Error in loadDictionariesParallel:', error);
      return {
        total: dictionaryIds.length,
        successful: 0,
        failed: dictionaryIds.length,
        results: dictionaryIds.map((id) => ({
          dictionary_id: id,
          success: false,
          error: error.toString(),
        })),
      };
    }
  },

  /**
   * Open the dictionaries folder in the native file explorer
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  openDictionaryFolder: async () => {
    try {
      return await invoke('open_dictionary_folder');
    } catch (error) {
      logger.error('Error in openDictionaryFolder:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * List all proper nouns dictionaries
   * @returns {Promise<{success: boolean, dictionaries?: string[], error?: string}>}
   */
  listProperNounsDictionaries: async () => {
    try {
      return await invoke('list_proper_nouns_dictionaries');
    } catch (error) {
      logger.error('Error in listProperNounsDictionaries:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Create a new proper nouns dictionary
   * @param {string} dictionaryId - The dictionary identifier
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  createProperNounsDictionary: async (dictionaryId) => {
    try {
      return await invoke('create_proper_nouns_dictionary', { dictionaryId });
    } catch (error) {
      logger.error('Error in createProperNounsDictionary:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Rename a proper nouns dictionary
   * @param {string} oldDictionaryId - The current dictionary identifier
   * @param {string} newDictionaryId - The new dictionary identifier
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  renameProperNounsDictionary: async (oldDictionaryId, newDictionaryId) => {
    try {
      return await invoke('rename_proper_nouns_dictionary', {
        oldDictionaryId,
        newDictionaryId,
      });
    } catch (error) {
      logger.error('Error in renameProperNounsDictionary:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Load configuration file
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  loadConfiguration: async () => {
    try {
      return await invoke('load_configuration');
    } catch (error) {
      logger.error('Error in loadConfiguration:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Save configuration file
   * @param {object} config - The configuration object
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  saveConfiguration: async (config) => {
    try {
      return await invoke('save_configuration', { config });
    } catch (error) {
      logger.error('Error in saveConfiguration:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Load appearance settings
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  loadAppearanceSettings: async () => {
    try {
      return await invoke('load_appearance_settings');
    } catch (error) {
      logger.error('Error in loadAppearanceSettings:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Save appearance settings
   * @param {object} settings - The appearance settings object
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  saveAppearanceSettings: async (settings) => {
    try {
      return await invoke('save_appearance_settings', {
        appearanceSettings: settings,
      });
    } catch (error) {
      logger.error('Error in saveAppearanceSettings:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Export all dictionaries to ZIP file
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  exportDictionaries: async () => {
    try {
      return await invoke('export_dictionaries');
    } catch (error) {
      logger.error('Error in exportDictionaries:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Import dictionaries from ZIP file
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  importDictionaries: async () => {
    try {
      return await invoke('import_dictionaries');
    } catch (error) {
      logger.error('Error in importDictionaries:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Reset dictionaries (advanced users)
   * @param {object} options - Reset options (e.g., {backup: true})
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  resetDictionaries: async (options = {}) => {
    try {
      return await invoke('reset_dictionaries', { options });
    } catch (error) {
      logger.error('Error in resetDictionaries:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Update default dictionaries
   * Note: Not yet implemented in Tauri version
   */
  updateDefaultDictionaries: async (dictionaries) => {
    logger.warn('updateDefaultDictionaries: Not yet implemented in Tauri version');
    return { success: false, error: 'Not yet implemented' };
  },

  /**
   * Build comprehensive lookup index using Rust + Rayon for high performance
   * Expected speedup: 6-50x (200-800ms vs 5-10 seconds for 10KB text)
   *
   * @param {string} text - The input text to index
   * @param {Array<{name: string, entries: Array<{chinese: string, vietnamese: string, metadata?: string}>, priority?: number}>} dictionaries - Dictionary data
   * @param {string[]} dictionaryOrder - Order to search dictionaries
   * @param {{minTextLength?: number, enableIndexing?: boolean, useParallel?: boolean}} options - Build options
   * @returns {Promise<{success: boolean, index: Object, buildTimeMs: number, positionsIndexed: number, indexSize: number, error?: string}>}
   */
  buildLookupIndex: async (text, dictionaries, dictionaryOrder, options = {}) => {
    try {
      const result = await invoke('build_lookup_index', {
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
        error: error.toString(),
      };
    }
  },
};

// Expose the API globally to mimic Electron's window.electronAPI
// NOTE: This is the application's public API (Tauri IPC wrapper), NOT a debug API.
// Unlike window.translationEngine or window.performanceDashboard (which expose internal
// state and should be dev-only), window.electronAPI is required for the app to function.
if (typeof window !== 'undefined') {
  window.electronAPI = tauriAPI;
}

export default tauriAPI;
