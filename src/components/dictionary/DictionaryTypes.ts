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
import { baseValidation, validatePatternEntry } from '../../utils/dictionary/PersistTimeValidator';

interface DictionaryTypeDefinition {
  id: string;
  label: string;
  description: string;
  data: DictionaryData | null;
  validate: (source: string, translation: string) => string | null;
}

// Base dictionary types without proper nouns
const baseDictionaryTypes: Record<string, DictionaryTypeDefinition> = {
  patterns: {
    id: 'patterns',
    label: 'Pattern',
    description: 'Pattern-based structural translations',
    data: patternsDict as DictionaryData,
    validate: validatePatternEntry,
  },
  phrases: {
    id: 'phrases',
    label: 'Common Phrases',
    description: 'Multi-character phrase translations',
    data: phrasesDict as DictionaryData,
    validate: baseValidation,
  },
  characters: {
    id: 'characters',
    label: 'Characters',
    description: 'Individual character translations',
    data: charactersDict as DictionaryData,
    validate: baseValidation,
  },
  punctuation: {
    id: 'punctuation',
    label: 'Punctuation',
    description: 'Punctuation mark conversions',
    data: punctuationDict as DictionaryData,
    validate: baseValidation,
  },
  conversion: {
    id: 'conversion',
    label: 'Character Conversion',
    description: 'Traditional to simplified character mappings',
    data: conversionDict as DictionaryData,
    validate: baseValidation,
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
    // Run both list calls in parallel
    const [listResult, patternsListResult] = await Promise.all([
      window.electronAPI.listProperNounsDictionaries(),
      window.electronAPI.listFictionPatternDictionaries(),
    ]);

    // The runtime API returns string[] IDs; ElectronTypes.d.ts mistypes it as DictionaryInfo[]
    const allProperNouns: string[] = listResult.success
      ? (listResult.dictionaries as unknown as string[])
      : ['properNouns'];

    const allFictionPatterns: string[] = patternsListResult.success
      ? (patternsListResult.dictionaries as unknown as string[])
      : [];

    // Create proper nouns dictionary types for all available dictionaries
    const properNounsTypes: Record<string, DictionaryTypeDefinition> = {};
    for (const dictId of allProperNouns) {
      properNounsTypes[dictId] = {
        id: dictId,
        label:
          dictId === 'properNouns'
            ? 'Proper Nouns'
            : `Proper Nouns - ${dictId.replace('properNouns-', '')}`,
        description: 'Context-specific translations for names and titles',
        data: dictId === 'properNouns' ? (properNounsDict as DictionaryData) : null, // null indicates dynamic loading needed
        validate: baseValidation,
      };
    }

    // Create paired structural pattern dictionary types (fiction and generic)
    const fictionPatternTypes: Record<string, DictionaryTypeDefinition> = {};
    for (const patternsId of allFictionPatterns) {
      const suffix = patternsId.slice('patterns-'.length); // e.g. "f_DuongThan", "_AiCap"
      fictionPatternTypes[patternsId] = {
        id: patternsId,
        label: `Pattern - ${suffix}`,
        description: 'Fiction- or theme-specific structural pattern translations',
        data: null,
        validate: DICTIONARY_TYPES['patterns'].validate,
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
    return baseDictionaryTypes;
  }
};

// Export initial dictionary types for immediate use
export const DICTIONARY_TYPES: Record<string, DictionaryTypeDefinition> = {
  properNouns: {
    id: 'properNouns',
    label: 'Proper Nouns',
    description: 'Context-specific translations for names and titles',
    data: properNounsDict as DictionaryData,
    validate: baseValidation,
  },
  ...baseDictionaryTypes,
};
