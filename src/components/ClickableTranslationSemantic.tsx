/**
 * Semantic Array-Based Clickable Translation Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo } from 'react';
import type { ClickableTranslationSemanticProps } from '../types/ClickableTypes';
import { SegmentPrecomputer } from '../utils/SegmentPrecomputer.js';
import styles from '../styles/ClickableTranslationSemantic.module.css';
import { logger } from '../utils/logger';

const ClickableTranslationSemantic: React.FC<ClickableTranslationSemanticProps> = ({
  translatedText,
  semanticArrays,
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
  direction = 'translation-to-original',
}) => {
  // Use SegmentPrecomputer to create reliable segments, with special handling for character-only
  const segments = useMemo(() => {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return [];
    }

    // For character-only translation, use position metadata when available (more reliable than indexOf)
    // CRITICAL-2 FIX: Use position metadata to handle duplicate units correctly
    if (direction === 'character-only-to-original') {
      const directSegments = [];
      let currentPosition = 0;

      for (let i = 0; i < semanticArrays.translated.length; i++) {
        const translatedUnit = semanticArrays.translated[i];
        const originalUnit = semanticArrays.original[i];
        const metadata = semanticArrays.metadata[i];

        // CRITICAL-2 FIX: Prefer position metadata over indexOf() search
        // Position metadata is more reliable and handles duplicate units correctly
        let actualPosition;
        let unitLength;

        if (
          metadata &&
          metadata.translatedStart !== undefined &&
          metadata.translatedStart !== -1 &&
          metadata.translatedEnd !== undefined &&
          metadata.translatedEnd !== -1
        ) {
          // Use position metadata (set during translation)
          actualPosition = metadata.translatedStart;
          unitLength = metadata.translatedEnd - metadata.translatedStart;
        } else {
          // Fallback to indexOf() search if position metadata not available
          const remainingText = translatedText!.substring(currentPosition);
          const unitPosition = remainingText.indexOf(translatedUnit);

          if (unitPosition === -1) {
            // Unit not found, skip
            continue;
          }

          actualPosition = currentPosition + unitPosition;
          unitLength = translatedUnit.length;
        }

        // Add any non-semantic text before this unit
        if (actualPosition > currentPosition) {
          const nonSemanticText = translatedText!.substring(currentPosition, actualPosition);
          directSegments.push({
            type: 'text' as const,
            text: nonSemanticText,
            start: currentPosition,
            end: actualPosition,
            unitIndex: -1,
            isClickable: false as const,
          });
        }

        // Add the semantic unit
        directSegments.push({
          type: 'semantic' as const,
          text: translatedUnit,
          start: actualPosition,
          end: actualPosition + unitLength,
          unitIndex: i,
          originalText: originalUnit,
          translatedText: translatedUnit,
          isClickable: true as const,
        });

        currentPosition = actualPosition + unitLength;
      }

      // Add any remaining text
      if (translatedText && currentPosition < translatedText.length) {
        const remainingText = translatedText.substring(currentPosition);
        directSegments.push({
          type: 'text' as const,
          text: remainingText,
          start: currentPosition,
          end: translatedText.length,
          unitIndex: -1,
          isClickable: false as const,
        });
      }

      return directSegments;
    }

    // For other translations, use the existing SegmentPrecomputer
    const computedSegments = SegmentPrecomputer.precomputeSegments(translatedText!, semanticArrays);
    return computedSegments;
  }, [translatedText, semanticArrays, direction]);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  const paragraphs = useMemo(() => {
    if (segments.length === 0) return [];

    const result = [];
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

  // Handle click on a semantic unit
  const handleUnitClick = (unitIndex: number) => {
    // LOW-PRIORITY FIX: Add error messaging for invalid indices
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

    // Call the callback with the semantic unit information
    if (onSegmentClick) {
      (onSegmentClick as any)({
        unitIndex,
        originalText,
        translatedText,
        source: metadata.source,
        metadata,
        direction: direction,
      });
    }
  };

  // Render a single segment with highlighting
  const renderSegment = (segment: any, index: number) => {
    if (segment.isClickable) {
      // Handle both single index and array of indices for highlighting
      const isHighlighted = Array.isArray(highlightedTranslationUnitIndex)
        ? highlightedTranslationUnitIndex.includes(segment.unitIndex)
        : highlightedTranslationUnitIndex === segment.unitIndex;

      return (
        <span
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          data-unit-index={segment.unitIndex}
          onClick={() => handleUnitClick(segment.unitIndex)}
          className={`${styles.clickableSegment} ${isHighlighted ? styles.clickableSegmentHighlighted : ''}`}
          title={`Click to highlight "${segment.originalText}" (${segment.source})`}
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
