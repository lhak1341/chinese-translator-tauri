import properNounsDict from '../../dictionaries/properNouns.json';
import patternsDict from '../../dictionaries/patterns.json';
import phrasesDict from '../../dictionaries/phrases.json';
import charactersDict from '../../dictionaries/characters.json';
import conversionDict from '../../dictionaries/conversion.json';
import punctuationDict from '../../dictionaries/punctuation.json';
import { logger } from '../../utils/logger.js';
import toast from '../../utils/toast';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import type { DictionaryData } from '../../types/DictionaryTypes.js';
import { dictionarySelectorLabel } from '../../utils/dictionary/DictionaryLabels';
import {
  listFictionPatternDictionaryIds,
  listProperNounsDictionaryIds,
} from '../../utils/dictionary/DictionaryBackend';

interface DictionaryTypeDefinition {
  id: string;
  label: string;
  description: string;
  data: DictionaryData | null;
}

// Base dictionary types without proper nouns
const baseDictionaryTypes: Record<string, DictionaryTypeDefinition> = {
  patterns: {
    id: 'patterns',
    label: 'Pattern',
    description: 'Pattern-based structural translations',
    data: patternsDict as DictionaryData,
  },
  phrases: {
    id: 'phrases',
    label: 'Common Phrases',
    description: 'Multi-character phrase translations',
    data: phrasesDict as DictionaryData,
  },
  characters: {
    id: 'characters',
    label: 'Characters',
    description: 'Individual character translations',
    data: charactersDict as DictionaryData,
  },
  punctuation: {
    id: 'punctuation',
    label: 'Punctuation',
    description: 'Punctuation mark conversions',
    data: punctuationDict as DictionaryData,
  },
  conversion: {
    id: 'conversion',
    label: 'Character Conversion',
    description: 'Traditional to simplified character mappings',
    data: conversionDict as DictionaryData,
  },
};

// Function to generate dictionary types including all proper nouns dictionaries
/** A dropdown label that says when the dictionary's file failed to load (CONTEXT.md "Unread
 * dictionary") — its table is empty and its edits are refused, which would otherwise read as
 * a wiped dictionary. */
export function dictionaryOptionLabel(
  id: string,
  label: string,
  unreadDictionaryIds: readonly string[]
): string {
  return unreadDictionaryIds.includes(id) ? `${label} — couldn't read` : label;
}

export const getDictionaryTypes = async (): Promise<Record<string, DictionaryTypeDefinition>> => {
  try {
    // Run both list calls in parallel. A failed list throws into the catch below.
    const [allProperNouns, allFictionPatterns] = await Promise.all([
      listProperNounsDictionaryIds(),
      listFictionPatternDictionaryIds(),
    ]);

    // Create proper nouns dictionary types for all available dictionaries
    const properNounsTypes: Record<string, DictionaryTypeDefinition> = {};
    for (const dictId of allProperNouns) {
      properNounsTypes[dictId] = {
        id: dictId,
        label: dictionarySelectorLabel(dictId),
        description: 'Context-specific translations for names and titles',
        data: dictId === 'properNouns' ? (properNounsDict as DictionaryData) : null, // null indicates dynamic loading needed
      };
    }

    // Create paired structural pattern dictionary types (fiction and generic)
    const fictionPatternTypes: Record<string, DictionaryTypeDefinition> = {};
    for (const patternsId of allFictionPatterns) {
      fictionPatternTypes[patternsId] = {
        id: patternsId,
        label: dictionarySelectorLabel(patternsId),
        description: 'Fiction- or theme-specific structural pattern translations',
        data: null,
      };
    }

    // Return combined dictionary types
    return {
      ...properNounsTypes,
      ...fictionPatternTypes,
      ...baseDictionaryTypes,
    };
  } catch (error) {
    logger.error('Error loading dictionary types:', error);
    // Surface to user — silent fallback hides custom proper-noun dictionaries
    // (novels) from the UI until manual reload, with no indication of failure.
    toast.warning(
      'Could not list custom proper-noun dictionaries. Only the built-in set is available.',
      {
        duration: TOAST_DURATIONS.LOAD_FAILURE,
        id: TOAST_IDS.DICT_LOAD_FAILED,
      }
    );
    // The built-in set includes the general `properNouns` dictionary.
    return DICTIONARY_TYPES;
  }
};

// Export initial dictionary types for immediate use
export const DICTIONARY_TYPES: Record<string, DictionaryTypeDefinition> = {
  properNouns: {
    id: 'properNouns',
    label: 'Proper Nouns',
    description: 'Context-specific translations for names and titles',
    data: properNounsDict as DictionaryData,
  },
  ...baseDictionaryTypes,
};
