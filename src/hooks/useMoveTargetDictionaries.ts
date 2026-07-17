import { useState, useEffect } from 'react';
import { getDictionaryTypes } from '../components/dictionary/DictionaryTypes';
import { getDictionaryDropdownLabel, compareDictionaryOrder } from '../utils/dictionaryHelpers';
import { logger } from '../utils/logger';

export interface MoveTargetDictionary {
  id: string;
  label: string;
}

export function useMoveTargetDictionaries(
  currentDictionaryId: string,
  onError?: (message: string) => void
): { availableDictionaries: MoveTargetDictionary[]; sourceLabel: string } {
  const [availableDictionaries, setAvailableDictionaries] = useState<MoveTargetDictionary[]>([]);

  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const types = await getDictionaryTypes();
        const dictionaryList = Object.keys(types)
          .filter((id) => id !== currentDictionaryId)
          .map((id) => ({ id, label: getDictionaryDropdownLabel(id) }))
          .sort(compareDictionaryOrder);
        setAvailableDictionaries(dictionaryList);
      } catch (err) {
        logger.error('Failed to load dictionaries:', err);
        onError?.('Failed to load available dictionaries');
      }
    };

    loadDictionaries();
  }, [currentDictionaryId, onError]);

  return {
    availableDictionaries,
    sourceLabel: getDictionaryDropdownLabel(currentDictionaryId),
  };
}
