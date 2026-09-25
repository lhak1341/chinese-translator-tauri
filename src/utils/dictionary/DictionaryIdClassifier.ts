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

/** The id prefix every fiction proper-nouns dictionary carries. Exported so callers that
 * need to *build* or *strip* one share the single literal with the predicate below,
 * rather than hand-copying a second copy that can drift from it. */
export const FICTION_PROPER_NOUNS_PREFIX = 'properNouns-f_';

/** True for a fiction proper-nouns dict ID, e.g. "properNouns-f_X". */
export function isFictionProperNounsId(id: string): boolean {
  return id.startsWith(FICTION_PROPER_NOUNS_PREFIX);
}

/** True for a fiction structural-pattern dict ID, e.g. "patterns-f_X". */
export function isFictionPatternsId(id: string): boolean {
  return id.startsWith('patterns-f_');
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

/**
 * Derives a properNouns dictionary ID from a raw user-typed name (create/rename forms) —
 * strips whitespace, prefixes `properNouns-`. Was independently reimplemented at 2 call sites
 * (`handleCreateDictionary`, `handleConfirmRename` in `useDictionaryConfigManagement.ts`)
 * before being unified (architecture review 2026-08-28, candidate #4 grilling). Pure
 * transform only — the Rust side (`validate_dictionary_id`) is the real authority on ID
 * safety (path traversal, prefix enforcement), independent of whatever this function returns.
 */
export function toProperNounsDictionaryId(rawName: string): string {
  return `properNouns-${rawName.trim().replace(/\s+/g, '')}`;
}

/**
 * Whether an entry carries an editable semantic type — the rule the dictionary table's Semantic
 * column follows: always for proper nouns; for phrases and patterns only once the entry is
 * allowed as a pattern variable (the type only matters when it fills a variable slot); never for
 * string-only lookup tables.
 */
export function hasSemanticTypeColumn(id: string, allowAsPatternVariable: boolean): boolean {
  const { isPatterns, isPhrases, isProperNouns } = classifyDictionaryId(id);
  if (isProperNouns) return true;
  return (isPatterns || isPhrases) && allowAsPatternVariable;
}

/**
 * Which dictionaries an entry may be moved between. An entry only makes sense in a dictionary
 * of the same shape: a pattern template (`X的Y`) moved into `phrases` becomes a literal phrase
 * matching the letters X and Y, and a complex `{ translation, ...metadata }` value moved into a
 * string-only lookup table (`characters`/`conversion`/`punctuation`) breaks that table's
 * two-tier format contract (see `src/components/dictionary/CLAUDE.md`).
 *
 * - `'patterns'` — `patterns` and every `patterns-f_*`
 * - `'lexical'` — `phrases` and every `properNouns*` (same value shape, same metadata)
 * - `null` — string-only lookup tables; entries there are not movable at all
 */
export type MoveFamily = 'patterns' | 'lexical';

export function getMoveFamily(id: string): MoveFamily | null {
  const { isPatterns, isPhrases, isProperNouns } = classifyDictionaryId(id);
  if (isPatterns) return 'patterns';
  if (isPhrases || isProperNouns) return 'lexical';
  return null;
}

/** True when an entry in `sourceId` may be moved to `targetId`. The single rule the move
 * dialog's target list, the context menu, and `moveEntry`/`bulkMoveEntries` all enforce. */
export function canMoveBetween(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false;
  const family = getMoveFamily(sourceId);
  return family !== null && family === getMoveFamily(targetId);
}
