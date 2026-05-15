import { useEffect } from 'react';
import { logger } from '../utils/logger';
import { saveAppConfig } from '../utils/appConfig';

export function usePersistSelectedDictionary(selectedDictionary: string, isLoading: boolean): void {
  useEffect(() => {
    if (!selectedDictionary || isLoading) return;

    saveAppConfig({ session: { lastSelectedDictionary: selectedDictionary } }).catch((error) => {
      logger.error('Failed to save selected dictionary:', error);
    });
  }, [selectedDictionary, isLoading]);
}
