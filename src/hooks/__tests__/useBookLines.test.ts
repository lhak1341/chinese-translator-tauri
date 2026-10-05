import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBookLines } from '../useBookLines';

// The page, eviction and error rules are `BookLinesStore.test.ts`'s. This file only pins the
// adapter: the store is made once, followed through `useSyncExternalStore`, and closed on
// unmount.

const readBookLines = vi.fn();

global.window.electronAPI = {
  readBookLines: (fingerprint: string, start: number, end: number) =>
    readBookLines(fingerprint, start, end),
} as unknown as typeof window.electronAPI;

beforeEach(() => {
  readBookLines.mockReset();
  readBookLines.mockImplementation(async (_fingerprint: string, start: number, end: number) => ({
    start,
    lines: Array.from({ length: end - start }, (_, i) => `line ${start + i}`),
    lineCount: 1_000,
  }));
});

describe('useBookLines', () => {
  it('re-renders with a bumped linesVersion and the new line when a page lands', async () => {
    const { result } = renderHook(() => useBookLines('fp-1', 1_000));
    expect(result.current.linesVersion).toBe(0);

    act(() => result.current.requestRange(0, 10));
    await waitFor(() => expect(result.current.linesVersion).toBe(1));

    expect(result.current.getLine(1)).toBe('line 1');
  });

  it('keeps getLine and requestRange referentially stable across renders', async () => {
    const { result } = renderHook(() => useBookLines('fp-1', 1_000));
    const { getLine, requestRange } = result.current;

    act(() => result.current.requestRange(0, 10));
    await waitFor(() => expect(result.current.linesVersion).toBe(1));

    expect(result.current.getLine).toBe(getLine);
    expect(result.current.requestRange).toBe(requestRange);
  });

  it('surfaces a failed read as error', async () => {
    readBookLines.mockRejectedValueOnce(new Error('No book is open'));
    const { result } = renderHook(() => useBookLines('fp-1', 1_000));

    act(() => result.current.requestRange(0, 10));

    await waitFor(() => expect(result.current.error).toBe('No book is open'));
  });

  it('stops fetching once unmounted', () => {
    const { result, unmount } = renderHook(() => useBookLines('fp-1', 1_000));
    const { requestRange } = result.current;

    unmount();
    requestRange(0, 10);

    expect(readBookLines).not.toHaveBeenCalled();
  });
});
