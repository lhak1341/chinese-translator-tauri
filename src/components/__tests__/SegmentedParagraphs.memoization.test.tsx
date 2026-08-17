/**
 * Regression test for the closure-per-segment memo defeat (architecture review
 * 2026-08-17, candidate #2): renderSegmentedContent used to build a fresh
 * `() => onUnitClick(segment.unitIndex)` closure per segment on every render,
 * which invalidated HighlightableSegment's React.memo for every segment whenever
 * ANY highlight index changed, not just the segment whose own isHighlighted flag
 * flipped. HighlightableSegment is mocked here with a spy double so the real
 * component's render count can be observed directly — the sibling
 * SegmentedParagraphs.test.tsx exercises the real component and must not be
 * affected by this mock, hence the separate file.
 */
import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { renderSegmentedContent } from '../char-only/SegmentedParagraphs';

const renderSpy = vi.fn();

vi.mock('../char-only/HighlightableSegment', () => ({
  HighlightableSegment: React.memo(
    ({
      text,
      unitIndex,
    }: {
      text: string;
      unitIndex: number;
      onUnitClick: (i: number) => void;
    }) => {
      renderSpy(unitIndex);
      return <span data-unit-index={unitIndex}>{text}</span>;
    }
  ),
}));

interface TestSegment {
  isClickable: boolean;
  unitIndex: number;
  start: number;
  text: string;
}

const clickable = (unitIndex: number, start: number, text: string): TestSegment => ({
  isClickable: true,
  unitIndex,
  start,
  text,
});

const baseOptions = (
  overrides: Partial<Parameters<typeof renderSegmentedContent<TestSegment>>[0]> = {}
) => ({
  segments: [] as TestSegment[],
  paragraphs: [] as TestSegment[][],
  getTitle: (segment: TestSegment) => `title-${segment.unitIndex}`,
  isHighlighted: () => false,
  onUnitClick: vi.fn(),
  getNonClickableClassName: () => 'non-clickable',
  renderFallback: () => <div>fallback</div>,
  containerClassName: 'container',
  paragraphClassName: 'paragraph',
  paragraphSpacingVar: '--test-paragraph-spacing',
  ...overrides,
});

describe('renderSegmentedContent — memoization', () => {
  test('only the segment whose isHighlighted changed re-renders', () => {
    const segments = [clickable(1, 0, 'A'), clickable(2, 1, 'B'), clickable(3, 2, 'C')];
    const onUnitClick = vi.fn();
    const isHighlightedA = (segment: TestSegment) => segment.unitIndex === 2;
    const isHighlightedB = (segment: TestSegment) => segment.unitIndex === 3;

    const { rerender } = render(
      <>
        {renderSegmentedContent(
          baseOptions({
            segments,
            paragraphs: [segments],
            onUnitClick,
            isHighlighted: isHighlightedA,
          })
        )}
      </>
    );

    renderSpy.mockClear();

    rerender(
      <>
        {renderSegmentedContent(
          baseOptions({
            segments,
            paragraphs: [segments],
            onUnitClick,
            isHighlighted: isHighlightedB,
          })
        )}
      </>
    );

    // Segment 2 (was highlighted, now isn't) and segment 3 (wasn't, now is) must
    // re-render. Segment 1 (never highlighted, unaffected) must NOT.
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy).toHaveBeenCalledWith(2);
    expect(renderSpy).toHaveBeenCalledWith(3);
    expect(renderSpy).not.toHaveBeenCalledWith(1);
  });
});
