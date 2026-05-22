/**
 * Semantic Array-Based Clickable Translation Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo, useEffect, useState } from 'react';
import type {
  ClickableTranslationSemanticProps,
  SegmentClickPayload,
  SegmentClickHandler,
} from '../../types/ClickableTypes';
import { SegmentPrecomputer } from '../../utils/highlighting';
import type { Segment } from '../../utils/highlighting';
import { groupSegmentsIntoParagraphs } from '../../utils/text';
import styles from '../../styles/ClickableTranslationSemantic.module.css';
import { logger } from '../../utils/logger';
import { sanitizeString } from '../../utils/configValidation';

const ClickableTranslationSemantic: React.FC<ClickableTranslationSemanticProps> = ({
  translatedText,
  semanticArrays,
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
  direction = 'translation-to-original',
}) => {
  // State to hold computed segments (needed because SegmentPrecomputer.precomputeSegments is async)
  const [segments, setSegments] = useState<Segment[]>([]);

  // Compute segments synchronously for character-only mode, or async for other modes
  useEffect(() => {
    // Early exit for invalid data
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      setSegments([]);
      return;
    }

    // For character-only translation, use position metadata when available (more reliable than indexOf)
    if (direction === 'character-only-to-original') {
      if (!translatedText) {
        logger.warn(
          'translatedText is null/undefined in character-only mode, returning empty segments'
        );
        setSegments([]);
        return;
      }
      setSegments(SegmentPrecomputer.precomputeSegmentsSync(translatedText, semanticArrays));
      return;
    }

    // For other translations, use the existing SegmentPrecomputer (async)
    // MEDIUM-2 FIX: Validate translatedText before using non-null assertion
    if (!translatedText) {
      logger.warn('translatedText is null/undefined, returning empty segments');
      setSegments([]);
      return;
    }

    // Call async precomputeSegments with cancellation guard
    let cancelled = false;
    (async () => {
      const computedSegments = await SegmentPrecomputer.precomputeSegments(
        translatedText,
        semanticArrays
      );
      if (!cancelled) {
        setSegments(computedSegments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [translatedText, semanticArrays, direction]);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  // ISSUE-1 FIX: Use shared utility to eliminate code duplication
  const paragraphs = useMemo(() => groupSegmentsIntoParagraphs(segments), [segments]);

  // Handle click on a semantic unit
  const handleUnitClick = (unitIndex: number) => {
    // HIGH-1 FIX: Add comprehensive null/undefined guards
    if (!semanticArrays) {
      logger.error('❌ handleUnitClick called with no semantic arrays');
      return;
    }

    if (unitIndex < 0 || unitIndex >= semanticArrays.original.length) {
      logger.error(
        `❌ handleUnitClick: unitIndex ${unitIndex} out of bounds (length: ${semanticArrays.original.length})`
      );
      return;
    }

    const originalText = semanticArrays.original[unitIndex];
    const translatedText = semanticArrays.translated[unitIndex];
    const metadata = semanticArrays.metadata[unitIndex];

    // Debug: Log which component is handling the click
    if (process.env.NODE_ENV === 'development') {
      logger.log(`🎯 ClickableTranslationSemantic (${direction}) handling click:`, {
        unitIndex,
        originalText,
        translatedText,
      });
    }

    // CRITICAL-6 FIX: Use proper SegmentClickPayload type with explicit handler cast
    // Cast is needed because FlexibleClickHandler is a union type (SegmentClickHandler | SimpleClickHandler)
    // TypeScript can't infer which one without the cast, but we know we're using SegmentClickHandler
    if (onSegmentClick) {
      const payload: SegmentClickPayload = {
        unitIndex,
        originalText,
        translatedText,
        source: metadata.source,
        metadata,
        direction: direction,
      };
      (onSegmentClick as SegmentClickHandler)(payload);
    }
  };

  // Render a single segment with highlighting
  const renderSegment = (segment: any, index: number) => {
    if (segment.isClickable) {
      // Handle both single index and array of indices for highlighting
      // SAFETY: Guard against null/undefined (default param is -1, but explicit null bypasses it)
      const isHighlighted =
        highlightedTranslationUnitIndex !== null &&
        highlightedTranslationUnitIndex !== undefined &&
        (Array.isArray(highlightedTranslationUnitIndex)
          ? highlightedTranslationUnitIndex.includes(segment.unitIndex)
          : highlightedTranslationUnitIndex === segment.unitIndex);

      return (
        <span
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          data-unit-index={segment.unitIndex}
          onClick={() => handleUnitClick(segment.unitIndex)}
          className={`${styles.clickableSegment} ${isHighlighted ? styles.clickableSegmentHighlighted : ''}`}
          title={`Click to highlight "${sanitizeString(segment.originalText || '', 100)}" (${segment.source})`}
        >
          {segment.text}
        </span>
      );
    } else {
      // Non-clickable text (spaces, punctuation, etc.)
      return (
        <span
          key={`text-${index}-${segment.start}`}
          className={segment.type === 'space' ? '' : styles.nonClickableText}
        >
          {segment.text}
        </span>
      );
    }
  };

  // Render segments grouped into paragraphs
  const renderSegments = () => {
    if (segments.length === 0) {
      return <span>{translatedText}</span>;
    }

    // Render each paragraph with custom spacing
    return paragraphs.map((paragraphSegments, paragraphIndex) => (
      <div
        key={`paragraph-${paragraphIndex}`}
        className={styles.paragraph}
        style={{
          marginBottom:
            paragraphIndex < paragraphs.length - 1
              ? 'var(--character-only-paragraph-spacing, 1rem)'
              : '0',
        }}
      >
        {paragraphSegments.map((segment: any, segmentIndex: number) =>
          renderSegment(segment, segmentIndex)
        )}
      </div>
    ));
  };

  return <div className={styles.container}>{renderSegments()}</div>;
};

export default React.memo(ClickableTranslationSemantic);
