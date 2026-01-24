import properNounsDict from '../../dictionaries/properNouns.json';
import patternsDict from '../../dictionaries/patterns.json';
import phrasesDict from '../../dictionaries/phrases.json';
import charactersDict from '../../dictionaries/characters.json';
import conversionDict from '../../dictionaries/conversion.json';
import punctuationDict from '../../dictionaries/punctuation.json';
import { logger } from '../../utils/logger.js';

// Basic validation for all dictionary entries
const baseValidation = (source, translation) => {
  // SECURITY FIX: Prevent DoS via huge dictionary entries
  const MAX_ENTRY_LENGTH = 10000;

  if (!source.trim() || !translation.trim()) {
    return 'Both source and translation are required';
  }

  if (source.length > MAX_ENTRY_LENGTH) {
    return `Source too long (max ${MAX_ENTRY_LENGTH} characters)`;
  }

  if (translation.length > MAX_ENTRY_LENGTH) {
    return `Translation too long (max ${MAX_ENTRY_LENGTH} characters)`;
  }

  return null;
};

// Base dictionary types without proper nouns
const baseDictionaryTypes = {
  patterns: {
    id: 'patterns',
    label: 'Structural Patterns',
    description: 'Pattern-based structural translations',
    data: patternsDict,
    validate: (source, translation) => {
      // LOW-2 FIX: Enhanced pattern validation to catch variable mismatches
      // Extract all variables (X, Y, Z) from both source and translation
      const sourceVars = new Set(source.match(/[XYZ]/g) || []);
      const translationVars = new Set(translation.match(/[XYZ]/g) || []);

      if (sourceVars.size === 0) {
        return 'Pattern must contain at least one variable (X, Y, or Z)';
      }

      // Check all source variables are used in translation
      for (const variable of sourceVars) {
        if (!translationVars.has(variable)) {
          return `Translation must use variable ${variable} from the pattern`;
        }
      }

      // Check translation doesn't use variables not in source
      for (const variable of translationVars) {
        if (!sourceVars.has(variable)) {
          return `Translation cannot use variable ${variable} not present in source pattern`;
        }
      }

      return baseValidation(source, translation);
    },
  },
  phrases: {
    id: 'phrases',
    label: 'Common Phrases',
    description: 'Multi-character phrase translations',
    data: phrasesDict,
    validate: baseValidation,
  },
  characters: {
    id: 'characters',
    label: 'Characters',
    description: 'Individual character translations',
    data: charactersDict,
    validate: baseValidation,
  },
  punctuation: {
    id: 'punctuation',
    label: 'Punctuation',
    description: 'Punctuation mark conversions',
    data: punctuationDict,
    validate: baseValidation,
  },
  conversion: {
    id: 'conversion',
    label: 'Character Conversion',
    description: 'Traditional to simplified character mappings',
    data: conversionDict,
    validate: baseValidation,
  },
};

// Helper functions
export const validateDictionaryEntry = (dictionaryId, source, translation) => {
  // If it's a proper nouns dictionary, just use base validation
  if (dictionaryId.startsWith('properNouns')) {
    return baseValidation(source, translation);
  }

  // Otherwise, check against standard dictionary types
  const dictionaryType = DICTIONARY_TYPES[dictionaryId];
  if (!dictionaryType) {
    return 'Invalid dictionary type';
  }
  return dictionaryType.validate(source, translation);
};

export const getDefaultDictionary = (dictionaryId) => {
  if (dictionaryId === 'properNouns') {
    return properNounsDict;
  }
  if (dictionaryId.startsWith('properNouns-')) {
    return {};
  }
  return DICTIONARY_TYPES[dictionaryId]?.data || {};
};

export const getDictionaryInfo = (dictionaryId) => {
  if (dictionaryId.startsWith('properNouns-')) {
    return {
      label: `Proper Nouns - ${dictionaryId.replace('properNouns-', '')}`,
      description: 'Context-specific translations for names and titles',
    };
  }
  const { label, description } = DICTIONARY_TYPES[dictionaryId] || {};
  return { label, description };
};

// Function to generate dictionary types including all proper nouns dictionaries
export const getDictionaryTypes = async () => {
  try {
    // Get list of all proper nouns dictionaries first
    const listResult = await window.electronAPI.listProperNounsDictionaries();
    const allProperNouns = listResult.success ? listResult.dictionaries : ['properNouns'];

    // Create proper nouns dictionary types for all available dictionaries
    const properNounsTypes = {};
    for (const dictId of allProperNouns) {
      properNounsTypes[dictId] = {
        id: dictId,
        label:
          dictId === 'properNouns'
            ? 'Proper Nouns'
            : `Proper Nouns - ${dictId.replace('properNouns-', '')}`,
        description: 'Context-specific translations for names and titles',
        data: dictId === 'properNouns' ? properNounsDict : null, // null indicates dynamic loading needed
        validate: baseValidation,
      };
    }

    // Return combined dictionary types
    return {
      ...properNounsTypes,
      ...baseDictionaryTypes,
    };
  } catch (error) {
    logger.error('Error loading dictionary types:', error);
    return baseDictionaryTypes;
  }
};

// Export initial dictionary types for immediate use
export const DICTIONARY_TYPES = {
  properNouns: {
    id: 'properNouns',
    label: 'Proper Nouns',
    description: 'Context-specific translations for names and titles',
    data: properNounsDict,
    validate: baseValidation,
  },
  ...baseDictionaryTypes,
};
