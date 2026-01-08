/**
 * Optimized Clickable Translation Component
 * Uses pre-computed segments and memoization for maximum performance
 */
import React, { useMemo, useCallback } from 'react';
import type {
  ClickableTranslationOptimizedProps,
  SegmentComponentProps,
} from '../types/ClickableTypes';

// Memoized segment component to prevent unnecessary re-renders
const SegmentComponent: React.FC<SegmentComponentProps> = React.memo(
  ({ segment, onClick, isHighlighted }) => {
    const handleClick = useCallback(() => {
      if (segment.isClickable) {
        (onClick as any)({
          unitIndex: segment.unitIndex,
          originalText: segment.originalText,
          translatedText: segment.translatedText,
          source: segment.source,
          metadata: segment.metadata!,
          direction: 'translation-to-original',
        });
      }
    }, [segment, onClick]);

    const styles = useMemo(() => {
      const baseStyles: React.CSSProperties = {
        display: 'inline',
        transition: 'all 0.1s ease-out',
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
            (e.target as HTMLElement).style.backgroundColor = 'var(--hover-bg)';
          }
        }}
        onMouseLeave={(e) => {
          if (segment.isClickable && !isHighlighted) {
            (e.target as HTMLElement).style.backgroundColor = 'transparent';
          }
        }}
        title={
          segment.isClickable
            ? `"${segment.text}" ← translation (${segment.source || 'unknown'})`
            : undefined
        }
      >
        {segment.text}
      </span>
    );
  }
);

SegmentComponent.displayName = 'SegmentComponent';

const ClickableTranslationOptimized: React.FC<ClickableTranslationOptimizedProps> = ({
  translatedText,
  semanticArrays,
  prebuiltSegments = [],
  onSegmentClick,
  highlightedTranslationUnitIndex = -1,
}) => {
  // Use prebuilt segments for instant clickable highlighting (no computation needed!)
  const precomputedSegments = useMemo(() => {
    if (prebuiltSegments && prebuiltSegments.length > 0) {
      return prebuiltSegments;
    }

    // Fallback to empty if no prebuilt segments available
    return [];
  }, [prebuiltSegments]);

  // Create render segments only when highlight changes
  const renderSegments = useMemo(() => {
    return precomputedSegments.map((segment, index) => ({
      ...segment,
      key: `segment-${index}-${segment.unitIndex || 'na'}`,
      text: segment.translatedText || segment.text,
      isHighlighted: highlightedTranslationUnitIndex === segment.unitIndex,
    }));
  }, [precomputedSegments, highlightedTranslationUnitIndex]);

  // Group segments into paragraphs (every newline creates a paragraph break)
  const paragraphs = useMemo(() => {
    if (renderSegments.length === 0) return [];

    const result: any[][] = [];
    let currentParagraph: any[] = [];

    for (let i = 0; i < renderSegments.length; i++) {
      const segment = renderSegments[i];

      // If segment contains newline, split it into multiple parts
      if (segment.text.includes('\n')) {
        const parts = segment.text.split('\n');

        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];

          // Add non-empty part to current paragraph
          if (part) {
            currentParagraph.push({ ...segment, text: part });
          }

          // After each part except the last, end the paragraph
          if (j < parts.length - 1) {
            if (currentParagraph.length > 0) {
              result.push(currentParagraph);
              currentParagraph = [];
            }
          }
        }
      } else {
        // No newline, just add to current paragraph
        currentParagraph.push(segment);
      }
    }

    // Add final paragraph if any segments remain
    if (currentParagraph.length > 0) {
      result.push(currentParagraph);
    }

    return result;
  }, [renderSegments]);

  // Memoize click handler to prevent re-renders
  const handleSegmentClick = useCallback(
    (segmentData: any) => {
      if (onSegmentClick) {
        (onSegmentClick as any)(segmentData);
      }
    },
    [onSegmentClick]
  );

  // No loading state needed - segments are prebuilt!

  // Fallback for when no semantic arrays are available
  if (!semanticArrays || renderSegments.length === 0) {
    return <span style={{ lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{translatedText}</span>;
  }

  // Render optimized segments grouped into paragraphs
  return (
    <div style={{ lineHeight: 1.4 }}>
      {paragraphs.map((paragraphSegments, paragraphIndex) => (
        <div
          key={`paragraph-${paragraphIndex}`}
          style={{
            marginBottom:
              paragraphIndex < paragraphs.length - 1
                ? 'var(--full-translation-paragraph-spacing, 1rem)'
                : '0',
            whiteSpace: 'pre-wrap',
          }}
        >
          {paragraphSegments.map((segment: any) => (
            <SegmentComponent
              key={segment.key}
              segment={segment}
              onClick={handleSegmentClick}
              isHighlighted={segment.isHighlighted}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// Memoize the entire component to prevent unnecessary re-renders
export default React.memo(ClickableTranslationOptimized);
