import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWindowedTranslation } from '../useWindowedTranslation';
import type { ChunkTranslationResult, GlossResult } from '../useWindowedTranslation';

/**
 * Regression suite for `useWindowedTranslation`, now that its fill loop lives in
 * `fillPlan` (`src/utils/reader/WindowedTranslationFill.ts`) as a plain async generator —
 * see architecture review candidate #1 grilling, 2026-09-19. This file pins the hook's own
 * wiring: ordering, the two documented silent-failure modes, isEnabled gating, and unmount
 * safety. `WindowedTranslationFill.test.ts` covers the fill loop itself (cancellation,
 * cache read/write protocol, per-chunk error isolation) without React.
 *
 * The extraction changed two behaviors on purpose, both reflected below:
 * - a chunk error no longer aborts the rest of the plan — it is logged and skipped, the
 *   loop continues. There is no more `error` field on the hook's return value.
 * - a book switch mid-fill can no longer let a stale chunk from the old book land in the
 *   new book's cache — `isAbandoned()` (book-identity-scoped) is checked after every
 *   `await`, not only before.
 *
 * A same-day bug, fixed later: the first attempt at the book-switch fix used the same
 * signal (`generationRef`, bumped on every ordinary re-plan) for both the loop-top check
 * and the post-`await` check. That abandoned a chunk's own gloss on an ordinary anchor
 * move, and since the chunk's translation was already cached as `isFresh`, its gloss was
 * never retried — the reference panel showed Chinese for that chunk forever, no error
 * logged. `isStale` (ordinary re-plan) and `isAbandoned` (book switch/unmount only) are
 * now two separate signals for exactly this reason — see the last test below and
 * `WindowedTranslationFill.ts`'s doc comment.
 */

type Windowed = ReturnType<typeof useWindowedTranslation>;

/** The Vietnamese a translation row shows, or `undefined` while it is still stand-in Chinese. */
const translated = (w: Windowed, index: number): string | undefined => {
  const row = w.getRow.translation(index);
  return row.isPending ? undefined : row.text;
};

/** Likewise for the character-only gloss. */
const gloss = (w: Windowed, index: number): string | undefined => {
  const row = w.getRow.characterOnly(index);
  return row.isPending ? undefined : row.text;
};

const chunkResult = (translatedText: string): ChunkTranslationResult => ({
  translatedText,
  semanticArrays: null,
  prebuiltSegments: [],
});

const glossResult = (translatedText: string): GlossResult => ({
  translatedText,
  semanticArrays: null,
});

describe('useWindowedTranslation (characterization)', () => {
  let translateChunk: ReturnType<typeof vi.fn>;
  let translateGloss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    translateChunk = vi.fn();
    translateGloss = vi.fn();
  });

  it('fills nearest-anchor-first, calling translateChunk then translateGloss per chunk before moving to the next', async () => {
    const lines = ['你好', '', '再见'];
    const getLine = (i: number): string | undefined => lines[i];
    const callOrder: string[] = [];
    translateChunk.mockImplementation(async (text: string) => {
      callOrder.push(`chunk:${text}`);
      return chunkResult(`T(${text})`);
    });
    translateGloss.mockImplementation(async (text: string) => {
      callOrder.push(`gloss:${text}`);
      return glossResult(`G(${text})`);
    });

    const { result } = renderHook(() =>
      useWindowedTranslation({
        fingerprint: 'book-1',
        lineCount: lines.length,
        anchorLine: 2,
        viewportLines: 3,
        overscanLines: 0,
        linesVersion: 0,
        getLine,
        isBlankAt: (i: number) => getLine(i)?.trim() === '',
        translateChunk,
        translateGloss,
        dictionaryVersion: 0,
        isEnabled: true,
      })
    );

    await waitFor(() => expect(result.current.isTranslating).toBe(false));

    expect(callOrder).toEqual(['chunk:再见', 'gloss:再见', 'chunk:你好', 'gloss:你好']);
    expect(translated(result.current, 2)).toBe('T(再见)');
    expect(translated(result.current, 0)).toBe('T(你好)');
    expect(gloss(result.current, 2)).toBe('G(再见)');
  });

  it('an unfetched neighbor line blocks both paragraphs beside it until linesVersion bumps (silent-failure mode #1)', async () => {
    const lines: (string | undefined)[] = ['你好在此', undefined, '确认完毕'];
    const getLine = (i: number): string | undefined => lines[i];
    translateChunk.mockImplementation(async (text: string) => chunkResult(`T(${text})`));
    translateGloss.mockImplementation(async (text: string) => glossResult(`G(${text})`));

    const { result, rerender } = renderHook(
      (props: { linesVersion: number }) =>
        useWindowedTranslation({
          fingerprint: 'book-1',
          lineCount: lines.length,
          anchorLine: 0,
          viewportLines: 3,
          overscanLines: 0,
          linesVersion: props.linesVersion,
          getLine,
          isBlankAt: (i: number) => getLine(i)?.trim() === '',
          translateChunk,
          translateGloss,
          dictionaryVersion: 0,
          isEnabled: true,
        }),
      { initialProps: { linesVersion: 0 } }
    );

    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    // Both paragraphs touch the unfetched line 1, so neither is planned — no error, no call.
    expect(translateChunk).not.toHaveBeenCalled();
    expect(translated(result.current, 0)).toBeUndefined();
    expect(translated(result.current, 2)).toBeUndefined();

    // The page lands: line 1 is now known-blank. Nothing else changed.
    lines[1] = '';
    rerender({ linesVersion: 1 });

    await waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    expect(translated(result.current, 0)).toBe('T(你好在此)');
    expect(translated(result.current, 2)).toBe('T(确认完毕)');
  });

  it('a dictionaryVersion bump invalidates without discarding: stale text stays on screen until its replacement lands (silent-failure mode #2)', async () => {
    const lines = ['你好'];
    const getLine = (i: number): string | undefined => lines[i];
    translateChunk.mockResolvedValueOnce(chunkResult('Hello'));
    translateGloss.mockResolvedValue(glossResult('gloss'));

    const { result, rerender } = renderHook(
      (props: { dictionaryVersion: number }) =>
        useWindowedTranslation({
          fingerprint: 'book-1',
          lineCount: lines.length,
          anchorLine: 0,
          viewportLines: 1,
          overscanLines: 0,
          linesVersion: 0,
          getLine,
          isBlankAt: (i: number) => getLine(i)?.trim() === '',
          translateChunk,
          translateGloss,
          dictionaryVersion: props.dictionaryVersion,
          isEnabled: true,
        }),
      { initialProps: { dictionaryVersion: 0 } }
    );

    await waitFor(() => expect(translated(result.current, 0)).toBe('Hello'));

    let resolveSecond: (r: ChunkTranslationResult) => void = () => {};
    translateChunk.mockImplementationOnce(
      () =>
        new Promise<ChunkTranslationResult>((resolve) => {
          resolveSecond = resolve;
        })
    );
    rerender({ dictionaryVersion: 1 });

    await waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(2));
    // Reload is in flight, but the old translation is still shown — not reverted to Chinese.
    expect(translated(result.current, 0)).toBe('Hello');

    act(() => resolveSecond(chunkResult('Xin chào')));
    await waitFor(() => expect(translated(result.current, 0)).toBe('Xin chào'));
  });

  it('isEnabled: false never calls the engine', async () => {
    const lines = ['你好'];
    const getLine = (i: number): string | undefined => lines[i];

    renderHook(() =>
      useWindowedTranslation({
        fingerprint: 'book-1',
        lineCount: lines.length,
        anchorLine: 0,
        viewportLines: 1,
        overscanLines: 0,
        linesVersion: 0,
        getLine,
        isBlankAt: (i: number) => getLine(i)?.trim() === '',
        translateChunk,
        translateGloss,
        dictionaryVersion: 0,
        isEnabled: false,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(translateChunk).not.toHaveBeenCalled();
  });

  it('unmounting mid-fill does not throw when the in-flight call later resolves', async () => {
    const lines = ['你好'];
    const getLine = (i: number): string | undefined => lines[i];
    let resolveChunk: (r: ChunkTranslationResult) => void = () => {};
    translateChunk.mockImplementationOnce(
      () =>
        new Promise<ChunkTranslationResult>((resolve) => {
          resolveChunk = resolve;
        })
    );

    const { unmount } = renderHook(() =>
      useWindowedTranslation({
        fingerprint: 'book-1',
        lineCount: lines.length,
        anchorLine: 0,
        viewportLines: 1,
        overscanLines: 0,
        linesVersion: 0,
        getLine,
        isBlankAt: (i: number) => getLine(i)?.trim() === '',
        translateChunk,
        translateGloss,
        dictionaryVersion: 0,
        isEnabled: true,
      })
    );

    await waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(1));
    unmount();

    expect(() => resolveChunk(chunkResult('Hello'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('an ordinary anchor move mid-gloss does not orphan that chunk’s gloss (regression: this exact bug shipped once)', async () => {
    const lines = ['你好'];
    const getLine = (i: number): string | undefined => lines[i];
    translateChunk.mockResolvedValue(chunkResult('Hello'));
    let resolveGloss: (r: GlossResult) => void = () => {};
    translateGloss.mockImplementationOnce(
      () =>
        new Promise<GlossResult>((resolve) => {
          resolveGloss = resolve;
        })
    );

    const { result, rerender } = renderHook(
      (props: { anchorLine: number }) =>
        useWindowedTranslation({
          fingerprint: 'book-1',
          lineCount: lines.length,
          anchorLine: props.anchorLine,
          viewportLines: 1,
          overscanLines: 0,
          linesVersion: 0,
          getLine,
          isBlankAt: (i: number) => getLine(i)?.trim() === '',
          translateChunk,
          translateGloss,
          dictionaryVersion: 0,
          isEnabled: true,
        }),
      { initialProps: { anchorLine: 0 } }
    );

    // The translation lands; the gloss call is now in flight (controlled, not yet resolved).
    await waitFor(() => expect(translated(result.current, 0)).toBe('Hello'));
    expect(translateGloss).toHaveBeenCalledTimes(1);

    // An ordinary re-plan fires — the anchor moved, same as an unremarkable scroll tick.
    // The chunk is already `isFresh` (translated), so this re-plan starts no new work; the
    // *previous* run's fillPlan generator is still awaiting `translateGloss` for chunk 0.
    // (`lineCount` is 1, so this doesn't change which chunk is planned — only that the
    // effect's own dependency array sees a different `anchorLine` and reruns.)
    rerender({ anchorLine: 1 });

    // The in-flight gloss call now resolves. Before the fix, the anchor move above would
    // have abandoned this chunk's gloss (via the same signal that starts new chunks) —
    // once `isFresh`, nothing would ever retry it, and this assertion would stay `undefined`
    // forever.
    act(() => resolveGloss(glossResult('Xin chào từng chữ')));
    await waitFor(() => expect(gloss(result.current, 0)).toBe('Xin chào từng chữ'));
  });

  it('a chunk error is isolated: the rest of the plan still translates, no `error` field exists', async () => {
    const lines = ['你好', '', '再见'];
    const getLine = (i: number): string | undefined => lines[i];
    translateChunk.mockImplementation(async (text: string) => {
      if (text === '再见') throw new Error('engine exploded');
      return chunkResult(`T(${text})`);
    });
    translateGloss.mockResolvedValue(glossResult('gloss'));

    const { result } = renderHook(() =>
      useWindowedTranslation({
        fingerprint: 'book-1',
        lineCount: lines.length,
        // Anchor nearest line 2 ('再见'), so it is attempted first and fails — its failure
        // must not block line 0 ('你好') from still being translated.
        anchorLine: 2,
        viewportLines: 3,
        overscanLines: 0,
        linesVersion: 0,
        getLine,
        isBlankAt: (i: number) => getLine(i)?.trim() === '',
        translateChunk,
        translateGloss,
        dictionaryVersion: 0,
        isEnabled: true,
      })
    );

    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    expect(result.current).not.toHaveProperty('error');
    expect(translated(result.current, 2)).toBeUndefined();
    // The rest of the plan still ran despite the failure.
    expect(translated(result.current, 0)).toBe('T(你好)');
    expect(translateChunk).toHaveBeenCalledTimes(2);
  });
});

/**
 * What a panel row is — the rules `BookReader` used to apply by hand to five getters, with
 * no test of its own.
 */
describe('useWindowedTranslation — panel rows', () => {
  function render(lines: (string | undefined)[], options: { isEnabled?: boolean } = {}) {
    const getLine = (i: number): string | undefined => lines[i];
    const translateChunk = vi.fn(async (text: string) => chunkResult(`T(${text})`));
    const translateGloss = vi.fn(async (text: string) => glossResult(`G(${text})`));
    return renderHook(
      (props: { linesVersion: number }) =>
        useWindowedTranslation({
          fingerprint: 'book-1',
          lineCount: lines.length,
          anchorLine: 0,
          viewportLines: lines.length,
          overscanLines: 0,
          linesVersion: props.linesVersion,
          getLine,
          isBlankAt: (i: number) => getLine(i)?.trim() === '',
          translateChunk,
          translateGloss,
          dictionaryVersion: 0,
          isEnabled: options.isEnabled ?? true,
        }),
      { initialProps: { linesVersion: 0 } }
    );
  }

  it('shows a Vietnamese row its Chinese, dimmed and without runs, until it lands', async () => {
    const { result } = render(['你好'], { isEnabled: false });

    for (const row of [
      result.current.getRow.translation(0),
      result.current.getRow.characterOnly(0),
    ]) {
      expect(row).toMatchObject({ text: '你好', isPending: true, lang: 'zh', isBlank: false });
      // Runs describe the Vietnamese the row will become, not the stand-in.
      expect(row.segments).toBeUndefined();
    }
  });

  it('shows the Vietnamese once the chunk lands', async () => {
    const { result } = render(['你好']);

    await waitFor(() => expect(result.current.getRow.characterOnly(0).isPending).toBe(false));
    expect(result.current.getRow.translation(0)).toMatchObject({
      text: 'T(你好)',
      isPending: false,
      lang: 'vi',
    });
    expect(result.current.getRow.characterOnly(0)).toMatchObject({ text: 'G(你好)', lang: 'vi' });
  });

  it('keeps the original row pending only on its own page, never on translation', () => {
    const { result } = render(['你好', undefined], { isEnabled: false });

    expect(result.current.getRow.original(0)).toMatchObject({
      text: '你好',
      isPending: false,
      lang: 'zh',
    });
    expect(result.current.getRow.original(1)).toMatchObject({ text: undefined, isPending: true });
  });

  it('fills the rest of an original line no run covers, so the runs still join to the line', async () => {
    const lines = ['你好'];
    const getLine = (i: number): string | undefined => lines[i];
    // A unit for 你 only: 好 is covered by nothing.
    const translateChunk = vi.fn(async () => ({
      translatedText: 'Chào',
      semanticArrays: {
        original: ['你'],
        translated: ['Chào'],
        metadata: [{ tokenIndex: 0, originalStart: 0, originalEnd: 1 }],
      },
      prebuiltSegments: [],
    })) as unknown as Parameters<typeof useWindowedTranslation>[0]['translateChunk'];
    const { result } = renderHook(() =>
      useWindowedTranslation({
        fingerprint: 'book-1',
        lineCount: 1,
        anchorLine: 0,
        viewportLines: 1,
        overscanLines: 0,
        linesVersion: 0,
        getLine,
        isBlankAt: (i: number) => getLine(i)?.trim() === '',
        translateChunk,
        translateGloss: vi.fn(async () => glossResult('g')) as never,
        dictionaryVersion: 0,
        isEnabled: true,
      })
    );

    await waitFor(() => expect(result.current.getRow.original(0).segments).toBeDefined());
    const segments = result.current.getRow.original(0).segments ?? [];
    expect(segments.map((segment) => segment.text).join('')).toBe('你好');
  });

  it('collapses a blank source line in all three panels', () => {
    const { result } = render(['你好', '', '再见'], { isEnabled: false });

    expect(result.current.getRow.translation(1).isBlank).toBe(true);
    expect(result.current.getRow.original(1).isBlank).toBe(true);
    expect(result.current.getRow.characterOnly(1).isBlank).toBe(true);
    // An unfetched line is not blank: it keeps its height until its page lands.
    expect(
      render([undefined], { isEnabled: false }).result.current.getRow.original(0).isBlank
    ).toBe(false);
  });

  it('moves contentVersion when a page lands and when a chunk lands', async () => {
    const { result, rerender } = render(['你好']);
    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    const afterChunk = result.current.contentVersion;
    expect(afterChunk).toBeGreaterThan(0);

    rerender({ linesVersion: 1 });

    expect(result.current.contentVersion).not.toBe(afterChunk);
  });
});
