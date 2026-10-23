import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  findCharacterOnlyMatch,
  resolveHighlights,
  scheduleHighlightScroll,
  scrollToHighlightedElement,
  HIGHLIGHT_SCROLL_DELAY_MS,
} from '../utils/highlighting';
import type { LitUnit, ResolvedHighlights, SemanticArrays } from '../utils/highlighting';
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
  highlighting: ResolvedHighlights;
  handleSemanticSegmentClick: SegmentClickHandler;
  clearHighlighting: () => void;
}

/**
 * Owns click-to-highlight: the lit unit, the three click directions, and the scroll that follows
 * each. See GLOSSARY.md's "Click-to-Highlight Lifecycle" for the full story.
 *
 * State is one lit unit (`LitUnit`: an index into the current `semanticArrays`, and whether the
 * click came from the Character Only panel). `resolveHighlights` derives the indices the three
 * panels show from it, so the Character Only side is never stored and cannot go stale.
 *
 * `handleSemanticSegmentClick`: a click in any of the three panels. translation-to-original and
 * original-to-translation light the clicked unit; character-only-to-original reuses
 * `findCharacterOnlyMatch` (direction-generic) with source and target swapped to find the unit
 * to light. A click scrolls the Original / Translation panels after HIGHLIGHT_SCROLL_DELAY_MS; the
 * pending timer and its mounted flag live here. An effect scrolls the Character Only panel to
 * whatever the resolver mapped to, after the same delay.
 */
export function useHighlightInteraction({
  semanticArrays,
  characterOnlySemanticArrays,
  originalTextRef,
  translationTextRef,
  characterOnlyTextRef,
}: UseHighlightInteractionOptions): UseHighlightInteractionResult {
  const [lit, setLit] = useState<LitUnit | null>(null);
  const highlighting = useMemo(
    () => resolveHighlights(lit, semanticArrays, characterOnlySemanticArrays),
    [lit, semanticArrays, characterOnlySemanticArrays]
  );
  const { characterOnlyUnitIndex } = highlighting;

  const clearHighlighting = useCallback(() => setLit(null), []);

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
        if (semanticArrays) {
          setLit({
            index: segmentInfo.unitIndex,
            arrays: semanticArrays,
            fromCharacterOnly: false,
          });
        }
        scheduleHighlightScroll(
          highlightScrollTimeoutRef,
          isMountedRef,
          [originalTextRef as RefObject<HTMLElement>],
          segmentInfo.unitIndex,
          HIGHLIGHT_SCROLL_DELAY_MS
        );
      } else if (segmentInfo.direction === 'original-to-translation') {
        if (semanticArrays) {
          setLit({
            index: segmentInfo.unitIndex,
            arrays: semanticArrays,
            fromCharacterOnly: false,
          });
        }
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
            // Lights Original and Full Translation; the Character Only panel stays unlit
            setLit({ index: targetIndex, arrays: semanticArrays, fromCharacterOnly: true });
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
            setLit(null);
          }
        }
      }
    },
    [semanticArrays, characterOnlySemanticArrays, originalTextRef, translationTextRef]
  );

  // After the Character Only index resolves, scroll that panel to it.
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

  return { highlighting, handleSemanticSegmentClick, clearHighlighting };
}
