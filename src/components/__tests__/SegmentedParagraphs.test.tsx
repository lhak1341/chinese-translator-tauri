import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { renderSegmentedContent } from '../char-only/SegmentedParagraphs';

interface TestSegment {
  isClickable: boolean;
  unitIndex: number;
  start: number;
  text: string;
  type?: string;
}

const clickable = (unitIndex: number, start: number, text: string): TestSegment => ({
  isClickable: true,
  unitIndex,
  start,
  text,
});

const nonClickable = (start: number, text: string, type?: string): TestSegment => ({
  isClickable: false,
  unitIndex: -1,
  start,
  text,
  type,
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

describe('renderSegmentedContent', () => {
  test('renders the fallback (and only the fallback) when segments is empty', () => {
    const options = baseOptions();
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    expect(container.querySelector('.container')?.textContent).toBe('fallback');
    expect(container.querySelectorAll('[data-unit-index]')).toHaveLength(0);
  });

  test('renders clickable segments as HighlightableSegment spans with data-unit-index and title', () => {
    const segments = [clickable(0, 0, '你')];
    const options = baseOptions({ segments, paragraphs: [segments] });
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    const el = container.querySelector('[data-unit-index="0"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe('你');
    expect(el?.getAttribute('title')).toBe('title-0');
  });

  test('renders non-clickable segments as plain spans using getNonClickableClassName', () => {
    const segments = [nonClickable(0, '，', 'punctuation')];
    const getNonClickableClassName = vi.fn((segment: TestSegment) =>
      segment.type === 'space' ? '' : 'punct-class'
    );
    const options = baseOptions({ segments, paragraphs: [segments], getNonClickableClassName });
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    expect(container.querySelectorAll('[data-unit-index]')).toHaveLength(0);
    const span = container.querySelector('span.punct-class');
    expect(span?.textContent).toBe('，');
    expect(getNonClickableClassName).toHaveBeenCalledWith(segments[0]);
  });

  test('calls onUnitClick with the segment unitIndex when a clickable segment is clicked', () => {
    const segments = [clickable(3, 0, '好')];
    const onUnitClick = vi.fn();
    const options = baseOptions({ segments, paragraphs: [segments], onUnitClick });
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    (container.querySelector('[data-unit-index="3"]') as HTMLElement).click();
    expect(onUnitClick).toHaveBeenCalledWith(3);
  });

  test('calls isHighlighted per segment and reflects it via the highlighted class', () => {
    const segments = [clickable(1, 0, 'A'), clickable(2, 1, 'B')];
    const isHighlighted = vi.fn((segment: TestSegment) => segment.unitIndex === 2);
    const options = baseOptions({ segments, paragraphs: [segments], isHighlighted });
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    expect(isHighlighted).toHaveBeenCalledTimes(2);
    const highlighted = container.querySelector('[data-unit-index="2"]');
    const notHighlighted = container.querySelector('[data-unit-index="1"]');
    expect(highlighted?.className).toMatch(/Highlighted/);
    expect(notHighlighted?.className).not.toMatch(/Highlighted/);
  });

  test('applies marginBottom to every paragraph except the last', () => {
    const p1 = [clickable(0, 0, 'A')];
    const p2 = [clickable(1, 1, 'B')];
    const options = baseOptions({ segments: [...p1, ...p2], paragraphs: [p1, p2] });
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    const paragraphDivs = container.querySelectorAll('.paragraph');
    expect(paragraphDivs).toHaveLength(2);
    expect((paragraphDivs[0] as HTMLElement).style.marginBottom).toBe(
      'var(--test-paragraph-spacing, 1rem)'
    );
    expect((paragraphDivs[1] as HTMLElement).style.marginBottom).toBe('0px');
  });

  test('a single paragraph gets marginBottom 0 (no "next" paragraph)', () => {
    const p1 = [clickable(0, 0, 'A')];
    const options = baseOptions({ segments: p1, paragraphs: [p1] });
    const { container } = render(<>{renderSegmentedContent(options)}</>);

    const paragraphDiv = container.querySelector('.paragraph') as HTMLElement;
    expect(paragraphDiv.style.marginBottom).toBe('0px');
  });
});
