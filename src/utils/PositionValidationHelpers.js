// @ts-check
/**
 * Position Validation Helpers
 * MEDIUM-3 FIX: Extracted duplicate validation logic from SemanticArrayBuilder and OptimizedSemanticArrayBuilder
 * Shared validation functions for position metadata in semantic arrays
 */

import { logger } from './logger';

/**
 * Validate that a position doesn't overlap with the previous position
 * CRITICAL-1 FIX: Reject out-of-order positions to prevent corruption
 * HIGH-1 FIX: Prevent overlapping positions by requiring startPos > lastPositionSet (not >=)
 *
 * @param {number} startPos - Start position to validate
 * @param {number} lastPositionSet - Last position that was set
 * @param {number} tokenIndex - Token index for error logging
 * @param {string} translatedText - Translated text for error logging
 * @returns {boolean} True if position is valid (non-overlapping), false if invalid
 */
export function validateNonOverlappingPosition(
  startPos,
  lastPositionSet,
  tokenIndex,
  translatedText
) {
  if (lastPositionSet !== -1 && startPos <= lastPositionSet) {
    logger.error('❌ setPositionByMatch overlap detected - REJECTING!', {
      tokenIndex,
      translatedText,
      expectedMinStart: lastPositionSet + 1,
      actualStart: startPos,
      violation:
        startPos < lastPositionSet ? 'Position decreased' : 'Position overlaps with previous range',
      impact:
        'Rejected to prevent duplicate position mappings and bidirectional highlighting corruption',
    });
    return false;
  }
  return true;
}

/**
 * Validate that a position range is valid (startPos >= 0 and endPos > startPos)
 *
 * @param {number} startPos - Start position to validate
 * @param {number} endPos - End position to validate
 * @param {number} tokenIndex - Token index for error logging
 * @param {string} translatedText - Translated text for error logging
 * @returns {boolean} True if position range is valid, false if invalid
 */
export function validatePositionRange(startPos, endPos, tokenIndex, translatedText) {
  if (startPos < 0 || endPos <= startPos) {
    logger.error('❌ Invalid position range - REJECTING!', {
      tokenIndex,
      translatedText,
      startPos,
      endPos,
      violation: 'startPos must be >= 0 and endPos must be > startPos',
    });
    return false;
  }
  return true;
}

/**
 * Validate both overlap and range for a position
 * Convenience function that combines validateNonOverlappingPosition and validatePositionRange
 *
 * @param {number} startPos - Start position to validate
 * @param {number} endPos - End position to validate
 * @param {number} lastPositionSet - Last position that was set
 * @param {number} tokenIndex - Token index for error logging
 * @param {string} translatedText - Translated text for error logging
 * @returns {boolean} True if position is valid, false if invalid
 */
export function validatePosition(startPos, endPos, lastPositionSet, tokenIndex, translatedText) {
  // Check overlap first (fail fast)
  if (!validateNonOverlappingPosition(startPos, lastPositionSet, tokenIndex, translatedText)) {
    return false;
  }

  // Check range
  if (!validatePositionRange(startPos, endPos, tokenIndex, translatedText)) {
    return false;
  }

  return true;
}
