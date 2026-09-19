import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOutlineTranslations } from '../useOutlineTranslations';
import type { ChapterHeader } from '../../types/ReaderTypes';

describe('useOutlineTranslations', () => {
  it('translates headers nearest priorityLine first, one batch call, split back into titles', async () => {
    const headers: ChapterHeader[] = [
      { line: 0, title: 'Chapter One' },
      { line: 100, title: 'Chapter Two' },
    ];
    const translateBatch = vi.fn(async (text: string) =>
      text
        .split('\n')
        .map((t) => `VN:${t}`)
        .join('\n')
    );

    const { result } = renderHook(() =>
      useOutlineTranslations({
        fingerprint: 'book-1',
        headers,
        priorityLine: 100,
        translateBatch,
        dictionaryVersion: 0,
        isEnabled: true,
      })
    );

    await waitFor(() => expect(result.current.isTranslating).toBe(false));

    expect(translateBatch).toHaveBeenCalledTimes(1);
    // Nearest priorityLine (100) is ordered first within the one packed batch.
    expect(translateBatch).toHaveBeenCalledWith('Chapter Two\nChapter One');
    expect(result.current.getTranslatedTitle(100)).toBe('VN:Chapter Two');
    expect(result.current.getTranslatedTitle(0)).toBe('VN:Chapter One');
  });

  it('a dictionaryVersion bump invalidates without discarding: the stale title stays until its replacement lands', async () => {
    const headers: ChapterHeader[] = [{ line: 0, title: 'Chapter One' }];
    const translateBatch = vi.fn().mockResolvedValueOnce('Xin chao');

    const { result, rerender } = renderHook(
      (props: { dictionaryVersion: number }) =>
        useOutlineTranslations({
          fingerprint: 'book-1',
          headers,
          priorityLine: 0,
          translateBatch,
          dictionaryVersion: props.dictionaryVersion,
          isEnabled: true,
        }),
      { initialProps: { dictionaryVersion: 0 } }
    );

    await waitFor(() => expect(result.current.getTranslatedTitle(0)).toBe('Xin chao'));

    let resolveSecond: (text: string) => void = () => {};
    translateBatch.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSecond = resolve;
        })
    );
    rerender({ dictionaryVersion: 1 });

    await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(2));
    expect(result.current.getTranslatedTitle(0)).toBe('Xin chao');

    resolveSecond('Chào lại');
    await waitFor(() => expect(result.current.getTranslatedTitle(0)).toBe('Chào lại'));
  });

  it('a different fingerprint clears titles that belong to the other book', async () => {
    const headers: ChapterHeader[] = [{ line: 0, title: 'Chapter One' }];
    const translateBatch = vi.fn().mockResolvedValue('Xin chao');

    const { result, rerender } = renderHook(
      (props: { fingerprint: string }) =>
        useOutlineTranslations({
          fingerprint: props.fingerprint,
          headers,
          priorityLine: 0,
          translateBatch,
          dictionaryVersion: 0,
          isEnabled: true,
        }),
      { initialProps: { fingerprint: 'book-1' } }
    );

    await waitFor(() => expect(result.current.getTranslatedTitle(0)).toBe('Xin chao'));

    rerender({ fingerprint: 'book-2' });
    expect(result.current.getTranslatedTitle(0)).toBeUndefined();
  });

  it('a failed batch is isolated: the rest of the outline still translates', async () => {
    const headers: ChapterHeader[] = [
      { line: 0, title: '字'.repeat(500) }, // forces its own batch (BATCH_TARGET_CHARS = 500)
      { line: 1, title: 'Chapter Two' },
    ];
    const translateBatch = vi.fn(async (text: string) => {
      if (text.startsWith('字')) throw new Error('engine exploded');
      return text
        .split('\n')
        .map((t) => `VN:${t}`)
        .join('\n');
    });

    const { result } = renderHook(() =>
      useOutlineTranslations({
        fingerprint: 'book-1',
        headers,
        priorityLine: 0,
        translateBatch,
        dictionaryVersion: 0,
        isEnabled: true,
      })
    );

    await waitFor(() => expect(result.current.isTranslating).toBe(false));

    expect(translateBatch).toHaveBeenCalledTimes(2);
    expect(result.current.getTranslatedTitle(0)).toBeUndefined();
    expect(result.current.getTranslatedTitle(1)).toBe('VN:Chapter Two');
  });

  it('isEnabled: false never calls the engine', async () => {
    const headers: ChapterHeader[] = [{ line: 0, title: 'Chapter One' }];
    const translateBatch = vi.fn();

    renderHook(() =>
      useOutlineTranslations({
        fingerprint: 'book-1',
        headers,
        priorityLine: 0,
        translateBatch,
        dictionaryVersion: 0,
        isEnabled: false,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(translateBatch).not.toHaveBeenCalled();
  });
});
