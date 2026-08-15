import { useState, useEffect } from 'react';
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
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      setSegments([]);
      return;
    }
    if (!translatedText) {
      logger.warn(
        'translatedText is null/undefined in character-only mode, returning empty segments'
      );
      setSegments([]);
      return;
    }
    setSegments(segmentFromPositionMetadata(translatedText, semanticArrays));
  }, [translatedText, semanticArrays]);

  return segments;
}
