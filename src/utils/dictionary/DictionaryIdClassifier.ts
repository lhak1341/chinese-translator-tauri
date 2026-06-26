export interface DictionaryTypeFlags {
  isPatterns: boolean;
  isPhrases: boolean;
  isProperNouns: boolean;
}

/** Strict UI-layer classification of a dictionary ID. Separate from isDictionaryCategory (fuzzy engine classification). */
export function classifyDictionaryId(id: string): DictionaryTypeFlags {
  return {
    isPatterns: id === 'patterns' || id.startsWith('patterns-'),
    isPhrases: id === 'phrases',
    isProperNouns: id.startsWith('properNouns'),
  };
}
