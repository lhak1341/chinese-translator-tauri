/**
 * Semantic Array-Based Clickable Translation Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 *
 * @import { ClickableTranslationSemanticProps } from '../types/ClickableTypes'
 */
import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { SegmentPrecomputer } from '../utils/SegmentPrecomputer.js';

/**
 * @param {ClickableTranslationSemanticProps} props
 */
const ClickableTranslationSemantic = ({ 
  translatedText, 
  semanticArrays, 
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
  direction = 'translation-to-original'
}) => {
  // Use SegmentPrecomputer to create reliable segments, with special handling for character-only
  const segments = useMemo(() => {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return [];
    }
    
    // For character-only translation, use a simpler direct mapping approach
    if (direction === 'character-only-to-original') {
      const directSegments = [];
      let currentPosition = 0;
      
      for (let i = 0; i < semanticArrays.translated.length; i++) {
        const translatedUnit = semanticArrays.translated[i];
        const originalUnit = semanticArrays.original[i];
        
        // Find this unit in the translated text starting from current position
        const remainingText = translatedText.substring(currentPosition);
        const unitPosition = remainingText.indexOf(translatedUnit);
        
        if (unitPosition !== -1) {
          const actualPosition = currentPosition + unitPosition;
          
          // Add any non-semantic text before this unit
          if (unitPosition > 0) {
            const nonSemanticText = remainingText.substring(0, unitPosition);
            directSegments.push({
              type: 'text',
              text: nonSemanticText,
              start: currentPosition,
              end: actualPosition,
              unitIndex: -1,
              isClickable: false
            });
          }
          
          // Add the semantic unit
          directSegments.push({
            type: 'semantic',
            text: translatedUnit,
            start: actualPosition,
            end: actualPosition + translatedUnit.length,
            unitIndex: i,
            originalText: originalUnit,
            translatedText: translatedUnit,
            isClickable: true
          });
          
          currentPosition = actualPosition + translatedUnit.length;
        }
      }
      
      // Add any remaining text
      if (currentPosition < translatedText.length) {
        const remainingText = translatedText.substring(currentPosition);
        directSegments.push({
          type: 'text',
          text: remainingText,
          start: currentPosition,
          end: translatedText.length,
          unitIndex: -1,
          isClickable: false
        });
      }
      
      
      return directSegments;
    }
    
    // For other translations, use the existing SegmentPrecomputer
    const computedSegments = SegmentPrecomputer.precomputeSegments(translatedText, semanticArrays);
    return computedSegments;
  }, [translatedText, semanticArrays, direction]);

  // Group segments into paragraphs (separated by \n\n or lines starting with indentation)
  const paragraphs = useMemo(() => {
    if (segments.length === 0) return [];

    const result = [];
    let currentParagraph = [];

    for (const segment of segments) {
      // Split by single newlines to detect indented paragraphs
      const lines = segment.text.split(/(\n)/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line === '\n') {
          // Check if next line (if exists) starts with indentation or is empty
          const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

          if (nextLine === '\n' || nextLine.match(/^[\u3000\s　]+/)) {
            // Next line is blank or starts with indentation - paragraph break
            if (currentParagraph.length > 0) {
              result.push(currentParagraph);
              currentParagraph = [];
            }
            // Skip the newline itself
            continue;
          } else {
            // Regular newline within paragraph
            currentParagraph.push({ ...segment, text: line });
          }
        } else if (line) {
          // Non-empty text
          currentParagraph.push({ ...segment, text: line });
        }
      }
    }

    // Add final paragraph
    if (currentParagraph.length > 0) {
      result.push(currentParagraph);
    }

    return result;
  }, [segments]);

  // Handle click on a semantic unit
  const handleUnitClick = (unitIndex) => {
    if (!semanticArrays || unitIndex >= semanticArrays.original.length) {
      return;
    }
    
    const originalText = semanticArrays.original[unitIndex];
    const translatedText = semanticArrays.translated[unitIndex];
    const metadata = semanticArrays.metadata[unitIndex];
    
    // Debug: Log which component is handling the click
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 ClickableTranslationSemantic (${direction}) handling click:`, { unitIndex, originalText, translatedText });
    }
    
    // Call the callback with the semantic unit information
    if (onSegmentClick) {
      onSegmentClick({
        unitIndex,
        originalText,
        translatedText,
        source: metadata.source,
        metadata,
        direction: direction
      });
    }
  };

  // Render a single segment with highlighting
  const renderSegment = (segment, index) => {
    if (segment.isClickable) {
      // Handle both single index and array of indices for highlighting
      const isHighlighted = Array.isArray(highlightedTranslationUnitIndex)
        ? highlightedTranslationUnitIndex.includes(segment.unitIndex)
        : highlightedTranslationUnitIndex === segment.unitIndex;

      return (
        <span
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          data-unit-index={segment.unitIndex}
          onClick={() => handleUnitClick(segment.unitIndex)}
          style={{
            cursor: 'pointer',
            borderRadius: '2px',
            transition: 'all 0.1s ease-out',
            display: 'inline',
            backgroundColor: isHighlighted ? 'var(--highlight-bg)' : 'transparent',
            color: isHighlighted ? 'var(--highlight-text)' : 'inherit',
            fontWeight: isHighlighted ? 'bold' : 'normal'
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
          title={`Click to highlight "${segment.originalText}" (${segment.source})`}
        >
          {segment.text}
        </span>
      );
    } else {
      // Non-clickable text (spaces, punctuation, etc.)
      return (
        <span
          key={`text-${index}-${segment.start}`}
          className={segment.type === 'space' ? '' : 'text-gray-600 dark:text-gray-300'}
        >
          {segment.text}
        </span>
      );
    }
  };

  // Render segments grouped into paragraphs
  const renderSegments = () => {
    if (segments.length === 0) {
      return <span>{translatedText}</span>;
    }

    // Render each paragraph with custom spacing
    return paragraphs.map((paragraphSegments, paragraphIndex) => (
      <div
        key={`paragraph-${paragraphIndex}`}
        style={{
          marginBottom: paragraphIndex < paragraphs.length - 1
            ? 'var(--character-only-paragraph-spacing, 1rem)'
            : '0',
          whiteSpace: 'pre-wrap'
        }}
      >
        {paragraphSegments.map((segment, segmentIndex) => renderSegment(segment, segmentIndex))}
      </div>
    ));
  };

  return (
    <div style={{ lineHeight: '1.4' }}>
      {renderSegments()}
    </div>
  );
};

ClickableTranslationSemantic.propTypes = {
  translatedText: PropTypes.string,
  semanticArrays: PropTypes.shape({
    original: PropTypes.array,
    translated: PropTypes.array,
    metadata: PropTypes.array
  }),
  onSegmentClick: PropTypes.func,
  highlightedTranslationUnitIndex: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
  direction: PropTypes.string
};

export default React.memo(ClickableTranslationSemantic);