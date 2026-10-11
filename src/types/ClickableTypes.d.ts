/**
 * Clickable Component Type Definitions
 *
 * Type definitions for all clickable components that enable semantic unit highlighting:
 * - ClickableOriginalSemantic: Basic semantic highlighting for original text
 * - ClickableTranslationSemantic: Basic semantic highlighting for translation
 * - ClickableOriginalOptimized: Performance-optimized original text with memoization
 * - ClickableTranslationOptimized: Performance-optimized translation with prebuilt segments
 * - VirtualizedClickableTranslation: Virtual scrolling for large translations
 * - VirtualizedClickableTranslationViewport: Viewport-based optimization for very large texts
 *
 * These types enable JSDoc integration for full IDE support without migrating performance-critical code.
 */

import type { SemanticArrays } from './SemanticTypes';
import type { WordSegment } from '../utils/highlighting';

// =============================================================================
// Core Direction Types
// =============================================================================

/**
 * Direction of click interaction between original and translated text
 */
export type ClickDirection =
  | 'original-to-translation' // Click on original text to highlight translation
  | 'translation-to-original' // Click on translation to highlight original
  | 'character-only-to-original'; // Special mode for character-only translation

// =============================================================================
// Click Handler Types
// =============================================================================

/**
 * Payload passed to click handlers when a segment is clicked
 */
export interface SegmentClickPayload {
  /** Index of the clicked unit in semantic arrays */
  unitIndex: number;
  /** Direction of the click interaction */
  direction: ClickDirection;
}

/**
 * Click handler function type
 */
export type SegmentClickHandler = (payload: SegmentClickPayload) => void;

// =============================================================================
// Component Props - Basic Semantic Components
// =============================================================================

/**
 * Props for ClickableOriginalSemantic component
 *
 * Basic semantic highlighting for original Chinese text.
 * Uses SegmentPrecomputer for reliable highlighting.
 */
export interface ClickableOriginalSemanticProps {
  /** Original Chinese text to render */
  originalText?: string;
  /** Semantic arrays with translation metadata */
  semanticArrays?: SemanticArrays;
  /** Currently highlighted unit index (the unit lit by a click in any panel) */
  highlightedUnitIndex?: number;
  /** Click handler for segment interactions */
  onSegmentClick?: SegmentClickHandler;
}

/**
 * Props for ClickableTranslationSemantic component
 *
 * Basic semantic highlighting for translated Vietnamese text.
 * Supports character-only mode with direct mapping.
 */
export interface ClickableTranslationSemanticProps {
  /** Translated Vietnamese text to render */
  translatedText?: string;
  /** Semantic arrays with translation metadata */
  semanticArrays?: SemanticArrays;
  /** Click handler for segment interactions */
  onSegmentClick?: SegmentClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number | number[];
}

// =============================================================================
// Component Props - Optimized Components
// =============================================================================

/**
 * Props for ClickableTranslationOptimized component
 *
 * Performance-optimized translation rendering with:
 * - Prebuilt segments for zero computation time
 * - Memoized segment components
 * - Instant clickable highlighting (0ms vs 6800ms)
 */
export interface ClickableTranslationOptimizedProps {
  /** Translated Vietnamese text to render */
  translatedText?: string;
  /** Semantic arrays with translation metadata */
  semanticArrays?: SemanticArrays;
  /** Prebuilt segments for instant rendering (recommended): what `matchWordSegments` produced */
  prebuiltSegments?: WordSegment[];
  /** Click handler for segment interactions */
  onSegmentClick?: SegmentClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number;
}

// Export empty object to make this a module
export {};
