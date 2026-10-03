import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChapterOutline } from '../useChapterOutline';
import type { ChapterOutline, ChapterOutlineSummary } from '../../types/ReaderTypes';

// The ordering rules are pinned on the store, in `ChapterOutlineStore.test.ts`; these
// cover only the wiring: the hook starts the store, re-renders from it, and closes it.

const detectChapterOutline = vi.fn();
const chapterHeadersForPattern = vi.fn();
const setChapterOutline = vi.fn();
const setManualChapterPattern = vi.fn();

global.window.electronAPI = {
  detectChapterOutline: (fingerprint: string) => detectChapterOutline(fingerprint),
  chapterHeadersForPattern: (fingerprint: string, pattern: string) =>
    chapterHeadersForPattern(fingerprint, pattern),
} as unknown as typeof window.electronAPI;

vi.mock('../../utils/reader/BookRecordsBackend', () => ({
  setChapterOutline: (fingerprint: string, outline: unknown) =>
    setChapterOutline(fingerprint, outline),
  setManualChapterPattern: (fingerprint: string, pattern: string | null) =>
    setManualChapterPattern(fingerprint, pattern),
}));

const FULL_ELECTION: ChapterOutline = {
  candidates: [
    { pattern: 'chapter', hitCount: 800, medianGap: 60, regularity: 1 },
    { pattern: 'volume', hitCount: 10, medianGap: 6000, regularity: 1 },
  ],
  elected: 'chapter',
  headers: [
    { line: 0, title: 'Chapter 1' },
    { line: 60, title: 'Chapter 2' },
  ],
};

beforeEach(() => {
  detectChapterOutline.mockReset();
  chapterHeadersForPattern.mockReset();
  setChapterOutline.mockReset();
  setManualChapterPattern.mockReset();
  setChapterOutline.mockResolvedValue(undefined);
  setManualChapterPattern.mockResolvedValue(undefined);
});

describe('useChapterOutline', () => {
  it('elects a never-seen book on mount and renders the result', async () => {
    detectChapterOutline.mockResolvedValue(FULL_ELECTION);

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: null, cachedManualPattern: null })
    );
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.headers).toEqual(FULL_ELECTION.headers);
    expect(result.current.activePattern).toBe('chapter');
  });

  it('setOverride re-renders with the chosen pattern and keeps a stable identity', async () => {
    const cached: ChapterOutlineSummary = {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    };
    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);
    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: cached, cachedManualPattern: null })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { setOverride } = result.current;

    chapterHeadersForPattern.mockResolvedValueOnce([{ line: 5, title: 'Volume 1' }]);
    act(() => result.current.setOverride('volume'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.activePattern).toBe('volume');
    expect(result.current.headers).toEqual([{ line: 5, title: 'Volume 1' }]);
    expect(result.current.setOverride).toBe(setOverride);
    expect(setManualChapterPattern).toHaveBeenCalledWith('fp1', 'volume');
  });

  it('applies nothing after unmount', async () => {
    let release: (outline: ChapterOutline) => void = () => {};
    detectChapterOutline.mockImplementationOnce(
      () =>
        new Promise<ChapterOutline>((resolve) => {
          release = resolve;
        })
    );
    const { unmount } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: null, cachedManualPattern: null })
    );

    unmount();
    release(FULL_ELECTION);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setChapterOutline).not.toHaveBeenCalled();
  });
});
