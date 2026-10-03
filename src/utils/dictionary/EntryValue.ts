/**
 * A dictionary entry's value — reading it, building its metadata, and changing one field of it.
 *
 * A stored value is a plain string (lookup tables, and legacy entries in complex dicts) or a
 * `DictionaryEntryValue` object. UI code reads it through `entryFields`, which answers every
 * field for both shapes, instead of re-deriving each from a `typeof` ladder — including the
 * Transform Rule matcher, the duplicate analyzer and the move dialog's preview. Load and trie
 * paths keep their own checks: they are hot loops, and they are validating the shape, not
 * reading it. `DictionaryEntryFlattener` stays raw too: it forwards every key of an object
 * value to IPC, including ones `entryFields` does not know about.
 *
 * Changing one field is `patchEntry` (useDictionaryCRUD.ts), which reads the current value
 * itself and merges with `applyEntryPatch` — callers pass only what changed, never a
 * snapshot of the rest.
 *
 * `buildEntryMetadata` was unified from 3 reimplementations (architecture review 2026-08-28,
 * candidate #3 grilling). It carries no dictionary-type gate: `prepareMutationEntry` in
 * `useDictionaryCRUD.ts` is the sole authority on whether metadata is kept (it decides
 * object-vs-string storage purely from `dictionaryId`, discarding whatever this returns for
 * lookup tables).
 */

import type { DictionaryEntryMetadata, DictionaryEntryValue } from '../../types/DictionaryTypes';
import type { SemanticType, PatternSemanticTypeRef } from '../../constants/SemanticTypes';

export interface EntryMetadataFields {
  allowAsPatternVariable: boolean;
  semanticType?: string;
  allowedVariableTypes?: Record<string, string[]>;
}

/** Every field of an entry, whichever shape it is stored in. Absent metadata reads as its
 * empty value: `false`, `''`, `{}`. */
export interface EntryFields {
  translation: string;
  allowAsPatternVariable: boolean;
  semanticType: string;
  allowedVariableTypes: Record<string, string[]>;
}

/** The fields to change. An empty `semanticType` (`''`) or `allowedVariableTypes` (`{}`)
 * removes the key from the stored value. */
export type EntryPatch = Partial<EntryFields>;

export function buildEntryMetadata({
  allowAsPatternVariable,
  semanticType,
  allowedVariableTypes,
}: EntryMetadataFields): DictionaryEntryMetadata {
  const metadata: DictionaryEntryMetadata = { allowAsPatternVariable };
  if (semanticType) metadata.semanticType = semanticType as SemanticType | PatternSemanticTypeRef;
  if (allowedVariableTypes && Object.keys(allowedVariableTypes).length > 0) {
    metadata.allowedVariableTypes = allowedVariableTypes;
  }
  return metadata;
}

export function entryFields(value: DictionaryEntryValue | string): EntryFields {
  if (typeof value === 'string') {
    return {
      translation: value,
      allowAsPatternVariable: false,
      semanticType: '',
      allowedVariableTypes: {},
    };
  }
  return {
    translation: value.translation,
    allowAsPatternVariable: value.allowAsPatternVariable === true,
    semanticType: value.semanticType ?? '',
    allowedVariableTypes: value.allowedVariableTypes ?? {},
  };
}

/** `fields` with `patch` applied. Removal of an emptied key happens when the result is
 * turned into metadata (`buildEntryMetadata` drops `''` and `{}`). */
export function applyEntryPatch(fields: EntryFields, patch: EntryPatch): EntryFields {
  return { ...fields, ...patch };
}

/** `allowedVariableTypes` with `type` toggled for `varName` — a variable left with no allowed
 * type loses its key, so an unconstrained variable is stored as absent, not as `[]`. */
export function toggleVariableType(
  current: Record<string, string[]>,
  varName: string,
  type: string
): Record<string, string[]> {
  const types = current[varName] ?? [];
  const next = { ...current };
  if (types.includes(type)) {
    const remaining = types.filter((t) => t !== type);
    if (remaining.length > 0) next[varName] = remaining;
    else delete next[varName];
  } else {
    next[varName] = [...types, type];
  }
  return next;
}
