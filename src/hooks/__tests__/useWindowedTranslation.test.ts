import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWindowedTranslation } from '../useWindowedTranslation';
import type { ChunkTranslationResult, GlossResult } from '../useWindowedTranslation';
import type { EngineCall } from '../../utils/reader/ReaderEngine';

/**
 * The React adapter over the Window Filler (`src/utils/reader/WindowFiller.ts`): that inputs
 * reach it, that its rows reach the panels, and that unmount disposes it. The fill's own
 * rules — ordering, the two staleness signals, invalidation, `isTranslating` — are tested
 * once, in `WindowFiller.test.ts`, without `renderHook` (architecture review 2026-09-30,
 * candidate #2).
 */

const chunkResult = (translatedText: string): ChunkTranslationResult => ({
  translatedText,
  semanticArrays: null,
  prebuiltSegments: [],
});

const glossResult = (translatedText: string): GlossResult => ({
  translatedText,
  semanticArrays: null,
});

function render(
  lines: (string | undefined)[],
  chunkImpl = async (text: string): Promise<ChunkTranslationResult> => chunkResult(`T(${text})`)
) {
  const getLine = (i: number): string | undefined => lines[i];
  const isBlankAt = (i: number): boolean => getLine(i)?.trim() === '';
  const translateChunk = vi.fn(chunkImpl);
  const translateGloss = vi.fn(async (text: string) => glossResult(`G(${text})`));
  const hook = renderHook(
    (props: { linesVersion: number; anchorLine: number }) =>
      useWindowedTranslation({
        lineCount: lines.length,
        anchorLine: props.anchorLine,
        viewportLines: lines.length,
        overscanLines: 0,
        linesVersion: props.linesVersion,
        getLine,
        isBlankAt,
        translateChunk: translateChunk as unknown as EngineCall<ChunkTranslationResult>,
        translateGloss: translateGloss as unknown as EngineCall<GlossResult>,
        dictionaryVersion: 0,
        isEnabled: true,
      }),
    { initialProps: { linesVersion: 0, anchorLine: 0 } }
  );
  return { ...hook, translateChunk, lines };
}

describe('useWindowedTranslation — the adapter', () => {
  it('hands the filler’s rows to the panels, through getters that keep their identity', async () => {
    const { result } = render(['你好']);
    const getters = result.current.getRow;

    await waitFor(() => expect(result.current.isTranslating).toBe(false));

    expect(result.current.getRow).toBe(getters);
    expect(result.current.getRow.translation(0).text).toBe('T(你好)');
    expect(result.current.getRow.characterOnly(0).text).toBe('G(你好)');
  });

  it('moves contentVersion when a page lands and when a chunk lands', async () => {
    const { result, rerender } = render(['你好']);
    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    const afterChunk = result.current.contentVersion;
    expect(afterChunk).toBeGreaterThan(0);

    rerender({ linesVersion: 1, anchorLine: 0 });

    expect(result.current.contentVersion).not.toBe(afterChunk);
  });

  it('a linesVersion bump asks the filler again, so a plan blocked on an unfetched line re-runs', async () => {
    const { result, rerender, translateChunk, lines } = render(['你好在此', undefined, '确认完毕']);
    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    expect(translateChunk).not.toHaveBeenCalled();

    lines[1] = '';
    rerender({ linesVersion: 1, anchorLine: 0 });

    await waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(2));
  });

  it('unmounting disposes the filler: the call in flight resolves and lands nowhere', async () => {
    let resolveChunk: (r: ChunkTranslationResult) => void = () => {};
    const { unmount, translateChunk } = render(
      ['你好'],
      () => new Promise<ChunkTranslationResult>((resolve) => (resolveChunk = resolve))
    );
    await waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(1));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    unmount();

    resolveChunk(chunkResult('Hello'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // No state update on an unmounted component, and no gloss call for a disposed filler.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
