import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * The virtualizer is mocked down to the one thing these tests are about: the
 * `estimateSize` the hook hands it. Every mounted row is measured for real in the browser,
 * so the estimate only ever governs regions the reader has never visited — which is
 * exactly where a wrong blank-line height compounds into a scrollbar that lies.
 */
const capturedOptions: { estimateSize?: (index: number) => number } = {};

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { estimateSize: (index: number) => number }) => {
    capturedOptions.estimateSize = options.estimateSize;
    return {
      getTotalSize: () => 0,
      getVirtualItems: () => [],
      measureElement: vi.fn(),
      measurementsCache: [],
    };
  },
}));

import { useReaderPanel } from '../useReaderPanel';

/** The lines every case below draws from: blank, unfetched, and ordinary prose. */
const BLANK_LINE = 1;
const UNFETCHED_LINE = 2;
const TEXT_LINE = 0;

function renderPanel(lines: Record<number, string | undefined>) {
  return renderHook(() =>
    useReaderPanel({
      lineCount: 10,
      emPerChar: 1,
      charCountAt: (index) => lines[index]?.length ?? 0,
      isBlankAt: (index) => lines[index]?.trim() === '',
    })
  );
}

describe('useReaderPanel estimateSize', () => {
  beforeEach(() => {
    capturedOptions.estimateSize = undefined;
  });

  const lines: Record<number, string | undefined> = {
    [TEXT_LINE]: '第一章 開始',
    [BLANK_LINE]: '',
    [UNFETCHED_LINE]: undefined,
  };

  it('estimates a blank line at zero, so its row claims no height it will not render', () => {
    renderPanel(lines);
    expect(capturedOptions.estimateSize?.(BLANK_LINE)).toBe(0);
  });

  it('keeps an unfetched line at full height rather than treating it as blank', () => {
    // Both report a character count of 0, which is why `isBlankAt` exists separately: an
    // unfetched row that estimated at zero would shrink the document and then grow it
    // again as its page landed, moving everything under it.
    renderPanel(lines);
    expect(capturedOptions.estimateSize?.(UNFETCHED_LINE)).toBeGreaterThan(0);
  });

  it('leaves a line with text alone', () => {
    renderPanel(lines);
    expect(capturedOptions.estimateSize?.(TEXT_LINE)).toBeGreaterThan(0);
  });

  it('treats a whitespace-only line as blank — a paragraph break is often spaces or a tab', () => {
    renderPanel({ ...lines, [BLANK_LINE]: '  \t ' });
    expect(capturedOptions.estimateSize?.(BLANK_LINE)).toBe(0);
  });
});
