import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBookLines, LINES_PER_PAGE, PAGE_KEEP_RADIUS } from '../useBookLines';

const readBookLines = vi.fn();

vi.mock('../../tauriAPI', () => ({
  default: {
    readBookLines: (fingerprint: string, start: number, end: number) =>
      readBookLines(fingerprint, start, end),
  },
}));

/** A page whose every line names its own file line number, so misfiling is visible. */
function pageFor(
  start: number,
  end: number
): { start: number; lines: string[]; lineCount: number } {
  const lines: string[] = [];
  for (let index = start; index < end; index += 1) {
    // Every third line is blank, the way a novel's are — they must keep their slots.
    lines.push(index % 3 === 0 ? '' : `line ${index}`);
  }
  return { start, lines, lineCount: 100_000 };
}

const LINE_COUNT = 75_000;

beforeEach(() => {
  readBookLines.mockReset();
  readBookLines.mockImplementation(async (_fingerprint: string, start: number, end: number) =>
    pageFor(start, end)
  );
});

describe('useBookLines', () => {
  it('fetches whole pages covering the requested range, once each', async () => {
    const { result } = renderHook(() => useBookLines('fp-1', LINE_COUNT));

    act(() => result.current.requestRange(600, 620));
    await waitFor(() => expect(result.current.getLine(601)).toBe('line 601'));

    // One page covers the range, and asking again does not re-fetch it.
    expect(readBookLines).toHaveBeenCalledTimes(1);
    expect(readBookLines).toHaveBeenCalledWith('fp-1', LINES_PER_PAGE, LINES_PER_PAGE * 2);
    act(() => result.current.requestRange(600, 620));
    expect(readBookLines).toHaveBeenCalledTimes(1);
  });

  it('keeps blank lines addressable as empty strings', async () => {
    const { result } = renderHook(() => useBookLines('fp-1', LINE_COUNT));
    act(() => result.current.requestRange(0, 10));
    await waitFor(() => expect(result.current.getLine(1)).toBe('line 1'));

    // Line 3 is blank in the fixture: an empty string, not a missing line. If blanks were
    // dropped, line 4's text would have slid into this slot.
    expect(result.current.getLine(3)).toBe('');
    expect(result.current.getLine(4)).toBe('line 4');
  });

  it('reports a line it has not fetched as undefined rather than blank', () => {
    const { result } = renderHook(() => useBookLines('fp-1', LINE_COUNT));
    expect(result.current.getLine(40_000)).toBeUndefined();
  });

  it('drops pages the reader has scrolled far away from', async () => {
    const { result } = renderHook(() => useBookLines('fp-1', LINE_COUNT));

    act(() => result.current.requestRange(0, 10));
    await waitFor(() => expect(result.current.getLine(1)).toBe('line 1'));

    // Jump well beyond the keep radius. Reading a whole novel must not end with the whole
    // novel resident in the frontend.
    const farLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS + 20);
    act(() => result.current.requestRange(farLine, farLine + 10));
    await waitFor(() => expect(result.current.getLine(farLine + 2)).toBe(`line ${farLine + 2}`));

    expect(result.current.getLine(1)).toBeUndefined();
  });

  it('keeps pages within the radius so ordinary scrolling never re-fetches', async () => {
    const { result } = renderHook(() => useBookLines('fp-1', LINE_COUNT));

    act(() => result.current.requestRange(0, 10));
    await waitFor(() => expect(result.current.getLine(1)).toBe('line 1'));

    const nearLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS - 1);
    act(() => result.current.requestRange(nearLine, nearLine + 10));
    await waitFor(() => expect(result.current.getLine(nearLine + 2)).toBe(`line ${nearLine + 2}`));

    expect(result.current.getLine(1)).toBe('line 1');
  });

  it('clamps the last page to the book and never reads past its end', async () => {
    const shortBook = 20;
    const { result } = renderHook(() => useBookLines('fp-1', shortBook));
    act(() => result.current.requestRange(0, 1_000));
    await waitFor(() => expect(readBookLines).toHaveBeenCalled());
    expect(readBookLines).toHaveBeenCalledTimes(1);
    expect(readBookLines).toHaveBeenCalledWith('fp-1', 0, shortBook);
  });

  it('does nothing without an open book', () => {
    const { result } = renderHook(() => useBookLines(null, 0));
    act(() => result.current.requestRange(0, 100));
    expect(readBookLines).not.toHaveBeenCalled();
  });

  it('surfaces a failed read instead of leaving the rows silently blank', async () => {
    readBookLines.mockRejectedValueOnce(new Error('No book is open'));
    const { result } = renderHook(() => useBookLines('fp-1', LINE_COUNT));
    act(() => result.current.requestRange(0, 10));
    await waitFor(() => expect(result.current.error).toBe('No book is open'));
  });
});
