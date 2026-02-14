/**
 * Configuration Helper Utilities
 *
 * REFACTOR (2026-01-28): Extracts common configuration loading patterns
 * to reduce duplication across 13+ call sites.
 *
 * Provides both imperative utilities and React hooks for configuration management.
 */

import { logger } from './logger';
import { validateApiResult } from './configValidation';
import type { AppConfiguration } from '../types/ComponentTypes';

/**
 * Load and validate configuration
 *
 * Performs structure validation (ElectronAPI result) and returns the configuration.
 * The returned configuration is the raw data - callers should provide defaults for missing fields.
 *
 * @returns {Promise<AppConfiguration>} Configuration object
 * @throws {Error} If configuration cannot be loaded
 *
 * @example
 * try {
 *   const config = await loadValidatedConfiguration();
 *   const wasmEnabled = config.wasmEnabled ?? true; // Provide default
 *   console.log('Active dictionaries:', config.activeProperNouns || []);
 * } catch (error) {
 *   logger.error('Config load failed:', error);
 * }
 */
export async function loadValidatedConfiguration(): Promise<AppConfiguration> {
  const rawResult = await window.electronAPI.loadConfiguration();
  const result = validateApiResult<AppConfiguration>(rawResult, 'loadConfiguration');

  if (result.success && result.data) {
    // Basic validation - ensure we have an object
    if (typeof result.data !== 'object' || result.data === null) {
      throw new Error('Configuration is not a valid object');
    }
    return result.data as AppConfiguration;
  } else {
    throw new Error(result.error || 'Failed to load configuration');
  }
}

/**
 * Load configuration without validation (for merge operations)
 *
 * Loads configuration as-is without validation. Useful when merging with
 * new settings or when validation isn't needed.
 *
 * @returns {Promise<Partial<AppConfiguration>>} Raw configuration data or empty object
 *
 * @example
 * const currentConfig = await loadRawConfiguration();
 * const updated = { ...currentConfig, wasmEnabled: true };
 * await window.electronAPI.saveConfiguration(updated);
 */
export async function loadRawConfiguration(): Promise<Partial<AppConfiguration>> {
  try {
    const result = await window.electronAPI.loadConfiguration();
    return result.success && result.data ? result.data : {};
  } catch (error) {
    logger.error('Failed to load raw configuration:', error);
    return {};
  }
}

/**
 * Load and merge configuration (for save operations)
 *
 * Loads current configuration and merges with provided updates.
 * Useful for updating specific settings without overwriting others.
 *
 * @param updates - Partial configuration to merge
 * @returns {Promise<AppConfiguration>} Merged configuration
 *
 * @example
 * const merged = await loadAndMergeConfiguration({
 *   wasmEnabled: true,
 *   activeProperNouns: ['properNouns', 'properNouns-Novel1']
 * });
 * await window.electronAPI.saveConfiguration(merged);
 */
export async function loadAndMergeConfiguration(
  updates: Partial<AppConfiguration>
): Promise<AppConfiguration> {
  const current = await loadRawConfiguration();
  return { ...current, ...updates } as AppConfiguration;
}

/**
 * Get specific configuration value with fallback
 *
 * Retrieves a single configuration field with type-safe fallback.
 * Does not throw on errors - returns fallback instead.
 *
 * @param key - Configuration key to retrieve
 * @param fallback - Default value if key not found or load fails
 * @returns {Promise<T>} Configuration value or fallback
 *
 * @example
 * const wasmEnabled = await getConfigValue('wasmEnabled', true);
 * const limit = await getConfigValue('wasmMemoryLimit', 20);
 */
export async function getConfigValue<T>(key: keyof AppConfiguration, fallback: T): Promise<T> {
  try {
    const config = await loadRawConfiguration();
    return (config[key] as T) ?? fallback;
  } catch (error) {
    logger.warn(`Failed to get config value '${String(key)}', using fallback:`, error);
    return fallback;
  }
}

/**
 * Update specific configuration fields
 *
 * Loads current configuration, merges updates, and saves atomically.
 * Returns success status.
 *
 * @param updates - Partial configuration to update
 * @returns {Promise<boolean>} True if save succeeded
 *
 * @example
 * const success = await updateConfiguration({
 *   wasmEnabled: false,
 *   wasmMemoryLimit: 30
 * });
 * if (!success) {
 *   console.error('Failed to save configuration');
 * }
 */
export async function updateConfiguration(updates: Partial<AppConfiguration>): Promise<boolean> {
  try {
    const merged = await loadAndMergeConfiguration(updates);
    const result = await window.electronAPI.saveConfiguration(merged);

    if (!result.success) {
      logger.error('Configuration save failed:', result.error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Failed to update configuration:', error);
    return false;
  }
}
