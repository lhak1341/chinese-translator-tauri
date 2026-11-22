import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { translatePreviewOn, useFullTranslationPreview } from '../useFullTranslationPreview';
import type { EngineAccess } from '../../utils/EngineAccess';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useFullTranslationPreview', () => {
  it('returns the trimmed Full Translation of the source', async () => {
    const translate = vi.fn(async () => ' Joss Whedon ');
    const { result } = renderHook(() => useFullTranslationPreview(translate, '乔斯-韦登'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('Joss Whedon'));
    expect(translate).toHaveBeenCalledWith('乔斯-韦登');
  });

  it('asks nothing with no source or no translate', () => {
    const translate = vi.fn(async () => 'x');
    renderHook(() => useFullTranslationPreview(translate, null));
    const { result } = renderHook(() => useFullTranslationPreview(undefined, '乔斯'));
    expect(translate).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('stays null when the call fails', async () => {
    const call = deferred<string>();
    const { result } = renderHook(() => useFullTranslationPreview(() => call.promise, '乔斯'));
    await act(async () => {
      call.reject(new Error('Translation engine is not ready'));
      await call.promise.catch(() => {});
    });
    expect(result.current).toBeNull();
  });

  it('never shows an answer for an earlier source', async () => {
    const calls = new Map<string, ReturnType<typeof deferred<string>>>();
    const translate = (text: string) => {
      const call = deferred<string>();
      calls.set(text, call);
      return call.promise;
    };
    const { result, rerender } = renderHook(
      ({ source }) => useFullTranslationPreview(translate, source),
      { initialProps: { source: '甲' } }
    );
    rerender({ source: '乙' });
    await act(async () => {
      calls.get('甲')!.resolve('first');
      await calls.get('甲')!.promise;
    });
    expect(result.current).toBeNull();
    await act(async () => {
      calls.get('乙')!.resolve('second');
      await calls.get('乙')!.promise;
    });
    expect(result.current).toBe('second');
  });
});

describe('translatePreviewOn', () => {
  it('runs translateWithSegments through the queue as the given owner', async () => {
    const translateWithSegments = vi.fn(async () => ({ translatedText: 'Joss Whedon' }));
    const run = vi.fn((_owner, work) => work({ translateWithSegments }));
    const access = { run, replace: vi.fn() } as unknown as EngineAccess;

    await expect(translatePreviewOn(access, 'reader')('乔斯-韦登')).resolves.toBe('Joss Whedon');
    expect(run).toHaveBeenCalledWith('reader', expect.any(Function));
    expect(translateWithSegments).toHaveBeenCalledWith('乔斯-韦登');
  });

  it('passes a refusal through for the hook to swallow', async () => {
    const access = {
      run: vi.fn(() => Promise.reject(new Error('refused'))),
      replace: vi.fn(),
    } as unknown as EngineAccess;
    await expect(translatePreviewOn(access, 'translator')('乔斯')).rejects.toThrow('refused');
  });
});
