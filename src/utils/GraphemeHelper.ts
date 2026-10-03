/**
 * Grapheme-aware first-character extraction.
 *
 * Vietnamese diacritics can be combining characters (e.g. "ả" = "a" + combining hook), so
 * `text[0]` returns a partial character. `Intl.Segmenter` yields the whole grapheme. One
 * segmenter is shared across calls: creating one per call costs 0.1-0.5ms.
 */

import { logger } from './logger.js';
import { extractErrorMessage } from './errorHelpers';

function createSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return null;
  try {
    return new Intl.Segmenter('vi', { granularity: 'grapheme' });
  } catch (error: unknown) {
    logger.warn(
      '⚠️ Failed to create Intl.Segmenter, falling back to the first UTF-16 code unit:',
      extractErrorMessage(error)
    );
    return null;
  }
}

const segmenter = createSegmenter();

/**
 * Get first grapheme from text
 *
 * @param text - Text to extract first grapheme from
 * @returns First grapheme (user-perceived character), or '' for empty text
 *
 * @example
 * const first = getFirstGrapheme("ảnh"); // "ả" (complete grapheme with diacritics)
 */
export function getFirstGrapheme(text: string): string {
  if (!text) return '';

  if (segmenter) {
    // Use the iterator directly — Array.from() would segment the whole string just to take the
    // first element, making this O(n); the iterator is O(1).
    const first = segmenter.segment(text)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }

  // Fallback: first UTF-16 code unit (less accurate, safe for precomposed text)
  return text[0];
}
