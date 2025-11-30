/**
 * Optimized Clickable Original Text Component
 * Uses pre-computed segments and memoization for maximum performance
 *
 * @import { ClickableOriginalOptimizedProps, SegmentComponentProps } from '../types/ClickableTypes'
 */
import React, { useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { SegmentPrecomputer } from '../utils/SegmentPrecomputer.js';

// Memoized segment component to prevent unnecessary re-renders
const OriginalSegmentComponent = React.memo(({ 
  segment, 
  onClick, 
  isHighlighted 
}) => {
  const handleClick = useCallback(() => {
    if (segment.isClickable) {
      onClick({
        unitIndex: segment.unitIndex,
        originalText: segment.originalText,
        translatedText: segment.translatedText,
        source: segment.source,
        metadata: segment.metadata,
        direction: 'original-to-translation'
      });
    }
  }, [segment, onClick]);

  const styles = useMemo(() => {
    const baseStyles = {
      display: 'inline',
      transition: 'all 0.1s ease-out'
    };

    if (segment.isClickable) {
      baseStyles.cursor = 'pointer';
      baseStyles.borderRadius = '2px';
      
      if (isHighlighted) {
        baseStyles.backgroundColor = 'var(--highlight-bg)';
        baseStyles.color = 'var(--highlight-text)';
      }
    }

    return baseStyles;
  }, [segment.isClickable, isHighlighted]);

  return (
    <span
      key={segment.key}
      data-unit-index={segment.unitIndex}
      onClick={handleClick}
      style={styles}
      onMouseEnter={(e) => {
        if (segment.isClickable && !isHighlighted) {
          e.target.style.backgroundColor = 'var(--hover-bg)';
        }
      }}
      onMouseLeave={(e) => {
        if (segment.isClickable && !isHighlighted) {
          e.target.style.backgroundColor = 'transparent';
        }
      }}
      title={segment.isClickable ? `"${segment.text}" → translation (${segment.source || 'unknown'})` : undefined}
    >
      {segment.text}
    </span>
  );
});

OriginalSegmentComponent.displayName = 'OriginalSegmentComponent';

OriginalSegmentComponent.propTypes = {
  segment: PropTypes.shape({
    isClickable: PropTypes.bool,
    unitIndex: PropTypes.number,
    originalText: PropTypes.string,
    translatedText: PropTypes.string,
    source: PropTypes.string,
    metadata: PropTypes.object,
    key: PropTypes.string,
    text: PropTypes.string
  }).isRequired,
  onClick: PropTypes.func.isRequired,
  isHighlighted: PropTypes.bool.isRequired
};

/**
 * @param {ClickableOriginalOptimizedProps} props
 */
const ClickableOriginalOptimized = ({ 
  originalText, 
  semanticArrays, 
  onSegmentClick,
  highlightedUnitIndex = -1,
  highlightedTranslationUnitIndex = -1
}) => {
  // Pre-compute segments only when semantic arrays change
  const precomputedSegments = useMemo(() => {
    if (!semanticArrays || !originalText) {
      return [];
    }
    
    return SegmentPrecomputer.precomputeOriginalSegments(originalText, semanticArrays);
  }, [originalText, semanticArrays]);

  // Create render segments only when highlight changes
  const renderSegments = useMemo(() => {
    return SegmentPrecomputer.createRenderSegments(
      precomputedSegments, 
      highlightedUnitIndex,
      highlightedTranslationUnitIndex
    );
  }, [precomputedSegments, highlightedUnitIndex, highlightedTranslationUnitIndex]);

  // Memoize click handler to prevent re-renders
  const handleSegmentClick = useCallback((segmentData) => {
    if (onSegmentClick) {
      onSegmentClick(segmentData);
    }
  }, [onSegmentClick]);

  // Fallback for when no semantic arrays are available
  if (!semanticArrays || renderSegments.length === 0) {
    return <span style={{ lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{originalText}</span>;
  }

  // Render optimized segments
  return (
    <div style={{ lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
      {renderSegments.map((segment) => (
        <OriginalSegmentComponent
          key={segment.key}
          segment={segment}
          onClick={handleSegmentClick}
          isHighlighted={segment.isHighlighted}
        />
      ))}
    </div>
  );
};

ClickableOriginalOptimized.propTypes = {
  originalText: PropTypes.string,
  semanticArrays: PropTypes.shape({
    original: PropTypes.array,
    translated: PropTypes.array,
    metadata: PropTypes.array
  }),
  onSegmentClick: PropTypes.func,
  highlightedUnitIndex: PropTypes.number,
  highlightedTranslationUnitIndex: PropTypes.number
};

// Memoize the entire component to prevent unnecessary re-renders
export default React.memo(ClickableOriginalOptimized);