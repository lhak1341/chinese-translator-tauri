/**
 * Configuration Helper Utilities
 */

import { validateApiResult } from './configValidation';
import type { AppConfiguration } from '../types/ComponentTypes';

/**
 * Load and validate configuration
 *
 * @returns {Promise<AppConfiguration>} Configuration object
 * @throws {Error} If configuration cannot be loaded
 */
export async function loadValidatedConfiguration(): Promise<AppConfiguration> {
  const rawResult = await window.electronAPI.loadConfiguration();
  const result = validateApiResult<AppConfiguration>(rawResult, 'loadConfiguration');

  if (result.success && result.data) {
    if (typeof result.data !== 'object' || result.data === null) {
      throw new Error('Configuration is not a valid object');
    }
    return result.data as AppConfiguration;
  } else {
    throw new Error(result.error || 'Failed to load configuration');
  }
}
