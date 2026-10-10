import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useHighlightingState } from './useHighlightingState';
import type { UseHighlightingStateResult } from './useHighlightingState';
import {
  findCharacterOnlyMatch,
  scheduleHighlightScroll,
  scrollToHighlightedElement,
  HIGHLIGHT_SCROLL_DELAY_MS,
} from '../utils/highlighting';
import type { SemanticArrays } from '../utils/highlighting';
import type { SegmentClickHandler } from '../types/ClickableTypes';
import { logger } from '../utils/logger';

interface UseHighlightInteractionOptions {
  semanticArrays: SemanticArrays | null;
  characterOnlySemanticArrays: SemanticArrays | null;
  originalTextRef: RefObject<HTMLElement | null>;
  translationTextRef: RefObject<HTMLElement | null>;
  characterOnlyTextRef: RefObject<HTMLElement | null>;
}

interface UseHighlightInteractionResult {
  highlighting: UseHighlightingStateResult['highlighting'];
  handleSemanticSegmentClick: SegmentClickHandler;
  clearHighlighting: UseHighlightingStateResult['clearHighlighting'];
  validateSemanticArraySize: UseHighlightingStateResult['validateSemanticArraySize'];
}

/**
 * Owns click-to-highlight: the highlighting reducer, both triggers into it, and the scroll
 * that follows each. See CONTEXT.md's "Click-to-Highlight Lifecycle" for the full story.
 *
 * Trigger 1 — `handleSemanticSegmentClick`: a click in any of the three panels. Three
 * directions: translation-to-original (HIGHLIGHT_BOTH), original-to-translation, and
 * character-only-to-original. The last reuses `findCharacterOnlyMatch` (direction-generic)
 * with source and target swapped. A click scrolls the Original / Translation panels after
 * HIGHLIGHT_SCROLL_DELAY_MS; the pending timer and its mounted flag live here.
 *
 * Trigger 2 — the bridge effect: fires on ANY change to unitIndex / translationUnitIndex
 * (not just clicks), maps the Full Translation (priority) or Original highlight to
 * Character Only unit(s), and a second effect scrolls the Character Only panel to the
 * result. Skipped while `isCharacterOnlyClick`, so a Character Only click is not mapped back.
 */
export function useHighlightInteraction({
  semanticArrays,
  characterOnlySemanticArrays,
  originalTextRef,
  translationTextRef,
  characterOnlyTextRef,
}: UseHighlightInteractionOptions): UseHighlightInteractionResult {
  const {
    highlighting,
    highlightTranslation,
    highlightBoth,
    highlightFromCharacterOnly,
    setCharacterOnlyIndex,
    clearHighlighting,
    validateSemanticArraySize,
  } = useHighlightingState(semanticArrays);
  const { unitIndex, translationUnitIndex, characterOnlyUnitIndex, isCharacterOnlyClick } =
    highlighting;

  // Pending click-scroll timer, and whether the owner is still mounted when it fires.
  const highlightScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (highlightScrollTimeoutRef.current) {
        clearTimeout(highlightScrollTimeoutRef.current);
        highlightScrollTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSemanticSegmentClick = useCallback<SegmentClickHandler>(
    (segmentInfo) => {
      if (segmentInfo.direction === 'translation-to-original') {
        // HIGHLIGHT_BOTH keeps Full Translation highlighted while Original is highlighted
        // too; Character Only follows through the bridge effect.
        highlightBoth(segmentInfo.unitIndex);
        scheduleHighlightScroll(
          highlightScrollTimeoutRef,
          isMountedRef,
          [originalTextRef as RefObject<HTMLElement>],
          segmentInfo.unitIndex,
          HIGHLIGHT_SCROLL_DELAY_MS
        );
      } else if (segmentInfo.direction === 'original-to-translation') {
        highlightTranslation(segmentInfo.unitIndex);
        scheduleHighlightScroll(
          highlightScrollTimeoutRef,
          isMountedRef,
          [translationTextRef as RefObject<HTMLElement>],
          segmentInfo.unitIndex,
          HIGHLIGHT_SCROLL_DELAY_MS
        );
      } else if (segmentInfo.direction === 'character-only-to-original') {
        // Reverse of the bridge effect: findCharacterOnlyMatch is symmetric in its
        // (sourceIndex, sourceArrays, targetArrays) params, so the same scored
        // occurrence-matching (with its MAX_MATCHES cap) applies with source and target swapped.
        if (semanticArrays && semanticArrays.original && characterOnlySemanticArrays) {
          const matchIndices = findCharacterOnlyMatch(
            segmentInfo.unitIndex,
            characterOnlySemanticArrays,
            semanticArrays
          );

          if (matchIndices) {
            const targetIndex = matchIndices[0];
            // Highlights Original and Full Translation, and sets isCharacterOnlyClick
            highlightFromCharacterOnly(targetIndex);
            scheduleHighlightScroll(
              highlightScrollTimeoutRef,
              isMountedRef,
              [
                originalTextRef as RefObject<HTMLElement>,
                translationTextRef as RefObject<HTMLElement>,
              ],
              targetIndex,
              HIGHLIGHT_SCROLL_DELAY_MS
            );
          } else {
            logger.warn(
              `⚠️ No match found for character-only unit ${segmentInfo.unitIndex} in Chinese Text — clearing highlight`
            );
            highlightFromCharacterOnly(-1);
          }
        }
      }
    },
    [
      semanticArrays,
      characterOnlySemanticArrays,
      highlightBoth,
      highlightTranslation,
      highlightFromCharacterOnly,
      originalTextRef,
      translationTextRef,
    ]
  );

  // Bridge match effect: maps Full Translation / Original highlight → Character Only unit(s).
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

  // Bridge scroll effect: after the Character Only index is set, scroll that panel to it.
  useEffect(() => {
    if (characterOnlyUnitIndex === -1) return;

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

  return { highlighting, handleSemanticSegmentClick, clearHighlighting, validateSemanticArraySize };
}
