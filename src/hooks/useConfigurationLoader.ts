/**
 * useConfigurationLoader Hook
 *
 * REFACTOR (2026-01-28): Provides React hook for configuration loading with state management.
 * Complements imperative utilities in configurationHelpers.ts.
 *
 * Use this hook when you need React state management for configuration.
 * Use configurationHelpers functions for imperative operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';
import { loadValidatedConfiguration, loadRawConfiguration } from '../utils/configurationHelpers';
import type { AppConfiguration } from '../types/ComponentTypes';

export interface UseConfigurationLoaderResult {
  /** Current configuration (null if not loaded) */
  config: AppConfiguration | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message (null if no error) */
  error: string | null;
  /** Load configuration with full validation */
  loadConfig: () => Promise<AppConfiguration | null>;
  /** Load configuration without validation (for merge operations) */
  loadRawConfig: () => Promise<Partial<AppConfiguration>>;
  /** Reload configuration (clears error and re-fetches) */
  reload: () => Promise<AppConfiguration | null>;
  /** Clear error message */
  clearError: () => void;
}

/**
 * Hook for loading and managing configuration state
 *
 * Provides loading state, error handling, and reload capabilities.
 * Automatically manages loading/error states during async operations.
 *
 * @param {boolean} autoLoad - If true, loads configuration on mount (default: false)
 * @returns {UseConfigurationLoaderResult} Configuration state and control functions
 *
 * @example
 * // Manual loading
 * const { config, isLoading, error, loadConfig } = useConfigurationLoader();
 *
 * useEffect(() => {
 *   loadConfig();
 * }, [loadConfig]);
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error}</div>;
 * return <div>WASM Enabled: {config?.wasmEnabled}</div>;
 *
 * @example
 * // Auto-load on mount
 * const { config, reload } = useConfigurationLoader(true);
 *
 * return (
 *   <div>
 *     <div>Memory Limit: {config?.wasmMemoryLimit}MB</div>
 *     <button onClick={reload}>Reload</button>
 *   </div>
 * );
 */
export function useConfigurationLoader(autoLoad: boolean = false): UseConfigurationLoaderResult {
  const [config, setConfig] = useState<AppConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load configuration with full validation
   */
  const loadConfig = useCallback(async (): Promise<AppConfiguration | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedConfig = await loadValidatedConfiguration();
      setConfig(loadedConfig);
      return loadedConfig;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load configuration';
      setError(message);
      logger.error('Configuration loading failed:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load configuration without validation (for merge operations)
   */
  const loadRawConfig = useCallback(async (): Promise<Partial<AppConfiguration>> => {
    setIsLoading(true);
    setError(null);

    try {
      const rawConfig = await loadRawConfiguration();
      return rawConfig;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load configuration';
      setError(message);
      logger.error('Raw configuration loading failed:', err);
      return {};
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Reload configuration (clears error and re-fetches)
   */
  const reload = useCallback(async (): Promise<AppConfiguration | null> => {
    return loadConfig();
  }, [loadConfig]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-load on mount if requested
  useEffect(() => {
    if (autoLoad) {
      loadConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    config,
    isLoading,
    error,
    loadConfig,
    loadRawConfig,
    reload,
    clearError,
  };
}
