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

/**
 * Derives the paired fiction structural-pattern dict ID from a fiction proper-nouns ID
 * (ADR-027 naming-convention coupling), e.g. "properNouns-f_X" -> "patterns-f_X".
 * Assumes the caller has already verified `properNounsId.startsWith('properNouns-f_')`.
 */
export function toPatternsId(properNounsId: string): string {
  return 'patterns-' + properNounsId.slice('properNouns-'.length);
}

/**
 * Derives the paired fiction proper-nouns dict ID from a fiction structural-pattern ID
 * (ADR-027 naming-convention coupling), e.g. "patterns-f_X" -> "properNouns-f_X".
 * Assumes the caller has already verified `patternsId.startsWith('patterns-f_')`.
 */
export function toProperNounsId(patternsId: string): string {
  return 'properNouns-' + patternsId.slice('patterns-'.length);
}
