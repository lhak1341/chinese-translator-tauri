/**
 * The single "build a dictionary entry's metadata object" function — was independently
 * reimplemented 3x (`VirtualRowComponent.buildTextSaveMetadata`, `useEntryMetadataEdit
 * .buildBaseMetadata`, an inline builder in `useDictionaryEntryForm`) before being unified
 * (architecture review 2026-08-28, candidate #3 grilling). Two of the three carried their
 * own dictionary-type gate; both were redundant with `prepareMutationEntry` in
 * `useDictionaryCRUD.ts`, which is the sole real authority on whether metadata is kept
 * (it decides object-vs-string storage purely from `dictionaryId`, discarding whatever this
 * function returns for non-complex dicts regardless of shape) — so this function carries no
 * dictionary-type gate itself.
 */

import type { DictionaryEntryMetadata } from '../../types/DictionaryTypes';
import type { SemanticType, PatternSemanticTypeRef } from '../../constants/SemanticTypes';

export interface EntryMetadataFields {
  allowAsPatternVariable: boolean;
  semanticType?: string;
  allowedVariableTypes?: Record<string, string[]>;
}

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
