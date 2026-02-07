/**
 * Semantic Array-Based Clickable Translation Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 */
import React, { useMemo, useEffect, useState } from 'react';
import type {
  ClickableTranslationSemanticProps,
  SegmentClickPayload,
  SegmentClickHandler,
} from '../types/ClickableTypes';
import { SegmentPrecomputer, Segment } from '../utils/SegmentPrecomputer.js';
import { groupSegmentsIntoParagraphs } from '../utils/ParagraphGrouping';
import styles from '../styles/ClickableTranslationSemantic.module.css';
import { logger } from '../utils/logger';
import { sanitizeString } from '../utils/configValidation';
import { normalizeVietnameseText } from '../utils/TextNormalizationHelpers';

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
    // CRITICAL-2 FIX: Use position metadata to handle duplicate units correctly
    if (direction === 'character-only-to-original') {
      // MEDIUM-2 FIX: Validate translatedText before using non-null assertion
      if (!translatedText) {
        logger.warn(
          'translatedText is null/undefined in character-only mode, returning empty segments'
        );
        setSegments([]);
        return;
      }

      // CODE REVIEW FIX: Normalize text BEFORE validation to handle Vietnamese diacritics
      // Issue: Vietnamese diacritics change text length during NFC normalization
      // Example: NFD "màu" = 4 chars (m+a+`+u) → NFC "màu" = 3 chars (m+à+u)
      // Impact: Positions validated before normalization become invalid after
      // Fix: Normalize first, then validate positions against normalized length
      // CODE REVIEW FIX (2026-02-07): Use shared helper instead of inline .normalize('NFC')
      const normalizedTranslatedText = normalizeVietnameseText(translatedText)!;

      const directSegments = [];
      let currentPosition = 0;

      // HIGH-3 FIX: Track performance to detect expensive iterations
      const startTime = performance.now();

      // HIGH-2 FIX: Track previous position for overlap detection
      let previousMetadata: { translatedEnd: number } | null = null;

      // MEDIUM-3 FIX: Warn about large arrays but don't artificially limit processing
      // Previous 10K limit silently skipped units without user notification
      if (semanticArrays.translated.length > 10000) {
        logger.warn('⚠️ Large semantic array detected - highlighting may be slow', {
          arrayLength: semanticArrays.translated.length,
          impact: 'Character-only mode may take longer to render',
        });
      }

      for (let i = 0; i < semanticArrays.translated.length; i++) {
        // MEDIUM-3 FIX: Removed redundant iteration limit check
        // For loop condition already prevents infinite loops
        // Performance monitoring at end catches actual slowness
        const translatedUnit = semanticArrays.translated[i];
        const originalUnit = semanticArrays.original[i];
        const metadata = semanticArrays.metadata[i];

        // CRITICAL-2 FIX: Prefer position metadata over indexOf() search
        // Position metadata is more reliable and handles duplicate units correctly
        let actualPosition: number;
        let unitLength: number;
        let usingMetadata = false;

        if (
          metadata &&
          metadata.translatedStart !== undefined &&
          metadata.translatedStart !== -1 &&
          metadata.translatedEnd !== undefined &&
          metadata.translatedEnd !== -1 &&
          // MEDIUM-2 FIX: Validate position metadata is within text bounds
          // CODE REVIEW FIX: Use normalized text length for validation
          metadata.translatedStart >= 0 &&
          metadata.translatedStart < normalizedTranslatedText.length &&
          metadata.translatedEnd > metadata.translatedStart &&
          metadata.translatedEnd <= normalizedTranslatedText.length
        ) {
          // HIGH-2 FIX: Validate sequential ordering (detect overlapping positions)
          if (previousMetadata && metadata.translatedStart < previousMetadata.translatedEnd) {
            logger.error('❌ Overlapping position metadata detected - REJECTING!', {
              unitIndex: i,
              translatedUnit,
              currentStart: metadata.translatedStart,
              currentEnd: metadata.translatedEnd,
              previousEnd: previousMetadata.translatedEnd,
              overlap: previousMetadata.translatedEnd - metadata.translatedStart,
              impact: 'Using indexOf fallback to prevent duplicate position mappings',
            });
            // Fall through to indexOf fallback (don't use overlapping metadata)
          } else {
            // Use position metadata (set during translation)
            actualPosition = metadata.translatedStart;
            unitLength = metadata.translatedEnd - metadata.translatedStart;
            usingMetadata = true;
            previousMetadata = { translatedEnd: metadata.translatedEnd };
          }
        }

        if (!usingMetadata) {
          // MEDIUM-2 FIX: Log metadata validation failure in development
          if (
            process.env.NODE_ENV === 'development' &&
            metadata &&
            metadata.translatedStart !== undefined &&
            metadata.translatedStart !== -1 &&
            metadata.translatedEnd !== undefined &&
            metadata.translatedEnd !== -1
          ) {
            logger.warn('⚠️ Position metadata failed bounds validation - using indexOf fallback', {
              unitIndex: i,
              translatedUnit,
              metadataStart: metadata.translatedStart,
              metadataEnd: metadata.translatedEnd,
              textLength: normalizedTranslatedText.length,
              reason:
                metadata.translatedStart < 0
                  ? 'Negative start position'
                  : metadata.translatedStart >= normalizedTranslatedText.length
                    ? 'Start position beyond text length'
                    : metadata.translatedEnd <= metadata.translatedStart
                      ? 'End position not after start'
                      : metadata.translatedEnd > normalizedTranslatedText.length
                        ? 'End position beyond text length'
                        : 'Unknown validation failure',
            });
          }

          // CRITICAL FIX: Use case-insensitive indexOf for character-only mode
          // After applyLightFormatting() capitalizes text (e.g., "vu" → "Vu"), semantic units
          // (built before formatting) are still lowercase. Case-sensitive indexOf fails, causing
          // units to be skipped and text like periods to disappear.
          const lowerText = normalizedTranslatedText.toLowerCase();
          const lowerUnit = translatedUnit.toLowerCase();
          const unitPosition = lowerText.indexOf(lowerUnit, currentPosition);

          if (unitPosition === -1) {
            // HIGH-1 FIX: Update currentPosition before skipping to prevent overlapping segments
            // Without this, next unit searches from stale position, causing duplicate mappings
            currentPosition++;
            continue;
          }

          actualPosition = unitPosition;
          unitLength = translatedUnit.length;
        }

        // CRITICAL-3 FIX: Validate position consistency between methods
        // CRITICAL-4 FIX: Use offset-based indexOf to avoid O(n*m) performance in validation
        // TypeScript note: When usingMetadata is true, actualPosition is guaranteed to be assigned (lines 98-99)
        if (process.env.NODE_ENV === 'development' && usingMetadata) {
          const indexOfPosition = normalizedTranslatedText.indexOf(translatedUnit, currentPosition);
          if (indexOfPosition !== -1 && actualPosition! !== indexOfPosition) {
            logger.error('❌ Character-only position mismatch detected!', {
              unitIndex: i,
              translatedUnit,
              metadataPosition: actualPosition!,
              indexOfPosition: indexOfPosition,
              impact: 'Inconsistent highlighting between methods',
            });
          }
        }

        // Add any non-semantic text before this unit
        // TypeScript note: actualPosition and unitLength are guaranteed to be assigned here
        // If metadata/indexOf failed, we would have continued at line 144
        if (actualPosition! > currentPosition) {
          const nonSemanticText = normalizedTranslatedText.substring(
            currentPosition,
            actualPosition!
          );
          directSegments.push({
            type: 'text' as const,
            text: nonSemanticText,
            start: currentPosition,
            end: actualPosition!,
            unitIndex: -1,
            isClickable: false as const,
          });
        }

        // Add the semantic unit
        // CRITICAL FIX: Extract text from the formatted text (preserves capitalization)
        // instead of using translatedUnit from semantic array (which is pre-formatting lowercase)
        const actualText = normalizedTranslatedText.substring(
          actualPosition!,
          actualPosition! + unitLength!
        );

        directSegments.push({
          type: 'semantic' as const,
          text: actualText,
          start: actualPosition!,
          end: actualPosition! + unitLength!,
          unitIndex: i,
          originalText: originalUnit,
          translatedText: actualText,
          isClickable: true as const,
        });

        currentPosition = actualPosition! + unitLength!;
      }

      // HIGH-3 FIX: Log performance warning if iteration took too long
      const elapsedMs = performance.now() - startTime;
      if (elapsedMs > 10) {
        logger.warn('⚠️ Character-only segment computation took longer than expected', {
          elapsedMs: elapsedMs.toFixed(2),
          iterationCount: semanticArrays.translated.length,
          segmentCount: directSegments.length,
          impact: 'May cause UI jank during rapid mode switching',
        });
      }

      // Add any remaining text
      if (currentPosition < normalizedTranslatedText.length) {
        const remainingText = normalizedTranslatedText.substring(currentPosition);
        directSegments.push({
          type: 'text' as const,
          text: remainingText,
          start: currentPosition,
          end: normalizedTranslatedText.length,
          unitIndex: -1,
          isClickable: false as const,
        });
      }

      setSegments(directSegments);
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
