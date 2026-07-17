/**
 * Semantic Array-Based Clickable Original Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo } from 'react';
import type { ClickableOriginalSemanticProps } from '../../types/ClickableTypes';
import { precomputeOriginalSegments, isUnitHighlighted } from '../../utils/highlighting';
import { useSegmentClickHandler } from '../../hooks/useSegmentClickHandler';
import { HighlightableSegment } from './HighlightableSegment';
import { groupSegmentsIntoParagraphs } from '../../utils/text';
import styles from '../../styles/ClickableOriginalSemantic.module.css';

const ClickableOriginalSemantic: React.FC<ClickableOriginalSemanticProps> = ({
  originalText,
  semanticArrays,
  highlightedUnitIndex = -1,
  highlightedTranslationUnitIndex = -1,
  onSegmentClick,
}) => {
  const handleUnitClick = useSegmentClickHandler(
    semanticArrays,
    onSegmentClick,
    'original-to-translation'
  );

  // Use SegmentPrecomputer to create reliable segments
  const segments = useMemo(() => {
    if (
      !originalText ||
      !semanticArrays ||
      !semanticArrays.original ||
      semanticArrays.original.length === 0
    ) {
      return [];
    }
    return precomputeOriginalSegments(originalText, semanticArrays);
  }, [originalText, semanticArrays]);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  // ISSUE-2 FIX: Use shared utility to eliminate code duplication
  const paragraphs = useMemo(() => groupSegmentsIntoParagraphs(segments), [segments]);

  // Render a single segment with highlighting
  const renderSegment = (segment: any, index: number) => {
    if (segment.isClickable) {
      // CRITICAL-3: Guard against null/undefined to prevent highlight bugs
      const isHighlighted = isUnitHighlighted(
        segment.unitIndex,
        highlightedUnitIndex,
        highlightedTranslationUnitIndex
      );

      return (
        <HighlightableSegment
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          text={segment.text}
          unitIndex={segment.unitIndex}
          isHighlighted={isHighlighted}
          title={`"${segment.originalText}" → "${segment.translatedText}" (${segment.source})`}
          onClick={() => handleUnitClick(segment.unitIndex)}
        />
      );
    } else {
      return (
        <span key={`text-${index}-${segment.start}`} className={styles.nonClickableText}>
          {segment.text}
        </span>
      );
    }
  };

  // Render segments grouped into paragraphs
  const renderSegments = () => {
    if (!originalText) {
      return <div>Chinese text</div>;
    }

    if (segments.length === 0) {
      return <div className={styles.fallback}>{originalText}</div>;
    }

    // Render each paragraph with custom spacing
    return paragraphs.map((paragraphSegments, paragraphIndex) => (
      <div
        key={`paragraph-${paragraphIndex}`}
        className={styles.paragraph}
        style={{
          marginBottom:
            paragraphIndex < paragraphs.length - 1
              ? 'var(--chinese-text-paragraph-spacing, 1rem)'
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

export default React.memo(ClickableOriginalSemantic);
