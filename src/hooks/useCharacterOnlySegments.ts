import { useMemo } from 'react';
import { segmentFromPositionMetadata } from '../utils/highlighting';
import type { Segment, SemanticArrays } from '../utils/highlighting';
import { logger } from '../utils/logger';

/**
 * Computes segments for the character-only translation panel.
 * Sync: segmentFromPositionMetadata reads translatedStart/End metadata directly.
 */
export function useCharacterOnlySegments(
  translatedText: string | undefined,
  semanticArrays: SemanticArrays | undefined
): Segment[] {
  return useMemo(() => {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return [];
    }
    if (!translatedText) {
      logger.warn(
        'translatedText is null/undefined in character-only mode, returning empty segments'
      );
      return [];
    }
    return segmentFromPositionMetadata(translatedText, semanticArrays);
  }, [translatedText, semanticArrays]);
}
