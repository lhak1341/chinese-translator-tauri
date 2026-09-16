import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChapterOutline } from '../useChapterOutline';
import type { ChapterHeader, ChapterOutline, ChapterOutlineSummary } from '../../types/ReaderTypes';

const detectChapterOutline = vi.fn();
const chapterHeadersForPattern = vi.fn();
const setChapterOutline = vi.fn();
const setManualChapterPattern = vi.fn();

vi.mock('../../tauriAPI', () => ({
  default: {
    detectChapterOutline: (fingerprint: string) => detectChapterOutline(fingerprint),
    chapterHeadersForPattern: (fingerprint: string, pattern: string) =>
      chapterHeadersForPattern(fingerprint, pattern),
  },
}));

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
  it('runs full election on a fingerprint with no cached outline, reusing the winner headers', async () => {
    detectChapterOutline.mockResolvedValue(FULL_ELECTION);

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: null, cachedManualPattern: null })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(detectChapterOutline).toHaveBeenCalledWith('fp1');
    // The election call's own headers are reused — no second round trip needed.
    expect(chapterHeadersForPattern).not.toHaveBeenCalled();
    expect(result.current.headers).toEqual(FULL_ELECTION.headers);
    expect(result.current.candidates).toEqual(FULL_ELECTION.candidates);
    expect(result.current.activePattern).toBe('chapter');
    expect(result.current.isOverridden).toBe(false);
    expect(setChapterOutline).toHaveBeenCalledWith('fp1', {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    });
  });

  it('fetches headers for a persisted override instead of the freshly-elected pattern', async () => {
    detectChapterOutline.mockResolvedValue(FULL_ELECTION);
    chapterHeadersForPattern.mockResolvedValue([{ line: 5, title: 'Volume 1' }]);

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: null, cachedManualPattern: 'volume' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(chapterHeadersForPattern).toHaveBeenCalledWith('fp1', 'volume');
    expect(result.current.headers).toEqual([{ line: 5, title: 'Volume 1' }]);
    expect(result.current.activePattern).toBe('volume');
    expect(result.current.isOverridden).toBe(true);
  });

  it('skips election entirely when a cached outline already exists, fetching only its headers', async () => {
    const cached: ChapterOutlineSummary = {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    };
    chapterHeadersForPattern.mockResolvedValue(FULL_ELECTION.headers);

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: cached, cachedManualPattern: null })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(detectChapterOutline).not.toHaveBeenCalled();
    expect(chapterHeadersForPattern).toHaveBeenCalledWith('fp1', 'chapter');
    expect(result.current.headers).toEqual(FULL_ELECTION.headers);
    expect(result.current.candidates).toEqual(FULL_ELECTION.candidates);
  });

  it('reports no headers and no active pattern when a cached outline elected nothing', async () => {
    const cached: ChapterOutlineSummary = { pattern: null, candidates: FULL_ELECTION.candidates };

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: cached, cachedManualPattern: null })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(chapterHeadersForPattern).not.toHaveBeenCalled();
    expect(result.current.headers).toEqual([]);
    expect(result.current.activePattern).toBeNull();
  });

  it('setOverride switches the active pattern, fetches its headers, and persists the choice', async () => {
    const cached: ChapterOutlineSummary = {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    };
    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: cached, cachedManualPattern: null })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    chapterHeadersForPattern.mockResolvedValueOnce([{ line: 5, title: 'Volume 1' }]);
    act(() => result.current.setOverride('volume'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(chapterHeadersForPattern).toHaveBeenLastCalledWith('fp1', 'volume');
    expect(result.current.headers).toEqual([{ line: 5, title: 'Volume 1' }]);
    expect(result.current.activePattern).toBe('volume');
    expect(result.current.isOverridden).toBe(true);
    expect(setManualChapterPattern).toHaveBeenCalledWith('fp1', 'volume');
  });

  it('setOverride(null) reverts to the elected pattern', async () => {
    const cached: ChapterOutlineSummary = {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    };
    chapterHeadersForPattern.mockResolvedValueOnce([{ line: 5, title: 'Volume 1' }]);

    const { result } = renderHook(() =>
      useChapterOutline({
        fingerprint: 'fp1',
        cachedOutline: cached,
        cachedManualPattern: 'volume',
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOverridden).toBe(true);

    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);
    act(() => result.current.setOverride(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(chapterHeadersForPattern).toHaveBeenLastCalledWith('fp1', 'chapter');
    expect(result.current.activePattern).toBe('chapter');
    expect(result.current.isOverridden).toBe(false);
    expect(setManualChapterPattern).toHaveBeenCalledWith('fp1', null);
  });

  it('a slower mount-fetch resolving after a faster override-fetch does not clobber the override', async () => {
    const cached: ChapterOutlineSummary = {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    };

    // The mount effect's own fetch (for "chapter") is deliberately left unresolved until
    // after the override's fetch (for "volume") has already resolved and applied — the
    // race this test exists to prove is fixed.
    let resolveMountFetch: (headers: ChapterHeader[]) => void = () => {};
    const mountFetch = new Promise<ChapterHeader[]>((resolve) => {
      resolveMountFetch = resolve;
    });
    chapterHeadersForPattern.mockImplementationOnce(() => mountFetch);

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: cached, cachedManualPattern: null })
    );

    chapterHeadersForPattern.mockResolvedValueOnce([{ line: 5, title: 'Volume 1' }]);
    act(() => result.current.setOverride('volume'));
    await waitFor(() => expect(result.current.activePattern).toBe('volume'));
    await waitFor(() => expect(result.current.headers).toEqual([{ line: 5, title: 'Volume 1' }]));

    // Now let the stale mount-effect fetch resolve. Its result must be discarded.
    act(() => resolveMountFetch(FULL_ELECTION.headers));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.activePattern).toBe('volume');
    expect(result.current.headers).toEqual([{ line: 5, title: 'Volume 1' }]);
  });

  it('surfaces a failed election as an error rather than throwing', async () => {
    detectChapterOutline.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useChapterOutline({ fingerprint: 'fp1', cachedOutline: null, cachedManualPattern: null })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.headers).toEqual([]);
  });
});
