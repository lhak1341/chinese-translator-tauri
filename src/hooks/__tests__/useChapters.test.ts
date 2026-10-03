import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChapters, type UseChaptersOptions } from '../useChapters';
import type { ChapterHeader, ChapterOutlineSummary } from '../../types/ReaderTypes';
import type { EngineCall } from '../../utils/reader/ReaderEngine';

const chapterHeadersForPattern = vi.fn();

global.window.electronAPI = {
  detectChapterOutline: vi.fn(),
  chapterHeadersForPattern: (fingerprint: string, pattern: string) =>
    chapterHeadersForPattern(fingerprint, pattern),
} as unknown as typeof window.electronAPI;

vi.mock('../../utils/reader/BookRecordsBackend', () => ({
  setChapterOutline: vi.fn().mockResolvedValue(undefined),
  setManualChapterPattern: vi.fn().mockResolvedValue(undefined),
}));

const CACHED: ChapterOutlineSummary = {
  pattern: 'chapter',
  candidates: [{ pattern: 'chapter', hitCount: 3, medianGap: 95, regularity: 1 }],
};

// Titles of BATCH_TARGET_CHARS (500) each, so every chapter is its own engine call and
// the order of calls shows the order of priority.
const HEADERS: ChapterHeader[] = [
  { line: 0, title: '一'.repeat(500) },
  { line: 100, title: '二'.repeat(500) },
  { line: 190, title: '三'.repeat(500) },
];

function deferredEngine() {
  const pending: Array<{ text: string; resolve: (text: string) => void }> = [];
  const translateBatch = vi.fn(
    (text: string) =>
      new Promise<string>((resolve) => {
        pending.push({ text, resolve });
      })
  ) as unknown as EngineCall<string> & ReturnType<typeof vi.fn>;
  return { translateBatch, pending };
}

function options(overrides: Partial<UseChaptersOptions> = {}): UseChaptersOptions {
  return {
    fingerprint: 'fp1',
    cachedOutline: CACHED,
    cachedManualPattern: null,
    anchor: { anchorLine: 0, readLine: () => 0, scrollToLine: vi.fn() },
    translateBatch: vi.fn() as unknown as EngineCall<string>,
    dictionaryVersion: 0,
    isEnabled: false,
    ...overrides,
  };
}

function anchorAt(line: number, scrollToLine = vi.fn()) {
  return { anchorLine: line, readLine: () => line, scrollToLine };
}

beforeEach(() => {
  chapterHeadersForPattern.mockReset();
  chapterHeadersForPattern.mockResolvedValue(HEADERS);
});

describe('useChapters', () => {
  it('places the current chapter from the anchor, including before the first header', async () => {
    const headers: ChapterHeader[] = [
      { line: 10, title: 'One' },
      { line: 100, title: 'Two' },
    ];
    chapterHeadersForPattern.mockResolvedValue(headers);

    const { result, rerender } = renderHook((props: UseChaptersOptions) => useChapters(props), {
      initialProps: options({ anchor: anchorAt(5) }),
    });
    await waitFor(() => expect(result.current.headers).toHaveLength(2));

    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.current).toBeNull();

    rerender(options({ anchor: anchorAt(150) }));
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.current).toEqual(headers[1]);
  });

  it('canStep follows stepChapter at both ends, and back is enabled mid-first-chapter', async () => {
    const { result, rerender } = renderHook((props: UseChaptersOptions) => useChapters(props), {
      initialProps: options({ anchor: anchorAt(0) }),
    });
    await waitFor(() => expect(result.current.headers).toHaveLength(3));

    // On the first header line: nowhere to go back to.
    expect(result.current.canStep(-1)).toBe(false);
    expect(result.current.canStep(1)).toBe(true);

    // Inside the first chapter, back returns to its own start.
    rerender(options({ anchor: anchorAt(20) }));
    expect(result.current.canStep(-1)).toBe(true);

    // In the last chapter: no next.
    rerender(options({ anchor: anchorAt(250) }));
    expect(result.current.canStep(1)).toBe(false);
  });

  it('with no chapter structure, neither direction can step', async () => {
    chapterHeadersForPattern.mockResolvedValue([]);
    const { result } = renderHook(() => useChapters(options({ anchor: anchorAt(50) })));
    await waitFor(() => expect(chapterHeadersForPattern).toHaveBeenCalled());

    expect(result.current.canStep(-1)).toBe(false);
    expect(result.current.canStep(1)).toBe(false);
  });

  it('step reads readLine(), not the anchorLine of the render it was created in', async () => {
    const scrollToLine = vi.fn();
    // The render still says line 0, but a first `]` has already moved the anchor to 100.
    const { result } = renderHook(() =>
      useChapters(options({ anchor: { anchorLine: 0, readLine: () => 100, scrollToLine } }))
    );
    await waitFor(() => expect(result.current.headers).toHaveLength(3));

    result.current.step(1);
    expect(scrollToLine).toHaveBeenCalledWith(190);
  });

  it('displayTitle falls back from translated to original to a placeholder', async () => {
    const headers: ChapterHeader[] = [
      { line: 0, title: '第一章' },
      { line: 50, title: '' },
      { line: 90, title: '第三章' },
    ];
    chapterHeadersForPattern.mockResolvedValue(headers);
    const translateBatch = vi.fn(async (text: string) =>
      text
        .split('\n')
        .map((t) => (t === '第一章' ? 'Chương một' : t))
        .join('\n')
    ) as unknown as EngineCall<string>;

    const { result } = renderHook(() => useChapters(options({ translateBatch, isEnabled: true })));
    await waitFor(() => expect(result.current.displayTitle(headers[0])).toBe('Chương một'));

    expect(result.current.displayTitle(headers[1])).toBe('(untitled)');
    expect(result.current.displayTitle(headers[2])).toBe('第三章');
  });

  it("prioritizes title translation by the current chapter's line, not the anchor line", async () => {
    const { translateBatch } = deferredEngine();
    // Line 180 is in the chapter starting at 100, but nearer the header at 190. By anchor
    // line the third title would go first; by chapter, the second.
    renderHook(() =>
      useChapters(options({ anchor: anchorAt(180), translateBatch, isEnabled: true }))
    );

    await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1));
    expect(translateBatch).toHaveBeenLastCalledWith(HEADERS[1].title);
  });

  it('crossing into another chapter re-prioritizes without losing the batch in flight', async () => {
    const { translateBatch, pending } = deferredEngine();
    const { result, rerender } = renderHook((props: UseChaptersOptions) => useChapters(props), {
      initialProps: options({ anchor: anchorAt(0), translateBatch, isEnabled: true }),
    });

    await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1));
    expect(translateBatch).toHaveBeenLastCalledWith(HEADERS[0].title);

    rerender(options({ anchor: anchorAt(195), translateBatch, isEnabled: true }));
    pending[0].resolve('Chương một');

    await waitFor(() => expect(result.current.displayTitle(HEADERS[0])).toBe('Chương một'));
    await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(2));
    // The chapter now on screen jumps the queue ahead of the one between.
    expect(translateBatch).toHaveBeenLastCalledWith(HEADERS[2].title);
  });

  it('exposes the override slice for the binding dialog', async () => {
    const { result } = renderHook(() => useChapters(options()));
    await waitFor(() => expect(result.current.headers).toHaveLength(3));

    expect(result.current.override.activePattern).toBe('chapter');
    expect(result.current.override.isOverridden).toBe(false);
    expect(result.current.override.candidates).toEqual(CACHED.candidates);
  });
});
