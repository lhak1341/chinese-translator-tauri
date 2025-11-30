/**
 * Tauri API Wrapper
 *
 * This module provides a compatibility layer between the original Electron API
 * and Tauri's invoke system. It exposes the same interface as window.electronAPI
 * but uses Tauri commands instead of IPC.
 */

import { invoke } from '@tauri-apps/api/core';

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
      console.error('Error reading clipboard:', error);
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
        console.error('Save dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      console.error('Error in saveDictionary:', error);
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
        console.error('Load dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      console.error('Error in loadDictionary:', error);
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
      console.error('Error in loadDictionariesParallel:', error);
      return {
        total: dictionaryIds.length,
        successful: 0,
        failed: dictionaryIds.length,
        results: dictionaryIds.map(id => ({
          dictionary_id: id,
          success: false,
          error: error.toString()
        }))
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
      console.error('Error in openDictionaryFolder:', error);
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
      console.error('Error in listProperNounsDictionaries:', error);
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
      console.error('Error in createProperNounsDictionary:', error);
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
      console.error('Error in loadConfiguration:', error);
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
      console.error('Error in saveConfiguration:', error);
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
      console.error('Error in loadAppearanceSettings:', error);
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
      console.error('Error in saveAppearanceSettings:', error);
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
      console.error('Error in exportDictionaries:', error);
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
      console.error('Error in importDictionaries:', error);
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
      console.error('Error in resetDictionaries:', error);
      return { success: false, error: error.toString() };
    }
  },

  /**
   * Update default dictionaries
   * Note: Not yet implemented in Tauri version
   */
  updateDefaultDictionaries: async (dictionaries) => {
    console.warn('updateDefaultDictionaries: Not yet implemented in Tauri version');
    return { success: false, error: 'Not yet implemented' };
  },
};

// Expose the API globally to mimic Electron's window.electronAPI
if (typeof window !== 'undefined') {
  window.electronAPI = tauriAPI;
}

export default tauriAPI;
