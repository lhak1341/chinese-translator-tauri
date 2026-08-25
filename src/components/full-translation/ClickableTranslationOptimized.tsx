/**
 * Optimized Clickable Translation Component
 * Uses pre-computed segments and memoization for maximum performance
 */
import React, { useMemo, useCallback } from 'react';
import type {
  ClickableTranslationOptimizedProps,
  SegmentComponentProps,
} from '../../types/ClickableTypes';
import styles from '../../styles/ClickableTranslationOptimized.module.css';
import { sanitizeString } from '../../utils/configValidation';
import { isUnitHighlighted } from '../../utils/highlighting';
import { useSegmentClickHandler } from '../../hooks/useSegmentClickHandler';

// Memoized segment component to prevent unnecessary re-renders
const SegmentComponent: React.FC<SegmentComponentProps> = React.memo(
  ({ segment, onClick, isHighlighted }) => {
    // PERFORMANCE FIX: Extract primitive values to prevent closure recreation
    // Using segment object as dependency causes handleClick to recreate on every highlight
    // change (100+ closures per click). Instead, depend only on primitive values.
    const isClickable = segment.isClickable;
    const unitIndex = segment.unitIndex;

    const handleClick = useCallback(() => {
      if (isClickable) {
        onClick(unitIndex);
      }
    }, [isClickable, unitIndex, onClick]);

    const className = useMemo(() => {
      const classes = [styles.segment];
      if (segment.isClickable) {
        classes.push(styles.clickableSegment);
        if (isHighlighted) {
          classes.push(styles.clickableSegmentHighlighted);
        }
      }
      return classes.join(' ');
    }, [segment.isClickable, isHighlighted]);

    return (
      <span
        key={segment.key}
        data-unit-index={segment.unitIndex}
        onClick={handleClick}
        className={className}
        title={
          segment.isClickable
            ? `"${sanitizeString(segment.text || '', 100)}" ← translation (${segment.source || 'unknown'})`
            : undefined
        }
      >
        {segment.text}
      </span>
    );
  }
);

SegmentComponent.displayName = 'SegmentComponent';

const ClickableTranslationOptimized: React.FC<ClickableTranslationOptimizedProps> = ({
  translatedText,
  semanticArrays,
  prebuiltSegments = [],
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
}) => {
  // Use prebuilt segments for instant clickable highlighting (no computation needed!)
  const precomputedSegments = useMemo(() => {
    if (prebuiltSegments && prebuiltSegments.length > 0) {
      return prebuiltSegments;
    }

    // HIGH-4 FIX: Return null (not empty array) to distinguish "no segments yet" from "no segments available"
    // This prevents flash of blank content while segments are being computed
    // LOW-3 ANALYSIS: This distinction IS used - null means "loading", [] means "no segments"
    // The fallback check `renderSegments.length === 0` happens AFTER segments are computed
    return prebuiltSegments === undefined ? null : [];
  }, [prebuiltSegments]);

  // Create render segments only when highlight changes
  const renderSegments = useMemo(() => {
    // HIGH-4 FIX: Handle null precomputedSegments (still loading)
    if (!precomputedSegments) return [];

    return precomputedSegments.map((segment, index) => ({
      ...segment,
      key: `segment-${index}-${segment.unitIndex || 'na'}`,
      text: segment.translatedText || segment.text,
      // CRITICAL-4 FIX: Explicit null/undefined guards before comparison
      // Prevents silent failures if state corruption occurs
      // CODE REVIEW FIX: Support both single index and array of indices for highlighting
      // Matches ClickableTranslationSemantic behavior for consistency across dual-path architecture
      isHighlighted: isUnitHighlighted(segment.unitIndex, highlightedTranslationUnitIndex),
    }));
  }, [precomputedSegments, highlightedTranslationUnitIndex]);

  // Group segments into paragraphs (every newline creates a paragraph break).
  // Consecutive newlines produce empty paragraphs so blank lines from the source
  // Chinese text are preserved in the Vietnamese rendering. Empty paragraphs
  // get visible height via the .paragraph CSS min-height rule.
  const paragraphs = useMemo(() => {
    if (renderSegments.length === 0) return [];

    const result: any[][] = [];
    let currentParagraph: any[] = [];

    for (let i = 0; i < renderSegments.length; i++) {
      const segment = renderSegments[i];

      if (segment.text.includes('\n')) {
        const parts = segment.text.split('\n');

        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];

          if (part) {
            currentParagraph.push({ ...segment, text: part });
          }

          if (j < parts.length - 1) {
            result.push(currentParagraph);
            currentParagraph = [];
          }
        }
      } else {
        currentParagraph.push(segment);
      }
    }

    result.push(currentParagraph);

    return result;
  }, [renderSegments]);

  // Routes through the shared click-payload seam (useSegmentClickHandler) instead of
  // hand-building SegmentClickPayload here — recovers the bounds guard the other two
  // Clickable* components already get, and drops to 3 handleClick deps instead of 6.
  // SegmentClickPayload carries only unitIndex + direction (trimmed 2026-08-24) — no
  // consumer reads more than that.
  const handleSegmentClick = useSegmentClickHandler(
    semanticArrays,
    onSegmentClick,
    'translation-to-original'
  );

  // No loading state needed - segments are prebuilt!

  // Fallback for when no semantic arrays are available
  if (!semanticArrays || renderSegments.length === 0) {
    return <span className={styles.fallback}>{translatedText}</span>;
  }

  // Render optimized segments grouped into paragraphs
  return (
    <div className={styles.container}>
      {paragraphs.map((paragraphSegments, paragraphIndex) => (
        <div
          key={`paragraph-${paragraphIndex}`}
          className={styles.paragraph}
          style={{
            marginBottom:
              paragraphIndex < paragraphs.length - 1
                ? 'var(--full-translation-paragraph-spacing, 1rem)'
                : '0',
          }}
        >
          {paragraphSegments.map((segment: any) => (
            <SegmentComponent
              key={segment.key}
              segment={segment}
              onClick={handleSegmentClick}
              isHighlighted={segment.isHighlighted}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// Memoize the entire component to prevent unnecessary re-renders
export default React.memo(ClickableTranslationOptimized);
