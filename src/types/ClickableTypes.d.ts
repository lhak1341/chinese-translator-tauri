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

import type { SemanticArrays, SemanticUnit, SemanticMetadata } from './SemanticTypes';

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
 * Non-clickable text segment (punctuation, spaces, untranslated text)
 */
export interface NonClickableSegment extends BaseSegment {
  /** Whether this segment is clickable (always false) */
  isClickable: false;
  /** Unit index not applicable */
  unitIndex?: -1;
}

/**
 * Union type for all segment types
 */
export type Segment = ClickableSegment | NonClickableSegment;

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
  /** Direction of click interaction */
  direction?: ClickDirection;
}

// =============================================================================
// Component Props - Optimized Components
// =============================================================================

/**
 * Props for ClickableOriginalOptimized component
 *
 * Performance-optimized original text rendering with:
 * - Memoized segment components
 * - Pre-computed render segments
 * - Minimal re-renders on highlight changes
 */
export interface ClickableOriginalOptimizedProps {
  /** Original Chinese text to render */
  originalText?: string;
  /** Semantic arrays with translation metadata */
  semanticArrays?: SemanticArrays;
  /** Click handler for segment interactions */
  onSegmentClick?: FlexibleClickHandler;
  /** Currently highlighted unit index (from clicking original) */
  highlightedUnitIndex?: number;
  /** Currently highlighted unit index (from clicking translation) */
  highlightedTranslationUnitIndex?: number;
}

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
// Component Props - Virtualized Components
// =============================================================================

/**
 * Props for VirtualizedClickableTranslation component
 *
 * Virtual scrolling for large translations (>400 segments):
 * - Only renders visible segments
 * - Memory efficient for thousands of segments
 * - Automatic threshold detection
 * - Uses prebuilt segments for performance
 */
export interface VirtualizedClickableTranslationProps {
  /** Semantic arrays with translation metadata */
  semanticArrays?: SemanticArrays;
  /** Prebuilt segments for instant rendering */
  prebuiltSegments?: PrebuiltSegment[];
  /** Click handler for segment interactions */
  onSegmentClick?: FlexibleClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number;
  /** Force virtualization even for smaller texts */
  forceVirtualization?: boolean;
}

/**
 * Props for VirtualizedClickableTranslationViewport component
 *
 * Viewport-based optimization for very large texts (>10000 chars):
 * - Eliminates 6.8s segment computation bottleneck
 * - 98.5% faster initial rendering (50ms vs 6800ms)
 * - Uses accelerated position mapping (WASM + Web Workers)
 * - Pre-warms cache for smooth scrolling
 * - Automatic fallback to JavaScript if WASM unavailable
 */
export interface VirtualizedClickableTranslationViewportProps {
  /** Translated Vietnamese text to render (required) */
  translatedText: string;
  /** Semantic arrays with translation metadata (required) */
  semanticArrays: SemanticArrays;
  /** Click handler for segment interactions (required) */
  onSegmentClick: FlexibleClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number;
  /** Force viewport optimization even for smaller texts */
  forceVirtualization?: boolean;
}

// =============================================================================
// Virtualization Configuration Types
// =============================================================================

/**
 * Virtualization threshold constants
 */
export interface VirtualizationThresholds {
  /** Start virtualizing when segment count exceeds this */
  VIRTUALIZATION_THRESHOLD: number; // 400 segments
  /** Force viewport optimization for texts exceeding this */
  LONG_TEXT_THRESHOLD: number; // 10000 chars
  /** Average height per text line in pixels */
  ITEM_HEIGHT: number; // 25px
  /** Extra items to render outside visible area */
  BUFFER_SIZE: number; // 20 items
  /** Fixed height for virtual container */
  CONTAINER_HEIGHT: number; // 400-600px
  /** Characters to compute per viewport */
  VIEWPORT_SIZE: number; // 2000 chars
}

/**
 * Viewport bounds for virtualized rendering
 */
export interface ViewportBounds {
  /** First visible item index */
  startIndex: number;
  /** Last visible item index */
  endIndex: number;
  /** Scroll position in pixels */
  scrollTop: number;
  /** Viewport height in pixels */
  viewportHeight: number;
}

/**
 * Position mapping for accelerated segment lookup
 */
export interface PositionMapping {
  /** Full translated text */
  fullText: string;
  /** Semantic ranges for position lookup */
  semanticRanges: SemanticRange[];
  /** Acceleration strategy used */
  accelerationInfo?: {
    strategy: 'wasm' | 'worker' | 'javascript';
    duration: number;
  };
}

/**
 * Semantic range for position mapping
 */
export interface SemanticRange {
  /** Start position in translated text */
  start: number;
  /** End position in translated text */
  end: number;
  /** Unit index in semantic arrays */
  unitIndex: number;
  /** Cached segment data */
  segment?: ClickableSegment;
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

/**
 * Props for SegmentRenderer (used in virtualized components)
 */
export interface SegmentRendererProps {
  /** Segment data to render */
  segment: ClickableSegment;
  /** Segment index in array */
  index: number;
  /** Whether this segment is currently highlighted */
  isHighlighted: boolean;
  /** Click handler */
  onSegmentClick: (segment: ClickableSegment, index: number) => void;
}

/**
 * Props for OptimizedStaticRenderer (non-virtualized fallback)
 */
export interface OptimizedStaticRendererProps {
  /** All segments to render */
  segments: PrebuiltSegment[];
  /** Click handler */
  onSegmentClick: (segment: ClickableSegment, index: number) => void;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex: number;
}

/**
 * Props for VirtualScrollRenderer (virtualized renderer)
 */
export interface VirtualScrollRendererProps {
  /** All segments (only visible ones rendered) */
  segments: PrebuiltSegment[];
  /** Click handler */
  onSegmentClick: (segment: ClickableSegment, index: number) => void;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex: number;
  /** Container height in pixels */
  containerHeight: number;
  /** Item height in pixels */
  itemHeight: number;
  /** Buffer size for overscanning */
  bufferSize: number;
}

/**
 * Props for ViewportOptimizedRenderer (viewport-based renderer)
 */
export interface ViewportOptimizedRendererProps {
  /** Translated text */
  translatedText: string;
  /** Semantic arrays */
  semanticArrays: SemanticArrays;
  /** Position mapping */
  positionMapping: PositionMapping;
  /** Click handler */
  onSegmentClick: FlexibleClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number;
  /** Container height in pixels */
  containerHeight: number;
  /** Item height in pixels */
  itemHeight: number;
  /** Buffer size for overscanning */
  bufferSize: number;
}

/**
 * Props for SimpleTextRenderer (fallback for position mapping)
 */
export interface SimpleTextRendererProps {
  /** Translated text */
  translatedText: string;
  /** Semantic arrays */
  semanticArrays: SemanticArrays;
  /** Position mapping */
  positionMapping: PositionMapping;
  /** Click handler */
  onSegmentClick: FlexibleClickHandler;
  /** Currently highlighted unit index */
  highlightedTranslationUnitIndex?: number;
}

// =============================================================================
// Loading and Performance Types
// =============================================================================

/**
 * Loading state for viewport initialization
 */
export interface LoadingState {
  /** Loading operation identifier */
  operation: string;
  /** Loading message */
  message: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Whether loading is complete */
  isComplete: boolean;
}

/**
 * Performance metrics for clickable rendering
 */
export interface ClickablePerformanceMetrics {
  /** Segment computation time (ms) */
  segmentComputationTime?: number;
  /** Position mapping time (ms) */
  positionMappingTime?: number;
  /** Rendering time (ms) */
  renderingTime?: number;
  /** Total segments */
  totalSegments?: number;
  /** Visible segments */
  visibleSegments?: number;
  /** Acceleration strategy used */
  accelerationStrategy?: 'none' | 'prebuilt' | 'virtualized' | 'viewport' | 'wasm';
}

// Export empty object to make this a module
export {};
