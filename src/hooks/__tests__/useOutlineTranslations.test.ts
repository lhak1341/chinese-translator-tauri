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

  describe('a re-plan mid-batch (stale) keeps the batch already in flight', () => {
    // Two headers that cannot share a batch (BATCH_TARGET_CHARS = 500), so the first is in
    // flight while the second waits.
    const headers: ChapterHeader[] = [
      { line: 0, title: '字'.repeat(500) },
      { line: 1000, title: 'Chapter Two' },
    ];

    function deferredEngine() {
      const pending: Array<{ text: string; resolve: (text: string) => void }> = [];
      const translateBatch = vi.fn(
        (text: string) =>
          new Promise<string>((resolve) => {
            pending.push({ text, resolve });
          })
      );
      const answer = (index: number) =>
        pending[index].resolve(
          pending[index].text
            .split('\n')
            .map((t) => `VN:${t.slice(0, 3)}`)
            .join('\n')
        );
      return { translateBatch, pending, answer };
    }

    it('a priorityLine change caches the landed batch and does not re-request it', async () => {
      const { translateBatch, answer } = deferredEngine();
      const { result, rerender } = renderHook(
        (props: { priorityLine: number }) =>
          useOutlineTranslations({
            headers,
            priorityLine: props.priorityLine,
            translateBatch,
            dictionaryVersion: 0,
            isEnabled: true,
          }),
        { initialProps: { priorityLine: 0 } }
      );

      await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1));
      rerender({ priorityLine: 1000 });
      answer(0);

      await waitFor(() => expect(result.current.getTranslatedTitle(0)).toBe('VN:字字字'));
      // The re-plan asks only for what is neither landed nor already in flight.
      await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(2));
      expect(translateBatch).toHaveBeenLastCalledWith('Chapter Two');
    });

    it('isEnabled turning false lets the in-flight batch land but starts no further batch', async () => {
      const { translateBatch, answer } = deferredEngine();
      const { result, rerender } = renderHook(
        (props: { isEnabled: boolean }) =>
          useOutlineTranslations({
            headers,
            priorityLine: 0,
            translateBatch,
            dictionaryVersion: 0,
            isEnabled: props.isEnabled,
          }),
        { initialProps: { isEnabled: true } }
      );

      await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1));
      rerender({ isEnabled: false });
      answer(0);

      await waitFor(() => expect(result.current.getTranslatedTitle(0)).toBe('VN:字字字'));
      await waitFor(() => expect(result.current.isTranslating).toBe(false));
      expect(translateBatch).toHaveBeenCalledTimes(1);
    });

    it('unmounting mid-batch lets nothing further reach the engine', async () => {
      // A book switch is an unmount (BookReader is keyed by fingerprint), and the engine
      // queue outlives it: any batch the old book sent after this would wait ahead of the
      // new book's own text.
      const { translateBatch, answer } = deferredEngine();
      const { unmount } = renderHook(() =>
        useOutlineTranslations({
          headers,
          priorityLine: 0,
          translateBatch,
          dictionaryVersion: 0,
          isEnabled: true,
        })
      );

      await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1));
      unmount();
      answer(0);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(translateBatch).toHaveBeenCalledTimes(1);
    });
  });

  it('isEnabled: false never calls the engine', async () => {
    const headers: ChapterHeader[] = [{ line: 0, title: 'Chapter One' }];
    const translateBatch = vi.fn();

    renderHook(() =>
      useOutlineTranslations({
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
