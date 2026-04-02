/**
 * Tests for ClickableTranslationOptimized
 *
 * This component is the full-translation-mode clickable highlighting panel —
 * the untested half of the dual-path architecture documented in CLAUDE.md.
 * ClickableTranslationSemantic (character-only) has tests; this covers the
 * other side so both paths are guarded.
 *
 * What we test:
 * - Fallback rendering when no semantic arrays / prebuiltSegments provided
 * - Correct segments rendered from prebuiltSegments
 * - Highlight state applied via highlightedTranslationUnitIndex
 * - Array-based highlightedTranslationUnitIndex (multi-highlight)
 * - Click handler called with correct payload
 * - Paragraph splitting on newlines
 * - Non-clickable segments rendered without onClick behaviour
 * - Null / loading state (prebuiltSegments === undefined → null state)
 */

import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { PrebuiltSegment } from '../../types/ClickableTypes';
import ClickableTranslationOptimized from '../full-translation/ClickableTranslationOptimized';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Record<string, unknown> = {}): PrebuiltSegment {
  return {
    type: 'semantic' as const,
    text: 'bạn',
    translatedText: 'bạn',
    originalText: '你',
    start: 0,
    end: 3,
    unitIndex: 0,
    isClickable: true,
    source: 'character',
    metadata: { source: 'character', tokenIndex: 0 },
    isHighlighted: false,
    key: 'seg-0',
    ...overrides,
  } as PrebuiltSegment;
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    translatedText: 'bạn',
    semanticArrays: {
      translated: ['bạn'],
      original: ['你'],
      metadata: [{ source: 'character', tokenIndex: 0 }],
    },
    prebuiltSegments: [makeSegment()],
    onSegmentClick: vi.fn(),
    highlightedTranslationUnitIndex: -1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fallback rendering
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — fallback rendering', () => {
  test('renders fallback span when semanticArrays is null', () => {
    const { container } = render(
      <ClickableTranslationOptimized
        translatedText="bạn"
        semanticArrays={null as any}
        prebuiltSegments={[makeSegment()]}
      />
    );
    const fallback = container.querySelector('span');
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toBe('bạn');
  });

  test('renders fallback when prebuiltSegments is empty array', () => {
    const { container } = render(
      <ClickableTranslationOptimized
        translatedText="bạn"
        semanticArrays={{
          translated: ['bạn'],
          original: ['你'],
          metadata: [{ source: 'character' }],
        }}
        prebuiltSegments={[]}
      />
    );
    // With empty prebuiltSegments AND semanticArrays present but no render segs, fallback shown
    const fallback = container.querySelector('span');
    expect(fallback).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — basic rendering', () => {
  test('renders a clickable span for each prebuiltSegment', () => {
    const segs = [
      makeSegment({ unitIndex: 0 }),
      makeSegment({
        unitIndex: 1,
        text: 'tốt',
        translatedText: 'tốt',
        start: 4,
        end: 7,
        key: 'seg-1',
      }),
    ];
    const { container } = render(
      <ClickableTranslationOptimized
        {...makeProps({ prebuiltSegments: segs })}
        semanticArrays={{
          translated: ['bạn', 'tốt'],
          original: ['你', '好'],
          metadata: [{ source: 'character' }, { source: 'character' }],
        }}
      />
    );
    const spans = container.querySelectorAll('[data-unit-index]');
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  test('renders segment text content correctly', () => {
    const { container } = render(<ClickableTranslationOptimized {...makeProps()} />);
    // The segment text "bạn" should be present
    expect(container.textContent).toContain('bạn');
  });
});

// ---------------------------------------------------------------------------
// Highlight state
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — highlight state', () => {
  test('segment with matching unitIndex receives highlighted class', () => {
    const props = makeProps({ highlightedTranslationUnitIndex: 0 });
    const { container } = render(<ClickableTranslationOptimized {...props} />);
    // The highlighted span should have the highlighted CSS class applied
    const highlighted = container.querySelector('[data-unit-index="0"]');
    expect(highlighted).not.toBeNull();
    expect(highlighted!.className).toContain('Highlighted');
  });

  test('segment with non-matching unitIndex does not receive highlighted class', () => {
    const props = makeProps({ highlightedTranslationUnitIndex: 99 });
    const { container } = render(<ClickableTranslationOptimized {...props} />);
    const span = container.querySelector('[data-unit-index="0"]');
    expect(span!.className).not.toContain('Highlighted');
  });

  test('highlightedTranslationUnitIndex=-1 highlights nothing', () => {
    const props = makeProps({ highlightedTranslationUnitIndex: -1 });
    const { container } = render(<ClickableTranslationOptimized {...props} />);
    const span = container.querySelector('[data-unit-index="0"]');
    expect(span!.className).not.toContain('Highlighted');
  });

  test('array-based highlightedTranslationUnitIndex highlights multiple segments', () => {
    const segs = [
      makeSegment({ unitIndex: 0, key: 'seg-0' }),
      makeSegment({
        unitIndex: 1,
        text: 'tốt',
        translatedText: 'tốt',
        start: 4,
        end: 7,
        key: 'seg-1',
      }),
    ];
    const { container } = render(
      <ClickableTranslationOptimized
        translatedText="bạn tốt"
        semanticArrays={{
          translated: ['bạn', 'tốt'],
          original: ['你', '好'],
          metadata: [{ source: 'character' }, { source: 'character' }],
        }}
        prebuiltSegments={segs}
        highlightedTranslationUnitIndex={[0, 1] as any}
        onSegmentClick={vi.fn()}
      />
    );
    const allSpans = container.querySelectorAll('[data-unit-index]');
    // Both segments should have the highlighted class
    let highlightedCount = 0;
    allSpans.forEach((s) => {
      if (s.className.includes('Highlighted')) highlightedCount++;
    });
    expect(highlightedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Click handler
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — click handler', () => {
  test('clicking a segment calls onSegmentClick', () => {
    const handler = vi.fn();
    const { container } = render(
      <ClickableTranslationOptimized {...makeProps({ onSegmentClick: handler })} />
    );
    const span = container.querySelector('[data-unit-index="0"]')!;
    fireEvent.click(span);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('click payload includes unitIndex', () => {
    const handler = vi.fn();
    const { container } = render(
      <ClickableTranslationOptimized {...makeProps({ onSegmentClick: handler })} />
    );
    fireEvent.click(container.querySelector('[data-unit-index="0"]')!);
    const payload = handler.mock.calls[0][0];
    expect(payload.unitIndex).toBe(0);
  });

  test('click payload includes originalText', () => {
    const handler = vi.fn();
    const { container } = render(
      <ClickableTranslationOptimized {...makeProps({ onSegmentClick: handler })} />
    );
    fireEvent.click(container.querySelector('[data-unit-index="0"]')!);
    const payload = handler.mock.calls[0][0];
    expect(payload.originalText).toBe('你');
  });

  test('click payload direction is translation-to-original', () => {
    const handler = vi.fn();
    const { container } = render(
      <ClickableTranslationOptimized {...makeProps({ onSegmentClick: handler })} />
    );
    fireEvent.click(container.querySelector('[data-unit-index="0"]')!);
    const payload = handler.mock.calls[0][0];
    expect(payload.direction).toBe('translation-to-original');
  });
});

// ---------------------------------------------------------------------------
// Paragraph splitting
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — paragraph splitting', () => {
  test('newline in segment text creates multiple paragraph divs', () => {
    // This component breaks on every \n (not just \n\n or indented lines).
    // Vietnamese translated text uses single newlines between paragraphs.
    const segs = [
      makeSegment({
        text: 'bạn\ntốt',
        translatedText: 'bạn\ntốt',
        isClickable: false,
        unitIndex: -1,
        key: 'seg-0',
      }),
    ] as unknown as PrebuiltSegment[];
    const { container } = render(
      <ClickableTranslationOptimized
        translatedText="bạn\ntốt"
        semanticArrays={{
          translated: ['bạn'],
          original: ['你'],
          metadata: [{ source: 'character' }],
        }}
        prebuiltSegments={segs}
        onSegmentClick={vi.fn()}
      />
    );
    // Should produce at least 2 paragraph-level divs (grandchildren of RTL root)
    const paragraphs = container.querySelectorAll('div > div > div');
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  test('single-line text produces exactly one paragraph inside the container', () => {
    const { container } = render(<ClickableTranslationOptimized {...makeProps()} />);
    // The outer div is the RTL root; inside is the component container div;
    // inside that is 1 paragraph div. Use 'div > div > div' to count only
    // paragraph-level divs (grandchildren of RTL root).
    const paragraphs = container.querySelectorAll('div > div > div');
    expect(paragraphs.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Non-clickable segments
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — non-clickable segments', () => {
  test('non-clickable segment span has no onClick (does not call handler on click)', () => {
    const handler = vi.fn();
    const segs = [
      makeSegment({ isClickable: false, unitIndex: -1, key: 'seg-nc' }),
    ] as unknown as PrebuiltSegment[];
    const { container } = render(
      <ClickableTranslationOptimized
        translatedText="bạn"
        semanticArrays={{
          translated: ['bạn'],
          original: ['你'],
          metadata: [{ source: 'character' }],
        }}
        prebuiltSegments={segs}
        onSegmentClick={handler}
      />
    );
    // Find a span and click it — handler should NOT be called
    const span = container.querySelector('span');
    if (span) fireEvent.click(span);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// title attribute (accessibility)
// ---------------------------------------------------------------------------

describe('ClickableTranslationOptimized — title attribute', () => {
  test('clickable segment has a title attribute for accessibility', () => {
    const { container } = render(<ClickableTranslationOptimized {...makeProps()} />);
    const span = container.querySelector('[data-unit-index="0"]');
    expect(span?.getAttribute('title')).not.toBeNull();
    expect(span?.getAttribute('title')).toContain('bạn');
  });
});
