import { useCallback } from 'react';
import type {
  ClickDirection,
  SegmentClickHandler,
  SegmentClickPayload,
} from '../types/ClickableTypes';
import type { SemanticArrays } from '../utils/highlighting';
import { logger } from '../utils/logger';

/**
 * Returns a stable click handler that validates bounds, constructs a
 * SegmentClickPayload, and dispatches it via onSegmentClick.
 *
 * Payload construction lives at one seam: add a new SegmentClickPayload
 * field here, not in each component.
 */
export function useSegmentClickHandler(
  semanticArrays: SemanticArrays | undefined,
  onSegmentClick: SegmentClickHandler | undefined,
  direction: ClickDirection
): (unitIndex: number) => void {
  return useCallback(
    (unitIndex: number) => {
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

      if (process.env.NODE_ENV === 'development') {
        logger.log(`🎯 useSegmentClickHandler (${direction}) handling click:`, {
          unitIndex,
          originalText: semanticArrays.original[unitIndex],
          translatedText: semanticArrays.translated[unitIndex],
        });
      }

      if (onSegmentClick) {
        const payload: SegmentClickPayload = { unitIndex, direction };
        onSegmentClick(payload);
      }
    },
    [semanticArrays, onSegmentClick, direction]
  );
}
