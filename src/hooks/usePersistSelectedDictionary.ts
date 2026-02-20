import { useEffect } from 'react';
import { logger } from '../utils/logger';

/**
 * Persists the selected dictionary to application configuration whenever it changes.
 * Skips the save while initial loading is in progress.
 */
export function usePersistSelectedDictionary(selectedDictionary: string, isLoading: boolean): void {
  useEffect(() => {
    if (!selectedDictionary || isLoading) return;

    let isMounted = true;

    const saveSelectedDictionary = async (): Promise<void> => {
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (!isMounted) return;

        const currentConfig = configResult.success && configResult.data ? configResult.data : {};

        const saveResult = await window.electronAPI.saveConfiguration({
          ...currentConfig,
          lastSelectedDictionary: selectedDictionary,
        } as any);
        if (!isMounted) return;

        if (!saveResult.success) {
          logger.error('Failed to save selected dictionary:', saveResult.error);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to save selected dictionary:', error);
        }
      }
    };

    saveSelectedDictionary();

    return () => {
      isMounted = false;
    };
  }, [selectedDictionary, isLoading]);
}
