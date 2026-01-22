/**
 * Semantic Array-Based Clickable Original Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import { useMemo } from 'react';
import type { ClickableOriginalSemanticProps } from '../types/ClickableTypes';
import { SegmentPrecomputer } from '../utils/SegmentPrecomputer.js';
import styles from '../styles/ClickableOriginalSemantic.module.css';
import { logger } from '../utils/logger';

const ClickableOriginalSemantic: React.FC<ClickableOriginalSemanticProps> = ({
  originalText,
  semanticArrays,
  highlightedUnitIndex = -1,
  highlightedTranslationUnitIndex = -1,
  onSegmentClick,
}) => {
  // Handle click on a semantic unit in original text
  const handleUnitClick = (unitIndex: number) => {
    if (!semanticArrays || unitIndex >= semanticArrays.original.length) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Invalid unit index or no semantic arrays:', unitIndex);
      }
      return;
    }

    const originalText = semanticArrays.original[unitIndex];
    const translatedText = semanticArrays.translated[unitIndex];
    const metadata = semanticArrays.metadata[unitIndex];

    // Debug: Log which component is handling the click
    if (process.env.NODE_ENV === 'development') {
      logger.log(`🎯 ClickableOriginalSemantic (original-to-translation) handling click:`, {
        unitIndex,
        originalText,
        translatedText,
      });
    }

    // Call the callback to highlight the corresponding translation
    if (onSegmentClick) {
      (onSegmentClick as any)({
        unitIndex,
        originalText,
        translatedText,
        source: metadata.source,
        metadata,
        direction: 'original-to-translation',
      });
    }
  };

  // Use SegmentPrecomputer to create reliable segments
  const segments = useMemo(() => {
    if (!semanticArrays || !semanticArrays.original || semanticArrays.original.length === 0) {
      return [];
    }
    return SegmentPrecomputer.precomputeOriginalSegments(originalText!, semanticArrays);
  }, [originalText, semanticArrays]);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  const paragraphs = useMemo(() => {
    if (segments.length === 0) return [];

    const result: any[][] = [];
    let currentParagraph: any[] = [];

    for (const segment of segments) {
      // Split by single newlines to detect indented paragraphs
      const lines = segment.text.split(/(\n)/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line === '\n') {
          // Check if next line (if exists) starts with indentation or is empty
          const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

          if (nextLine === '\n' || nextLine.match(/^[\u3000\s　]+/)) {
            // Next line is blank or starts with indentation - paragraph break
            if (currentParagraph.length > 0) {
              result.push(currentParagraph);
              currentParagraph = [];
            }
            // Skip the newline itself
            continue;
          } else {
            // Regular newline within paragraph
            currentParagraph.push({ ...segment, text: line });
          }
        } else if (line) {
          // Non-empty text
          currentParagraph.push({ ...segment, text: line });
        }
      }
    }

    // Add final paragraph
    if (currentParagraph.length > 0) {
      result.push(currentParagraph);
    }

    return result;
  }, [segments]);

  // Render a single segment with highlighting
  const renderSegment = (segment: any, index: number) => {
    if (segment.isClickable) {
      // CRITICAL-3: Guard against null/undefined to prevent highlight bugs
      const isHighlighted =
        (highlightedUnitIndex !== null &&
          highlightedUnitIndex !== undefined &&
          highlightedUnitIndex === segment.unitIndex) ||
        (highlightedTranslationUnitIndex !== null &&
          highlightedTranslationUnitIndex !== undefined &&
          highlightedTranslationUnitIndex === segment.unitIndex);

      return (
        <span
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          data-unit-index={segment.unitIndex}
          onClick={() => handleUnitClick(segment.unitIndex)}
          className={`${styles.clickableSegment} ${isHighlighted ? styles.clickableSegmentHighlighted : ''}`}
          title={`"${segment.originalText}" → "${segment.translatedText}" (${segment.source})`}
        >
          {segment.text}
        </span>
      );
    } else {
      // Non-clickable text (characters, punctuation, etc.)
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

export default ClickableOriginalSemantic;
