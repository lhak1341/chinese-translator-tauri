import { useState, useEffect } from 'react';
import type { Segment, SemanticArrays } from '../utils/highlighting';
import { precomputeSegments } from '../utils/highlighting';
import { logger } from '../utils/logger';

/**
 * Computes segments for the full-translation panel.
 * Async: precomputeSegments may await WASM; cancellation guard discards stale results.
 */
export function useFullTranslationSegments(
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
      logger.warn('translatedText is null/undefined, returning empty segments');
      setSegments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const computedSegments = await precomputeSegments(translatedText, semanticArrays);
      if (!cancelled) {
        setSegments(computedSegments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [translatedText, semanticArrays]);

  return segments;
}
