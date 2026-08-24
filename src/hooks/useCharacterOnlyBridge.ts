import { useEffect } from 'react';
import type { RefObject } from 'react';
import {
  findCharacterOnlyMatch,
  scrollToHighlightedElement,
  HIGHLIGHT_SCROLL_DELAY_MS,
} from '../utils/highlighting';
import type { SemanticArrays } from '../utils/highlighting';
import { logger } from '../utils/logger';

interface UseCharacterOnlyBridgeOptions {
  unitIndex: number;
  translationUnitIndex: number;
  characterOnlyUnitIndex: number | number[];
  isCharacterOnlyClick: boolean;
  semanticArrays: SemanticArrays | null;
  characterOnlySemanticArrays: SemanticArrays | null;
  setCharacterOnlyIndex: (idx: number | number[]) => void;
  characterOnlyTextRef: RefObject<HTMLElement | null>;
}

/**
 * Owns the full Character Only bridge pipeline: map a Full Translation / Original
 * highlight to the corresponding Character Only unit(s), then scroll the panel to it.
 *
 * Extracted from the two inline useEffects in Translator.jsx (:623 and :699).
 * Scoring algorithm: findCharacterOnlyMatch in CharacterOnlyBridge.ts.
 */
export function useCharacterOnlyBridge({
  unitIndex,
  translationUnitIndex,
  characterOnlyUnitIndex,
  isCharacterOnlyClick,
  semanticArrays,
  characterOnlySemanticArrays,
  setCharacterOnlyIndex,
  characterOnlyTextRef,
}: UseCharacterOnlyBridgeOptions): void {
  // Match effect: maps Full Translation / Original highlight → Character Only unit(s).
  useEffect(() => {
    if (!semanticArrays || !characterOnlySemanticArrays) {
      return;
    }

    if (isCharacterOnlyClick) {
      logger.log(
        '🚫 Skipping Chinese Text → Character Only mapping (Character Only click in progress)'
      );
      return;
    }

    // Full Translation highlight takes priority over Original.
    let activeIndex = -1;
    if (translationUnitIndex !== -1 && semanticArrays.original) {
      if (translationUnitIndex >= semanticArrays.original.length) {
        logger.error('❌ Index out of bounds in bridge useEffect:', {
          index: translationUnitIndex,
          arrayLength: semanticArrays.original.length,
          source: 'Full Translation highlight',
        });
        setCharacterOnlyIndex(-1);
        return;
      }
      activeIndex = translationUnitIndex;
    } else if (unitIndex !== -1 && semanticArrays.original) {
      if (unitIndex >= semanticArrays.original.length) {
        logger.error('❌ Index out of bounds in bridge useEffect:', {
          index: unitIndex,
          arrayLength: semanticArrays.original.length,
          source: 'Original Text highlight',
        });
        setCharacterOnlyIndex(-1);
        return;
      }
      activeIndex = unitIndex;
    }

    const matchIndices =
      activeIndex !== -1
        ? findCharacterOnlyMatch(activeIndex, semanticArrays, characterOnlySemanticArrays)
        : null;

    setCharacterOnlyIndex(matchIndices ?? -1);
  }, [
    unitIndex,
    translationUnitIndex,
    semanticArrays,
    characterOnlySemanticArrays,
    isCharacterOnlyClick,
    setCharacterOnlyIndex,
  ]);

  // Scroll effect: after Character Only index is set, scroll the panel to the element.
  useEffect(() => {
    if (!characterOnlyUnitIndex || characterOnlyUnitIndex === -1) return;

    const timeoutId = setTimeout(() => {
      const firstIndex = Array.isArray(characterOnlyUnitIndex)
        ? characterOnlyUnitIndex[0]
        : characterOnlyUnitIndex;

      if (firstIndex >= 0) {
        // scrollToHighlightedElement guards containerRef.current internally.
        scrollToHighlightedElement(characterOnlyTextRef as RefObject<HTMLElement>, firstIndex);
      }
    }, HIGHLIGHT_SCROLL_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [characterOnlyUnitIndex, characterOnlyTextRef]);
}
