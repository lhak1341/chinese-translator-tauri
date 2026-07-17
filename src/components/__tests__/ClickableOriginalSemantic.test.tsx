/**
 * ClickableOriginalSemantic tests.
 *
 * Previously had no test file at all (found during 2026-07-17c architecture review,
 * candidate #6). Focus: the two-index-OR'd highlight shape unique to this component
 * (highlightedUnitIndex from clicking Original, highlightedTranslationUnitIndex from
 * clicking Full Translation — both should highlight the same original-text unit) via
 * the shared isUnitHighlighted predicate, plus basic rendering and edge cases.
 */
import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ClickableOriginalSemantic from '../char-only/ClickableOriginalSemantic';

function makeSemanticArrays() {
  return {
    original: ['你', '好', '世', '界'],
    translated: ['Hello', 'Hello', 'World', 'World'],
    metadata: [
      { originalStart: 0, originalEnd: 1, source: 'dictionary' },
      { originalStart: 1, originalEnd: 2, source: 'dictionary' },
      { originalStart: 2, originalEnd: 3, source: 'dictionary' },
      { originalStart: 3, originalEnd: 4, source: 'dictionary' },
    ],
  };
}

describe('ClickableOriginalSemantic', () => {
  test('renders one clickable segment per unit', () => {
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={makeSemanticArrays()}
        onSegmentClick={vi.fn()}
      />
    );

    expect(container.querySelectorAll('[data-unit-index]')).toHaveLength(4);
    expect(container.textContent).toBe('你好世界');
  });

  test('highlightedUnitIndex (clicked Original) highlights the matching segment', () => {
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={makeSemanticArrays()}
        highlightedUnitIndex={2}
        onSegmentClick={vi.fn()}
      />
    );

    const segments = container.querySelectorAll('[data-unit-index]');
    expect(segments[2].className).toContain('clickableSegmentHighlighted');
    expect(segments[0].className).not.toContain('clickableSegmentHighlighted');
  });

  test('highlightedTranslationUnitIndex (clicked Full Translation) highlights the matching segment', () => {
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={makeSemanticArrays()}
        highlightedTranslationUnitIndex={1}
        onSegmentClick={vi.fn()}
      />
    );

    const segments = container.querySelectorAll('[data-unit-index]');
    expect(segments[1].className).toContain('clickableSegmentHighlighted');
    expect(segments[2].className).not.toContain('clickableSegmentHighlighted');
  });

  test('both index props can independently highlight different segments at once', () => {
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={makeSemanticArrays()}
        highlightedUnitIndex={0}
        highlightedTranslationUnitIndex={3}
        onSegmentClick={vi.fn()}
      />
    );

    const segments = container.querySelectorAll('[data-unit-index]');
    expect(segments[0].className).toContain('clickableSegmentHighlighted');
    expect(segments[3].className).toContain('clickableSegmentHighlighted');
    expect(segments[1].className).not.toContain('clickableSegmentHighlighted');
  });

  test('default -1 index props highlight nothing', () => {
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={makeSemanticArrays()}
        onSegmentClick={vi.fn()}
      />
    );

    const segments = container.querySelectorAll('[data-unit-index]');
    segments.forEach((segment) => {
      expect(segment.className).not.toContain('clickableSegmentHighlighted');
    });
  });

  test('clicking a segment dispatches original-to-translation with the segment payload', () => {
    const onSegmentClick = vi.fn();
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={makeSemanticArrays()}
        onSegmentClick={onSegmentClick}
      />
    );

    const segments = container.querySelectorAll('[data-unit-index]');
    (segments[1] as HTMLElement).click();

    expect(onSegmentClick).toHaveBeenCalledWith(
      expect.objectContaining({
        unitIndex: 1,
        originalText: '好',
        translatedText: 'Hello',
        direction: 'original-to-translation',
      })
    );
  });

  test('renders placeholder text when originalText and semanticArrays are both absent', () => {
    const { container } = render(<ClickableOriginalSemantic onSegmentClick={vi.fn()} />);

    expect(container.textContent).toBe('Chinese text');
  });

  test('renders fallback text when semanticArrays is empty', () => {
    const { container } = render(
      <ClickableOriginalSemantic
        originalText="你好世界"
        semanticArrays={{ original: [], translated: [], metadata: [] }}
        onSegmentClick={vi.fn()}
      />
    );

    expect(container.textContent).toBe('你好世界');
    expect(container.querySelectorAll('[data-unit-index]')).toHaveLength(0);
  });
});
