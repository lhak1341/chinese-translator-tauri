import properNounsDict from '../../dictionaries/properNouns.json';
import patternsDict from '../../dictionaries/patterns.json';
import phrasesDict from '../../dictionaries/phrases.json';
import charactersDict from '../../dictionaries/characters.json';
import conversionDict from '../../dictionaries/conversion.json';
import punctuationDict from '../../dictionaries/punctuation.json';

// Basic validation for all dictionary entries
const baseValidation = (source, translation) => {
  if (!source.trim() || !translation.trim()) {
    return 'Both source and translation are required';
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
      if (!source.includes('X')) {
        return 'Pattern must contain at least one variable (X)';
      }
      if (!translation.includes('X')) {
        return 'Translation must use all variables from the pattern';
      }
      if (source.includes('Y') && !translation.includes('Y')) {
        return 'Translation must use all variables from the pattern';
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

export const getDefaultDictionary = dictionaryId => {
  if (dictionaryId === 'properNouns') {
    return properNounsDict;
  }
  if (dictionaryId.startsWith('properNouns-')) {
    return {};
  }
  return DICTIONARY_TYPES[dictionaryId]?.data || {};
};

export const getDictionaryInfo = dictionaryId => {
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
    const allProperNouns = listResult.success
      ? listResult.dictionaries
      : ['properNouns'];

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
    console.error('Error loading dictionary types:', error);
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
