/**
 * Which units are lit, as a function of one lit unit and the current arrays.
 *
 * A click lights one unit of the main translation's semantic arrays. The Original and Full
 * Translation panels show that unit directly; the Character Only panel shows the unit(s) that
 * `findCharacterOnlyMatch` maps it to. Nothing is stored for the Character Only side, so it
 * cannot disagree with the click it came from.
 *
 * `arrays` is the semantic-arrays reference the unit was lit against. A new translation brings a
 * new reference, and an old index means nothing against it, so a mismatch lights nothing — in the
 * same render, with no effect that clears it a frame late.
 */
import type { SemanticArrays } from '../../types/SemanticTypes';
import { findCharacterOnlyMatch } from './CharacterOnlyBridge';

export interface LitUnit {
  /** Index into `arrays`. */
  index: number;
  /** The main translation's semantic arrays this index was lit against. */
  arrays: SemanticArrays;
  /** The click came from the Character Only panel, which therefore stays unlit. */
  fromCharacterOnly: boolean;
}

export interface ResolvedHighlights {
  /** Lit unit in the Original and Full Translation panels (-1 = none). */
  litIndex: number;
  /** Lit unit(s) in the Character Only panel (-1 = none; an array for multi-word units). */
  characterOnlyUnitIndex: number | number[];
}

const NOTHING_LIT: ResolvedHighlights = Object.freeze({
  litIndex: -1,
  characterOnlyUnitIndex: -1,
});

export function resolveHighlights(
  lit: LitUnit | null,
  semanticArrays: SemanticArrays | null,
  characterOnlyArrays: SemanticArrays | null
): ResolvedHighlights {
  if (!lit || !semanticArrays || lit.arrays !== semanticArrays) return NOTHING_LIT;

  const { index } = lit;
  if (!Number.isInteger(index) || index < 0 || index >= semanticArrays.original.length) {
    return NOTHING_LIT;
  }

  if (lit.fromCharacterOnly || !characterOnlyArrays) {
    return { litIndex: index, characterOnlyUnitIndex: -1 };
  }
  return {
    litIndex: index,
    characterOnlyUnitIndex:
      findCharacterOnlyMatch(index, semanticArrays, characterOnlyArrays) ?? -1,
  };
}
