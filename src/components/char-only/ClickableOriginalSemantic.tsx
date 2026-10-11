/**
 * Semantic Array-Based Clickable Original Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo } from 'react';
import type { ClickableOriginalSemanticProps } from '../../types/ClickableTypes';
import { precomputeOriginalSegments, isUnitHighlighted } from '../../utils/highlighting';
import { useSegmentClickHandler } from '../../hooks/useSegmentClickHandler';
import { renderSegmentedContent } from './SegmentedParagraphs';
import { groupSegmentsIntoParagraphs } from '../../utils/text';
import { sanitizeString } from '../../utils/configValidation';
import styles from '../../styles/ClickableOriginalSemantic.module.css';

const ClickableOriginalSemantic: React.FC<ClickableOriginalSemanticProps> = ({
  originalText,
  semanticArrays,
  highlightedUnitIndex = -1,
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

  // CRITICAL-3: Guard against null/undefined to prevent highlight bugs — isUnitHighlighted
  // treats -1 as the "cleared" sentinel regardless.
  return renderSegmentedContent({
    segments,
    paragraphs,
    getTitle: (segment: any) =>
      `"${sanitizeString(segment.originalText || '', 100)}" → "${sanitizeString(segment.translatedText || '', 100)}" (${segment.source})`,
    isHighlighted: (segment: any) => isUnitHighlighted(segment.unitIndex, highlightedUnitIndex),
    onUnitClick: handleUnitClick,
    getNonClickableClassName: () => styles.nonClickableText,
    renderFallback: () =>
      !originalText ? (
        <div>Chinese text</div>
      ) : (
        <div className={styles.fallback}>{originalText}</div>
      ),
    containerClassName: styles.container,
    paragraphClassName: styles.paragraph,
    paragraphSpacingVar: '--chinese-text-paragraph-spacing',
  });
};

export default React.memo(ClickableOriginalSemantic);
