/**
 * Virtualized Clickable Translation Component
 * Phase 5: Large Text Virtualization for optimal performance with very long documents
 *
 * Features:
 * - Virtual scrolling for large texts (only renders visible segments)
 * - Uses pre-computed segments from SegmentPrecomputer
 * - Maintains smooth highlighting and interaction
 * - Memory efficient for documents with thousands of segments
 *
 * @import { VirtualizedClickableTranslationProps, SegmentRendererProps } from '../types/ClickableTypes'
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

// Configuration constants
const VIRTUALIZATION_THRESHOLD = 400; // Start virtualizing when >400 segments (reduced from 800 for better UI performance)
const ITEM_HEIGHT = 25; // Average height per text line in pixels
const BUFFER_SIZE = 20; // Extra items to render outside visible area
const CONTAINER_HEIGHT = 400; // Fixed height for virtual container

/**
 * @param {VirtualizedClickableTranslationProps} props
 */
const VirtualizedClickableTranslation = ({ 
  semanticArrays, 
  prebuiltSegments = [],
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
  forceVirtualization = false
}) => {
  // Use prebuilt segments for instant clickable highlighting (no computation needed!)
  const precomputedSegments = useMemo(() => {
    if (prebuiltSegments && prebuiltSegments.length > 0) {
      console.log(`🚀 VirtualizedClickableTranslation: Using prebuilt segments - ${prebuiltSegments.length} segments (0ms vs 6800ms)`);
      return prebuiltSegments;
    }
    
    // Fallback to empty if no prebuilt segments available
    console.warn('⚠️ VirtualizedClickableTranslation: No prebuilt segments available, showing plain text');
    return [];
  }, [prebuiltSegments]);

  // Determine if virtualization should be used
  const shouldVirtualize = useMemo(() => {
    return forceVirtualization || precomputedSegments.length > VIRTUALIZATION_THRESHOLD;
  }, [precomputedSegments.length, forceVirtualization]);

  // Memoized click handler to prevent re-renders
  const handleSegmentClick = useCallback((segment, _index) => {
    if (!semanticArrays || segment.unitIndex >= semanticArrays.original.length) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Invalid segment click:', segment);
      }
      return;
    }
    
    const originalText = semanticArrays.original[segment.unitIndex];
    const translatedText = semanticArrays.translated[segment.unitIndex];
    const metadata = semanticArrays.metadata[segment.unitIndex];
    
    onSegmentClick({
      unitIndex: segment.unitIndex,
      originalText,
      translatedText,
      source: metadata.source,
      metadata,
      direction: 'translation-to-original'
    });
  }, [semanticArrays, onSegmentClick]);


  // If virtualization not needed, use optimized non-virtual rendering
  if (!shouldVirtualize) {
    return (
      <OptimizedStaticRenderer
        segments={precomputedSegments}
        onSegmentClick={handleSegmentClick}
        highlightedTranslationUnitIndex={highlightedTranslationUnitIndex}
      />
    );
  }

  // Use virtual scrolling for large texts
  return (
    <VirtualScrollRenderer
      segments={precomputedSegments}
      onSegmentClick={handleSegmentClick}
      highlightedTranslationUnitIndex={highlightedTranslationUnitIndex}
      containerHeight={CONTAINER_HEIGHT}
      itemHeight={ITEM_HEIGHT}
      bufferSize={BUFFER_SIZE}
    />
  );
};

/**
 * Optimized static renderer for smaller texts (no virtualization overhead)
 */
const OptimizedStaticRenderer = React.memo(({ segments, onSegmentClick, highlightedTranslationUnitIndex }) => {
  return (
    <div className="clickable-translation-static">
      {segments.map((segment, index) => (
        <SegmentRenderer
          key={`segment-${index}-${segment.unitIndex}`}
          segment={segment}
          index={index}
          isHighlighted={highlightedTranslationUnitIndex === segment.unitIndex}
          onSegmentClick={onSegmentClick}
        />
      ))}
    </div>
  );
});

OptimizedStaticRenderer.displayName = 'OptimizedStaticRenderer';

OptimizedStaticRenderer.propTypes = {
  segments: PropTypes.array.isRequired,
  onSegmentClick: PropTypes.func,
  highlightedTranslationUnitIndex: PropTypes.number
};

/**
 * Virtual scroll renderer for large texts
 */
const VirtualScrollRenderer = ({ 
  segments, 
  onSegmentClick, 
  highlightedTranslationUnitIndex,
  containerHeight,
  itemHeight,
  bufferSize
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(
      segments.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
    );
    return { startIndex, endIndex };
  }, [scrollTop, containerHeight, itemHeight, bufferSize, segments.length]);

  // Handle scroll events
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Auto-scroll to highlighted element
  useEffect(() => {
    if (highlightedTranslationUnitIndex >= 0 && containerRef.current) {
      // Find the segment index for the highlighted unit
      const segmentIndex = segments.findIndex(s => s.unitIndex === highlightedTranslationUnitIndex);
      
      if (segmentIndex >= 0) {
        const targetScrollTop = segmentIndex * itemHeight;
        const containerTop = scrollTop;
        const containerBottom = scrollTop + containerHeight;
        
        // Only scroll if the target is not visible
        if (targetScrollTop < containerTop || targetScrollTop > containerBottom - itemHeight) {
          containerRef.current.scrollTo({
            top: Math.max(0, targetScrollTop - containerHeight / 2),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [highlightedTranslationUnitIndex, segments, itemHeight, containerHeight, scrollTop]);

  // Calculate visible segments
  const visibleSegments = useMemo(() => {
    return segments.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [segments, visibleRange]);

  // Total content height for scrollbar
  const totalHeight = segments.length * itemHeight;

  return (
    <div 
      className="virtual-scroll-container"
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height: `${containerHeight}px`,
        overflowY: 'auto',
        border: '1px solid var(--border-color)',
        borderRadius: '4px'
      }}
    >
      {/* Virtual content spacer */}
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {/* Visible content */}
        <div 
          style={{
            position: 'absolute',
            top: `${visibleRange.startIndex * itemHeight}px`,
            width: '100%'
          }}
        >
          {visibleSegments.map((segment, relativeIndex) => {
            const absoluteIndex = visibleRange.startIndex + relativeIndex;
            return (
              <div
                key={`virtual-segment-${absoluteIndex}-${segment.unitIndex}`}
                style={{ 
                  height: `${itemHeight}px`,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 4px',
                  whiteSpace: 'pre-wrap'
                }}
              >
                <SegmentRenderer
                  segment={segment}
                  index={absoluteIndex}
                  isHighlighted={highlightedTranslationUnitIndex === segment.unitIndex}
                  onSegmentClick={onSegmentClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

VirtualScrollRenderer.propTypes = {
  segments: PropTypes.array.isRequired,
  onSegmentClick: PropTypes.func,
  highlightedTranslationUnitIndex: PropTypes.number,
  containerHeight: PropTypes.number.isRequired,
  itemHeight: PropTypes.number.isRequired,
  bufferSize: PropTypes.number.isRequired
};

/**
 * Individual segment renderer - memoized for performance
 */
const SegmentRenderer = React.memo(({ segment, index, isHighlighted, onSegmentClick }) => {
  const handleClick = useCallback(() => {
    onSegmentClick(segment, index);
  }, [segment, index, onSegmentClick]);

  return (
    <span
      data-unit-index={segment.unitIndex}
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        borderRadius: '2px',
        transition: 'all 0.1s ease-out',
        display: 'inline',
        backgroundColor: isHighlighted ? 'var(--highlight-bg)' : 'transparent',
        color: isHighlighted ? 'var(--highlight-text)' : 'inherit',
        fontWeight: isHighlighted ? 'bold' : 'normal',
        padding: '1px 2px'
      }}
      onMouseEnter={(e) => {
        if (!isHighlighted) {
          e.target.style.backgroundColor = 'var(--hover-bg)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isHighlighted) {
          e.target.style.backgroundColor = 'transparent';
        }
      }}
      title={`Click to highlight (${segment.source})`}
    >
      {segment.translatedText || segment.text}
    </span>
  );
});

SegmentRenderer.displayName = 'SegmentRenderer';

SegmentRenderer.propTypes = {
  segment: PropTypes.shape({
    text: PropTypes.string,
    translatedText: PropTypes.string,
    source: PropTypes.string,
    unitIndex: PropTypes.number
  }).isRequired,
  index: PropTypes.number.isRequired,
  isHighlighted: PropTypes.bool.isRequired,
  onSegmentClick: PropTypes.func.isRequired
};

VirtualizedClickableTranslation.propTypes = {
  translatedText: PropTypes.string,
  semanticArrays: PropTypes.shape({
    original: PropTypes.array,
    translated: PropTypes.array,
    metadata: PropTypes.array
  }),
  prebuiltSegments: PropTypes.array,
  onSegmentClick: PropTypes.func,
  highlightedTranslationUnitIndex: PropTypes.number,
  forceVirtualization: PropTypes.bool
};

export default VirtualizedClickableTranslation;