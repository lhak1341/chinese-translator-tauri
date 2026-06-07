/**
 * Semantic Array-Based Clickable Translation Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo } from 'react';
import type { ClickableTranslationSemanticProps } from '../../types/ClickableTypes';
import { useSegmentComputation } from '../../hooks/useSegmentComputation';
import { useSegmentClickHandler } from '../../hooks/useSegmentClickHandler';
import { HighlightableSegment } from './HighlightableSegment';
import { groupSegmentsIntoParagraphs } from '../../utils/text';
import styles from '../../styles/ClickableTranslationSemantic.module.css';
import { sanitizeString } from '../../utils/configValidation';

const ClickableTranslationSemantic: React.FC<ClickableTranslationSemanticProps> = ({
  translatedText,
  semanticArrays,
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
  direction = 'translation-to-original',
}) => {
  const segments = useSegmentComputation(direction, translatedText, semanticArrays);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  // ISSUE-1 FIX: Use shared utility to eliminate code duplication
  const paragraphs = useMemo(() => groupSegmentsIntoParagraphs(segments), [segments]);

  const handleUnitClick = useSegmentClickHandler(semanticArrays, onSegmentClick, direction);

  // Render a single segment with highlighting
  const renderSegment = (segment: any, index: number) => {
    if (segment.isClickable) {
      // SAFETY: Guard against null/undefined (default param is -1, but explicit null bypasses it)
      const isHighlighted =
        highlightedTranslationUnitIndex !== null &&
        highlightedTranslationUnitIndex !== undefined &&
        (Array.isArray(highlightedTranslationUnitIndex)
          ? highlightedTranslationUnitIndex.includes(segment.unitIndex)
          : highlightedTranslationUnitIndex === segment.unitIndex);

      return (
        <HighlightableSegment
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          text={segment.text}
          unitIndex={segment.unitIndex}
          isHighlighted={isHighlighted}
          title={`Click to highlight "${sanitizeString(segment.originalText || '', 100)}" (${segment.source})`}
          onClick={() => handleUnitClick(segment.unitIndex)}
        />
      );
    } else {
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
