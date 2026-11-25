import type { DictionaryData, DictionaryEntryValue } from '../../types/DictionaryTypes';
import { inDisplayOrder } from './DictionaryIdClassifier';
import { entryFields } from './EntryValue';

/** The entry the Add form's notice names (GLOSSARY.md "Existing entry"). */
export interface ExistingEntry {
  dictionaryId: string;
  translation: string;
  /** The match is in the target, so saving overwrites it. */
  inTarget: boolean;
}

/**
 * The existing entry that matters for adding `source` to `target`: the target's own when it
 * holds the source (saving would overwrite it), else the first holder in the dictionary display
 * order. Disk order never decides: with the source in two dictionaries, the one listed first on
 * disk used to hide the overwrite. Lookup tables count as holders. `editedSource` is the entry
 * being edited, which is not "existing" for itself. Returns `null` for an empty source.
 */
export function findExistingEntry(
  dictionaries: Readonly<Record<string, DictionaryData | undefined>>,
  source: string,
  target: string,
  editedSource?: string
): ExistingEntry | null {
  const key = source.trim();
  if (!key || key === editedSource) return null;
  for (const dictionaryId of inDisplayOrder(Object.keys(dictionaries), target)) {
    const dictionary = dictionaries[dictionaryId];
    if (!dictionary || !Object.prototype.hasOwnProperty.call(dictionary, key)) continue;
    const value = dictionary[key];
    if (!value) continue;
    return {
      dictionaryId,
      translation: entryFields(value as DictionaryEntryValue).translation,
      inTarget: dictionaryId === target,
    };
  }
  return null;
}
