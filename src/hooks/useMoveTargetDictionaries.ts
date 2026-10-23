import { useMemo } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { compareDictionaryOrder } from '../utils/dictionaryHelpers';
import { getDictionaryDropdownLabel } from '../utils/dictionary/DictionaryLabels';
import { canMoveBetween } from '../utils/dictionary';

export interface MoveTargetDictionary {
  id: string;
  label: string;
}

/** The dictionaries an entry in `currentDictionaryId` can move to, from the Dictionary Store's
 * list (GLOSSARY.md "Dictionary Store"). */
export function useMoveTargetDictionaries(currentDictionaryId: string): {
  availableDictionaries: MoveTargetDictionary[];
  sourceLabel: string;
} {
  const { dictionaryTypes } = useDictionary();

  const availableDictionaries = useMemo(
    () =>
      Object.keys(dictionaryTypes)
        .filter((id) => canMoveBetween(currentDictionaryId, id))
        .map((id) => ({ id, label: getDictionaryDropdownLabel(id) }))
        .sort(compareDictionaryOrder),
    [dictionaryTypes, currentDictionaryId]
  );

  return {
    availableDictionaries,
    sourceLabel: getDictionaryDropdownLabel(currentDictionaryId),
  };
}
