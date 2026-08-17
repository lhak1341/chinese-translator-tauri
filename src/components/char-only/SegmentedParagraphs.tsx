import React from 'react';
import { HighlightableSegment } from './HighlightableSegment';

interface BaseSegment {
  isClickable: boolean;
  unitIndex: number;
  start: number;
  text: string;
}

export interface RenderSegmentedContentOptions<S extends BaseSegment> {
  /** Flat segment list — used only to detect the empty/fallback case. */
  segments: S[];
  /** Segments grouped into paragraphs (see groupSegmentsIntoParagraphs). */
  paragraphs: S[][];
  /** Builds the title attribute for a clickable segment. */
  getTitle: (segment: S) => string;
  /** Whether a clickable segment should render highlighted. */
  isHighlighted: (segment: S) => boolean;
  /** Click handler for a clickable segment's unitIndex. */
  onUnitClick: (unitIndex: number) => void;
  /** className for a non-clickable segment's <span>. */
  getNonClickableClassName: (segment: S) => string;
  /** Rendered when segments is empty — each caller owns its own fallback branching. */
  renderFallback: () => React.ReactNode;
  containerClassName: string;
  paragraphClassName: string;
  /** CSS custom property name (e.g. '--chinese-text-paragraph-spacing'), no var(...) wrapper. */
  paragraphSpacingVar: string;
}

/**
 * Shared paragraph-grouped segment renderer for the two char-only Clickable*Semantic
 * components. Extracted 2026-07-29 — both components had independently re-implemented an
 * identical paragraph-wrapping loop and clickable/non-clickable segment branch; the pieces
 * that actually differ (title format, highlight arity, click direction, non-clickable
 * className, fallback branch count/shape) stay caller-owned via the injected callbacks
 * rather than being generalized here.
 */
export function renderSegmentedContent<S extends BaseSegment>({
  segments,
  paragraphs,
  getTitle,
  isHighlighted,
  onUnitClick,
  getNonClickableClassName,
  renderFallback,
  containerClassName,
  paragraphClassName,
  paragraphSpacingVar,
}: RenderSegmentedContentOptions<S>): React.ReactNode {
  if (segments.length === 0) {
    return <div className={containerClassName}>{renderFallback()}</div>;
  }

  return (
    <div className={containerClassName}>
      {paragraphs.map((paragraphSegments, paragraphIndex) => (
        <div
          key={`paragraph-${paragraphIndex}`}
          className={paragraphClassName}
          style={{
            marginBottom:
              paragraphIndex < paragraphs.length - 1 ? `var(${paragraphSpacingVar}, 1rem)` : '0',
          }}
        >
          {paragraphSegments.map((segment, segmentIndex) =>
            segment.isClickable ? (
              <HighlightableSegment
                key={`segment-${segment.unitIndex}-${segment.start}-${segmentIndex}`}
                text={segment.text}
                unitIndex={segment.unitIndex}
                isHighlighted={isHighlighted(segment)}
                title={getTitle(segment)}
                onUnitClick={onUnitClick}
              />
            ) : (
              <span
                key={`text-${segmentIndex}-${segment.start}`}
                className={getNonClickableClassName(segment)}
              >
                {segment.text}
              </span>
            )
          )}
        </div>
      ))}
    </div>
  );
}
