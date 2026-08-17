import { logger } from '../logger';
import { normalizeVietnameseText } from '../text/TextNormalizationHelpers';
import type { SemanticArrays, Segment } from './SegmentPrecomputer';

/**
 * Synchronously compute clickable segments for the character-only rendering path.
 *
 * Uses translatedStart/End from metadata when valid; falls back to case-insensitive
 * indexOf. Suitable only when metadata positions are already set during translation
 * (character-only path where all units carry translatedStart/End).
 *
 * Caller: ClickableTranslationSemantic (char-only path).
 * The full-translation path builds segments differently — see
 * ChunkPostProcessor.reconstructTextWithSegments (single-pass) and
 * WordSegmentMatcher.matchWordSegments (progressive batches).
 */
export function segmentFromPositionMetadata(
  text: string,
  semanticArrays: SemanticArrays
): Segment[] {
  if (!semanticArrays.translated.length) return [];

  const normalizedText = normalizeVietnameseText(text)!;
  const directSegments: Segment[] = [];
  let currentPosition = 0;
  const startTime = performance.now();

  if (semanticArrays.translated.length > 10000) {
    logger.warn('⚠️ Large semantic array detected - highlighting may be slow', {
      arrayLength: semanticArrays.translated.length,
      impact: 'Character-only mode may take longer to render',
    });
  }

  let previousMetadata: { translatedEnd: number } | null = null;

  for (let i = 0; i < semanticArrays.translated.length; i++) {
    const translatedUnit = semanticArrays.translated[i];
    const originalUnit = semanticArrays.original[i];
    const metadata = semanticArrays.metadata[i];

    let actualPosition = -1;
    let unitLength = -1;
    let usingMetadata = false;

    if (
      metadata &&
      metadata.translatedStart !== undefined &&
      metadata.translatedStart !== -1 &&
      metadata.translatedEnd !== undefined &&
      metadata.translatedEnd !== -1 &&
      metadata.translatedStart >= 0 &&
      metadata.translatedStart < normalizedText.length &&
      metadata.translatedEnd > metadata.translatedStart &&
      metadata.translatedEnd <= normalizedText.length
    ) {
      if (
        (previousMetadata && metadata.translatedStart < previousMetadata.translatedEnd) ||
        metadata.translatedStart < currentPosition
      ) {
        logger.error('❌ Overlapping position metadata detected - REJECTING!', {
          unitIndex: i,
          translatedUnit,
          currentStart: metadata.translatedStart,
          currentEnd: metadata.translatedEnd,
          previousEnd: previousMetadata?.translatedEnd ?? -1,
          currentPosition,
          overlap: Math.max(
            previousMetadata ? previousMetadata.translatedEnd - metadata.translatedStart : 0,
            currentPosition - metadata.translatedStart
          ),
          impact: 'Using indexOf fallback to prevent duplicate position mappings',
        });
      } else {
        actualPosition = metadata.translatedStart;
        unitLength = metadata.translatedEnd - metadata.translatedStart;
        usingMetadata = true;
        previousMetadata = { translatedEnd: metadata.translatedEnd };
      }
    }

    if (!usingMetadata) {
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
          textLength: normalizedText.length,
          reason:
            metadata.translatedStart < 0
              ? 'Negative start position'
              : metadata.translatedStart >= normalizedText.length
                ? 'Start position beyond text length'
                : metadata.translatedEnd <= metadata.translatedStart
                  ? 'End position not after start'
                  : metadata.translatedEnd > normalizedText.length
                    ? 'End position beyond text length'
                    : 'Unknown validation failure',
        });
      }

      const lowerText = normalizedText.toLowerCase();
      const lowerUnit = translatedUnit.toLowerCase();
      const unitPosition = lowerText.indexOf(lowerUnit, currentPosition);

      if (unitPosition === -1) {
        currentPosition++;
        continue;
      }

      actualPosition = unitPosition;
      unitLength = translatedUnit.length;
      previousMetadata = { translatedEnd: unitPosition + translatedUnit.length };
    }

    if (process.env.NODE_ENV === 'development' && usingMetadata) {
      const textAtPosition = normalizedText.substring(actualPosition, actualPosition + unitLength);
      if (textAtPosition.toLowerCase() !== translatedUnit.toLowerCase()) {
        logger.error('❌ Character-only position mismatch detected!', {
          unitIndex: i,
          translatedUnit,
          metadataPosition: actualPosition,
          textAtPosition,
          impact: 'Metadata position does not match unit text — incorrect highlighting position',
        });
      }
    }

    if (actualPosition > currentPosition) {
      directSegments.push({
        type: 'text',
        text: normalizedText.substring(currentPosition, actualPosition),
        start: currentPosition,
        end: actualPosition,
        unitIndex: -1,
        isClickable: false,
      });
    }

    const actualText = normalizedText.substring(actualPosition, actualPosition + unitLength);
    directSegments.push({
      type: 'semantic',
      text: actualText,
      start: actualPosition,
      end: actualPosition + unitLength,
      unitIndex: i,
      originalText: originalUnit,
      translatedText: actualText,
      isClickable: true,
    });

    currentPosition = actualPosition + unitLength;
  }

  const elapsedMs = performance.now() - startTime;
  if (elapsedMs > 10) {
    logger.warn('⚠️ Character-only segment computation took longer than expected', {
      elapsedMs: elapsedMs.toFixed(2),
      iterationCount: semanticArrays.translated.length,
      segmentCount: directSegments.length,
      impact: 'May cause UI jank during rapid mode switching',
    });
  }

  if (currentPosition < normalizedText.length) {
    directSegments.push({
      type: 'text',
      text: normalizedText.substring(currentPosition),
      start: currentPosition,
      end: normalizedText.length,
      unitIndex: -1,
      isClickable: false,
    });
  }

  return directSegments;
}
