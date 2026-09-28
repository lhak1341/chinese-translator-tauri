/**
 * What shape a dictionary's entries have. See CONTEXT.md "Dictionary Kind / Dictionary Tier".
 *
 * - `'patterns'` — `patterns` and every `patterns-*` (templates with variable slots)
 * - `'phrases'` — the one `phrases` dictionary
 * - `'properNouns'` — `properNouns` and every `properNouns-*`
 * - `'lookupTable'` — the string-only tables (`characters`, `conversion`, `punctuation`), and
 *   any id this function does not recognize: the most inert kind (not movable, no Semantic
 *   column, no pattern validation). Rust's `DictionaryType::from_name` defaults unknown ids to
 *   `Phrases` instead — harmless there, since each engine phase filters matches by its own
 *   `dictionarySet`.
 */
export type DictionaryKind = 'patterns' | 'phrases' | 'properNouns' | 'lookupTable';

export function kindOf(id: string): DictionaryKind {
  if (id === 'patterns' || id.startsWith('patterns-')) return 'patterns';
  if (id === 'phrases') return 'phrases';
  if (id === 'properNouns' || id.startsWith('properNouns-')) return 'properNouns';
  return 'lookupTable';
}

// Call sites use these rather than comparing `kindOf(id)` to a literal: `kindOf(id) === 'patterns'`
// reads the same as the raw id check `id === 'patterns'`, which SourceConventionScan forbids.
export const isPatternsDict = (id: string): boolean => kindOf(id) === 'patterns';
export const isPhrasesDict = (id: string): boolean => kindOf(id) === 'phrases';
export const isProperNounsDict = (id: string): boolean => kindOf(id) === 'properNouns';
export const isLookupTableDict = (id: string): boolean => kindOf(id) === 'lookupTable';

/**
 * Where a dictionary sits in the precedence ladder, read from the part after the kind prefix.
 *
 * - `'root'` — every fixed name (`properNouns`, `patterns`, `phrases`, `characters`, …)
 * - `'fiction'` — `*-f_*`, one novel's dictionary
 * - `'generic'` — `*-_*`, a shared theme dictionary
 * - `'custom'` — a user-created `properNouns-Foo` with neither marker
 *
 * The Configuration screen groups `root` and `custom` together as "Base"; the trie priority
 * rule does not, which is why they are separate tiers.
 */
export type DictionaryTier = 'root' | 'fiction' | 'generic' | 'custom';

export function tierOf(id: string): DictionaryTier {
  const kind = kindOf(id);
  if (kind !== 'patterns' && kind !== 'properNouns') return 'root';
  if (id === kind) return 'root';
  const suffix = id.slice(kind.length + 1); // after "patterns-" / "properNouns-"
  if (suffix.startsWith('f_')) return 'fiction';
  if (suffix.startsWith('_')) return 'generic';
  return 'custom';
}

/** The id prefix every fiction proper-nouns dictionary carries. Exported for callers that
 * need to *build* or *strip* one; to *test* for one, use `isFictionProperNounsId`. */
export const FICTION_PROPER_NOUNS_PREFIX = 'properNouns-f_';

/** True for a fiction proper-nouns dict ID, e.g. "properNouns-f_X". */
export function isFictionProperNounsId(id: string): boolean {
  return kindOf(id) === 'properNouns' && tierOf(id) === 'fiction';
}

/** True for a fiction structural-pattern dict ID, e.g. "patterns-f_X". */
export function isFictionPatternsId(id: string): boolean {
  return kindOf(id) === 'patterns' && tierOf(id) === 'fiction';
}

/** The tiers whose dictionaries come as a proper-nouns + structural-patterns pair
 * (ADR-027 for fiction, ADR-048 for generic). Root and custom have no pair. */
const PAIRED_TIERS: readonly DictionaryTier[] = ['fiction', 'generic'];

/** True for a proper-nouns dict ID that has a paired patterns dict, e.g. "properNouns-f_X"
 * or "properNouns-_X". */
export function hasPairedPatterns(id: string): boolean {
  return kindOf(id) === 'properNouns' && PAIRED_TIERS.includes(tierOf(id));
}

/** True for a patterns dict ID that is one half of a pair, e.g. "patterns-f_X" or
 * "patterns-_X" — every patterns dict except the root `patterns`. */
export function isPairedPatternsId(id: string): boolean {
  return kindOf(id) === 'patterns' && PAIRED_TIERS.includes(tierOf(id));
}

/**
 * Derives the paired structural-pattern dict ID from a proper-nouns ID (ADR-027
 * naming-convention coupling), e.g. "properNouns-f_X" -> "patterns-f_X",
 * "properNouns-_X" -> "patterns-_X". Assumes the caller has already verified
 * `hasPairedPatterns(properNounsId)`.
 */
export function toPatternsId(properNounsId: string): string {
  return 'patterns-' + properNounsId.slice('properNouns-'.length);
}

/**
 * Derives the paired proper-nouns dict ID from a structural-pattern ID (ADR-027
 * naming-convention coupling), e.g. "patterns-f_X" -> "properNouns-f_X".
 * Assumes the caller has already verified `isPairedPatternsId(patternsId)`.
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
 * What an entry of a dictionary's kind can carry. Every surface — table rows and headers, filters,
 * the Add form, Rule Matches — reads this instead of naming a kind. See CONTEXT.md "Entry
 * capabilities".
 *
 * - `variableFlag` — the VAR flag (`allowAsPatternVariable`): a per-entry `'toggle'`; `'always'`
 *   on for proper nouns, which fill pattern variables by design; `'none'` for lookup tables.
 * - `semantic` — the semantic type: `'always'` editable; `'whenVariable'`, only once VAR is on
 *   (the type only matters when the entry fills a variable slot); `'none'`.
 * - `variableTypes` — per-variable (X/Y) type constraints: pattern templates only.
 */
export interface EntryCapabilities {
  variableFlag: 'toggle' | 'always' | 'none';
  semantic: 'always' | 'whenVariable' | 'none';
  variableTypes: boolean;
}

const KIND_CAPABILITIES: Record<DictionaryKind, EntryCapabilities> = {
  patterns: { variableFlag: 'toggle', semantic: 'whenVariable', variableTypes: true },
  phrases: { variableFlag: 'toggle', semantic: 'whenVariable', variableTypes: false },
  properNouns: { variableFlag: 'always', semantic: 'always', variableTypes: false },
  lookupTable: { variableFlag: 'none', semantic: 'none', variableTypes: false },
};

export function entryCapabilities(id: string): EntryCapabilities {
  return KIND_CAPABILITIES[kindOf(id)];
}

/** Whether an entry with this VAR flag shows an editable semantic type. A type hidden by
 * `'whenVariable'` is still saved — it reappears when VAR is turned on. */
export function showsSemanticType(id: string, allowAsPatternVariable: boolean): boolean {
  const { semantic } = entryCapabilities(id);
  return semantic === 'always' || (semantic === 'whenVariable' && allowAsPatternVariable);
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
 * - `null` — `lookupTable` kind; entries there are not movable at all
 */
export type MoveFamily = 'patterns' | 'lexical';

export function getMoveFamily(id: string): MoveFamily | null {
  switch (kindOf(id)) {
    case 'patterns':
      return 'patterns';
    case 'phrases':
    case 'properNouns':
      return 'lexical';
    case 'lookupTable':
      return null;
  }
}

/** True when an entry in `sourceId` may be moved to `targetId`. The single rule the move
 * dialog's target list, the context menu, and `moveEntry`/`bulkMoveEntries` all enforce. */
export function canMoveBetween(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false;
  const family = getMoveFamily(sourceId);
  return family !== null && family === getMoveFamily(targetId);
}
