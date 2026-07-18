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

import type { SemanticArrays, SemanticMetadata } from './SemanticTypes';

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
// Segment Types
// =============================================================================

/**
 * Base segment interface for text rendering
 */
export interface BaseSegment {
  /** Raw text content of this segment */
  text: string;
  /** Start position in full text */
  start: number;
  /** End position in full text */
  end: number;
  /** Whether this segment is clickable */
  isClickable: boolean;
  /** Unique key for React rendering */
  key?: string;
  /** Segment type identifier */
  type?: 'semantic' | 'text' | 'space';
}

/**
 * Clickable semantic segment with full translation metadata
 */
export interface ClickableSegment extends BaseSegment {
  /** Whether this segment is clickable (always true) */
  isClickable: true;
  /** Index in semantic arrays */
  unitIndex: number;
  /** Original Chinese text */
  originalText: string;
  /** Translated Vietnamese text */
  translatedText: string;
  /** Translation source (pattern, phrase, character, etc.) */
  source: string;
  /** Full semantic metadata */
  metadata?: SemanticMetadata;
}

/**
 * Prebuilt segment with additional rendering metadata
 */
export interface PrebuiltSegment extends ClickableSegment {
  /** Whether this segment is currently highlighted */
  isHighlighted?: boolean;
  /** Computed styles for rendering optimization */
  computedStyles?: React.CSSProperties;
}

// =============================================================================
// Click Handler Types
// =============================================================================

/**
 * Payload passed to click handlers when a segment is clicked
 */
export interface SegmentClickPayload {
  /** Index of the clicked unit in semantic arrays */
  unitIndex: number;
  /** Original Chinese text of the unit */
  originalText: string;
  /** Translated Vietnamese text of the unit */
  translatedText: string;
  /** Translation source (pattern, phrase, character, etc.) */
  source: string;
  /** Full semantic metadata */
  metadata: SemanticMetadata;
  /** Direction of the click interaction */
  direction: ClickDirection;
}

/**
 * Click handler function type (full payload version)
 */
export type SegmentClickHandler = (payload: SegmentClickPayload) => void;

/**
 * Simple click handler function type (legacy/simplified version)
 * Used in some components that only need index and direction
 */
export type SimpleClickHandler = (index: number, direction: string) => void;

/**
 * Flexible click handler that supports both formats
 * Note: Due to TypeScript structural typing, functions are checked for parameter compatibility.
 * The union allows either the full payload or the simple (index, direction) signature.
 */
export type FlexibleClickHandler = SegmentClickHandler | SimpleClickHandler;

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
  /** Currently highlighted unit index (from clicking original) */
  highlightedUnitIndex?: number;
  /** Currently highlighted unit index (from clicking translation) */
  highlightedTranslationUnitIndex?: number;
  /** Click handler for segment interactions */
  onSegmentClick?: FlexibleClickHandler;
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
  onSegmentClick?: FlexibleClickHandler;
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
  /** Prebuilt segments for instant rendering (recommended) */
  prebuiltSegments?: PrebuiltSegment[];
  /** Click handler for segment interactions */
  onSegmentClick?: FlexibleClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number;
}

// =============================================================================
// Internal Component Props (for memoized sub-components)
// =============================================================================

/**
 * Props for memoized SegmentComponent (used in optimized components)
 */
export interface SegmentComponentProps {
  /** Segment data to render */
  segment: PrebuiltSegment;
  /** Click handler */
  onClick: FlexibleClickHandler;
  /** Whether this segment is currently highlighted */
  isHighlighted: boolean;
}

// Export empty object to make this a module
export {};
