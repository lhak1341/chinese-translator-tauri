/**
 * Position Tracker for building segments during translation
 * Tracks text positions as translation happens to build accurate clickable segments
 *
 * @import {
 *   PositionTracker as IPositionTracker,
 *   TrackedSegment,
 *   TrackingSummary
 * } from '../types/WorkerTypes'
 */

export class PositionTracker {
  constructor() {
    this.reset();
  }

  /**
   * Reset tracker for new translation
   */
  reset() {
    this.segments = [];
    this.currentPosition = 0;
    this.translatedTextParts = [];
  }

  /**
   * Add a translated segment and track its position
   * @param {string} originalText - Original text that was translated
   * @param {string} translatedText - Translated result
   * @param {Object} metadata - Translation metadata (source, etc.)
   * @param {number} unitIndex - Index in semantic arrays
   */
  addSegment(originalText, translatedText, metadata, unitIndex) {
    if (!translatedText || translatedText.trim() === '') {
      return;
    }

    const segment = {
      type: 'semantic',
      unitIndex: unitIndex,
      start: this.currentPosition,
      end: this.currentPosition + translatedText.length,
      originalText: originalText,
      translatedText: translatedText,
      source: metadata?.source || 'unknown',
      metadata: metadata,
      isClickable: true,
      text: translatedText // For component compatibility
    };

    this.segments.push(segment);
    this.translatedTextParts.push(translatedText);
    this.currentPosition += translatedText.length;

    // console.log(`📍 Tracked segment: "${originalText}" → "${translatedText}" at position ${segment.start}-${segment.end}`);
  }

  /**
   * Add non-clickable content (punctuation, spacing, etc.)
   * @param {string} content - Non-clickable content
   * @param {string} type - Type of content ('punctuation', 'spacing', 'linebreak')
   */
  addNonClickableContent(content, type = 'punctuation') {
    if (!content) return;

    const segment = {
      type: type,
      start: this.currentPosition,
      end: this.currentPosition + content.length,
      text: content,
      isClickable: false
    };

    this.segments.push(segment);
    this.translatedTextParts.push(content);
    this.currentPosition += content.length;

    console.log(`📍 Tracked ${type}: "${content}" at position ${segment.start}-${segment.end}`);
  }

  /**
   * Get the current reconstructed text
   * @returns {string} Current translated text
   */
  getTranslatedText() {
    return this.translatedTextParts.join('');
  }

  /**
   * Get all segments built during translation
   * @returns {Array} Array of positioned segments
   */
  getSegments() {
    return [...this.segments];
  }

  /**
   * Get current position for next content
   * @returns {number} Current position
   */
  getCurrentPosition() {
    return this.currentPosition;
  }

  /**
   * Get summary of tracking
   * @returns {Object} Tracking summary
   */
  getSummary() {
    const clickableSegments = this.segments.filter(s => s.isClickable);
    const nonClickableSegments = this.segments.filter(s => !s.isClickable);

    return {
      totalSegments: this.segments.length,
      clickableSegments: clickableSegments.length,
      nonClickableSegments: nonClickableSegments.length,
      totalLength: this.currentPosition,
      translatedText: this.getTranslatedText()
    };
  }
}

/**
 * Factory function to create new position tracker
 * @returns {PositionTracker} New position tracker instance
 */
export const createPositionTracker = () => new PositionTracker();