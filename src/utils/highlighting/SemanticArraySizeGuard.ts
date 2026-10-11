import toast from '../toast';
import { logger } from '../logger';
import type { SemanticArrays } from '../../types/SemanticTypes';
import { MAX_SAFE_SEGMENTS } from './semanticArrayConstants';

/**
 * Throws (after logging and a toast) when a translation produced more semantic units than
 * highlighting can handle, so the caller can drop the result instead of rendering it.
 */
export function validateSemanticArraySize(
  arrays: SemanticArrays | null | undefined,
  context: string
): void {
  if (!arrays?.original) return;
  const arrayLength = arrays.original.length;
  if (arrayLength > MAX_SAFE_SEGMENTS) {
    const error = new Error(
      `Document too large for ${context}: ${arrayLength.toLocaleString()} segments exceeds maximum ${MAX_SAFE_SEGMENTS.toLocaleString()}`
    );
    logger.error(error.message);
    toast.error(
      `Document too large: ${arrayLength.toLocaleString()} segments (max: ${MAX_SAFE_SEGMENTS.toLocaleString()})`
    );
    throw error;
  }
}
