import { useState, useEffect } from 'react';
import type { ClickDirection } from '../types/ClickableTypes';
import type { Segment, SemanticArrays } from '../utils/highlighting';
import { SegmentPrecomputer } from '../utils/highlighting';
import { segmentFromPositionMetadata } from '../utils/highlighting/PositionMetadataSegmenter';
import { logger } from '../utils/logger';

/**
 * Owns segment computation strategy dispatch for clickable text rendering.
 *
 * Routes by direction:
 *   'character-only-to-original' → segmentFromPositionMetadata (sync, uses translatedStart/End metadata)
 *   all other directions          → SegmentPrecomputer.precomputeSegments (async, WASM → JS fallback)
 *
 * Manages the async cancellation guard so callers hold only Segment[].
 */
export function useSegmentComputation(
  direction: ClickDirection,
  translatedText: string | undefined,
  semanticArrays: SemanticArrays | undefined
): Segment[] {
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      setSegments([]);
      return;
    }

    if (direction === 'character-only-to-original') {
      if (!translatedText) {
        logger.warn(
          'translatedText is null/undefined in character-only mode, returning empty segments'
        );
        setSegments([]);
        return;
      }
      setSegments(segmentFromPositionMetadata(translatedText, semanticArrays));
      return;
    }

    if (!translatedText) {
      logger.warn('translatedText is null/undefined, returning empty segments');
      setSegments([]);
      return;
    }

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

  return segments;
}
