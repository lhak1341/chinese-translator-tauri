/**
 * Semantic Array-Based Clickable Translation Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo } from 'react';
import type { ClickableTranslationSemanticProps } from '../../types/ClickableTypes';
import { useCharacterOnlySegments } from '../../hooks/useCharacterOnlySegments';
import { useSegmentClickHandler } from '../../hooks/useSegmentClickHandler';
import { renderSegmentedContent } from './SegmentedParagraphs';
import { groupSegmentsIntoParagraphs } from '../../utils/text';
import { isUnitHighlighted } from '../../utils/highlighting';
import styles from '../../styles/ClickableTranslationSemantic.module.css';
import { sanitizeString } from '../../utils/configValidation';

const ClickableTranslationSemantic: React.FC<ClickableTranslationSemanticProps> = ({
  translatedText,
  semanticArrays,
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
}) => {
  const segments = useCharacterOnlySegments(translatedText, semanticArrays);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  // ISSUE-1 FIX: Use shared utility to eliminate code duplication
  const paragraphs = useMemo(() => groupSegmentsIntoParagraphs(segments), [segments]);

  const handleUnitClick = useSegmentClickHandler(
    semanticArrays,
    onSegmentClick,
    'character-only-to-original'
  );

  // SAFETY: Guard against null/undefined (default param is -1, but explicit null bypasses it)
  return renderSegmentedContent({
    segments,
    paragraphs,
    getTitle: (segment: any) =>
      `Click to highlight "${sanitizeString(segment.originalText || '', 100)}" (${segment.source})`,
    isHighlighted: (segment: any) =>
      isUnitHighlighted(segment.unitIndex, highlightedTranslationUnitIndex),
    onUnitClick: handleUnitClick,
    getNonClickableClassName: (segment: any) =>
      segment.type === 'space' ? '' : styles.nonClickableText,
    renderFallback: () => <span>{translatedText}</span>,
    containerClassName: styles.container,
    paragraphClassName: styles.paragraph,
    paragraphSpacingVar: '--character-only-paragraph-spacing',
  });
};

export default React.memo(ClickableTranslationSemantic);
