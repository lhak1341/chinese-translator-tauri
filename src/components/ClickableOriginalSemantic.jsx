/**
 * Semantic Array-Based Clickable Original Component
 * Uses precomputed segments from SegmentPrecomputer for reliable highlighting
 *
 * @import { ClickableOriginalSemanticProps } from '../types/ClickableTypes'
 */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { SegmentPrecomputer } from '../utils/SegmentPrecomputer.js';

/**
 * @param {ClickableOriginalSemanticProps} props
 */
const ClickableOriginalSemantic = ({ 
  originalText, 
  semanticArrays, 
  highlightedUnitIndex = -1,
  highlightedTranslationUnitIndex = -1,
  onSegmentClick 
}) => {
  // Handle click on a semantic unit in original text
  const handleUnitClick = (unitIndex) => {
    if (!semanticArrays || unitIndex >= semanticArrays.original.length) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Invalid unit index or no semantic arrays:', unitIndex);
      }
      return;
    }
    
    const originalText = semanticArrays.original[unitIndex];
    const translatedText = semanticArrays.translated[unitIndex];
    const metadata = semanticArrays.metadata[unitIndex];
    
    // Debug: Log which component is handling the click
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 ClickableOriginalSemantic (original-to-translation) handling click:`, { unitIndex, originalText, translatedText });
    }
    
    // Call the callback to highlight the corresponding translation
    if (onSegmentClick) {
      onSegmentClick({
        unitIndex,
        originalText,
        translatedText,
        source: metadata.source,
        metadata,
        direction: 'original-to-translation'
      });
    }
  };

  // Use SegmentPrecomputer to create reliable segments
  const segments = useMemo(() => {
    if (!semanticArrays || !semanticArrays.original || semanticArrays.original.length === 0) {
      return [];
    }
    return SegmentPrecomputer.precomputeOriginalSegments(originalText, semanticArrays);
  }, [originalText, semanticArrays]);

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

  // Render a single segment with highlighting
  const renderSegment = (segment, index) => {
    if (segment.isClickable) {
      const isHighlighted = highlightedUnitIndex === segment.unitIndex ||
                           highlightedTranslationUnitIndex === segment.unitIndex;

      return (
        <span
          key={`segment-${segment.unitIndex}-${segment.start}-${index}`}
          data-unit-index={segment.unitIndex}
          onClick={() => handleUnitClick(segment.unitIndex)}
          style={{
            cursor: 'pointer',
            borderRadius: '2px',
            transition: 'background-color 0.2s',
            backgroundColor: isHighlighted ? 'var(--highlight-bg)' : 'transparent',
            color: isHighlighted ? 'var(--highlight-text)' : 'inherit',
            fontWeight: isHighlighted ? 'bold' : 'normal',
            display: 'inline'
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
          title={`"${segment.originalText}" → "${segment.translatedText}" (${segment.source})`}
        >
          {segment.text}
        </span>
      );
    } else {
      // Non-clickable text (characters, punctuation, etc.)
      return (
        <span
          key={`text-${index}-${segment.start}`}
          style={{ color: 'var(--muted-text)' }}
        >
          {segment.text}
        </span>
      );
    }
  };

  // Render segments grouped into paragraphs
  const renderSegments = () => {
    if (!originalText) {
      return <div>Chinese text</div>;
    }

    if (segments.length === 0) {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{originalText}</div>;
    }

    // Render each paragraph with custom spacing
    return paragraphs.map((paragraphSegments, paragraphIndex) => (
      <div
        key={`paragraph-${paragraphIndex}`}
        style={{
          marginBottom: paragraphIndex < paragraphs.length - 1
            ? 'var(--chinese-text-paragraph-spacing, 1rem)'
            : '0',
          whiteSpace: 'pre-wrap'
        }}
      >
        {paragraphSegments.map((segment, segmentIndex) => renderSegment(segment, segmentIndex))}
      </div>
    ));
  };

  return (
    <div style={{ lineHeight: '1.6' }}>
      {renderSegments()}
    </div>
  );
};

ClickableOriginalSemantic.propTypes = {
  originalText: PropTypes.string,
  semanticArrays: PropTypes.shape({
    original: PropTypes.array,
    translated: PropTypes.array,
    metadata: PropTypes.array
  }),
  highlightedUnitIndex: PropTypes.number,
  highlightedTranslationUnitIndex: PropTypes.number,
  onSegmentClick: PropTypes.func
};

export default ClickableOriginalSemantic;