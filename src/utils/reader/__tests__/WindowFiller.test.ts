/**
 * The Window Filler's plan lifecycle, driven through `update()` with fake engine calls — no
 * React, no timers. `WindowedTranslationFill.test.ts` covers one plan's chunk loop
 * (`fillPlan`); `useWindowedTranslation.test.ts` covers only the React adapter.
 *
 * Moved here from `useWindowedTranslation.test.ts` (architecture review 2026-09-30, candidate
 * #2), where these cases ran through `renderHook`. The same-day bug of 2026-09-19 is pinned
 * below: `isStale` (any re-plan) and `isAbandoned` (dispose only) are two separate signals,
 * and an ordinary anchor move must not orphan a chunk's gloss.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WindowFiller } from '../WindowFiller';
import type { WindowFillerInputs } from '../WindowFiller';
import { rowAt } from '../PanelRows';
import type { ChunkTranslationResult, GlossResult } from '../WindowedTranslationFill';

vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const chunkResult = (translatedText: string): ChunkTranslationResult => ({
  translatedText,
  semanticArrays: null,
  prebuiltSegments: [],
});

const glossResult = (translatedText: string): GlossResult => ({
  translatedText,
  semanticArrays: null,
});

/** A promise and the function that settles it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

let translateChunk: ReturnType<typeof vi.fn>;
let translateGloss: ReturnType<typeof vi.fn>;
let lines: (string | undefined)[];
const getLine = (i: number): string | undefined => lines[i];

function makeFiller(): WindowFiller {
  return new WindowFiller({ translateChunk, translateGloss });
}

function inputs(overrides: Partial<WindowFillerInputs> = {}): WindowFillerInputs {
  return {
    lineCount: lines.length,
    anchorLine: 0,
    viewportLines: lines.length,
    overscanLines: 0,
    getLine,
    dictionaryVersion: 0,
    isEnabled: true,
    ...overrides,
  };
}

/** The Vietnamese a translation row shows, or `undefined` while it is still stand-in Chinese. */
function translated(filler: WindowFiller, index: number): string | undefined {
  const row = rowAt(filler.getSnapshot().rows, 'translation', index, getLine(index), false);
  return row.isPending ? undefined : row.text;
}

/** Likewise for the character-only gloss. */
function gloss(filler: WindowFiller, index: number): string | undefined {
  const row = rowAt(filler.getSnapshot().rows, 'characterOnly', index, getLine(index), false);
  return row.isPending ? undefined : row.text;
}

const settled = (filler: WindowFiller) =>
  vi.waitFor(() => expect(filler.getSnapshot().isTranslating).toBe(false));

/** Lets every settled promise run its continuations. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  translateChunk = vi.fn(async (text: string) => chunkResult(`T(${text})`));
  translateGloss = vi.fn(async (text: string) => glossResult(`G(${text})`));
});

describe('WindowFiller — planning and filling', () => {
  it('fills nearest-anchor-first, calling translateChunk then translateGloss per chunk before moving to the next', async () => {
    lines = ['你好', '', '再见'];
    const callOrder: string[] = [];
    translateChunk.mockImplementation(async (text: string) => {
      callOrder.push(`chunk:${text}`);
      return chunkResult(`T(${text})`);
    });
    translateGloss.mockImplementation(async (text: string) => {
      callOrder.push(`gloss:${text}`);
      return glossResult(`G(${text})`);
    });
    const filler = makeFiller();

    filler.update(inputs({ anchorLine: 2 }));
    await settled(filler);

    expect(callOrder).toEqual(['chunk:再见', 'gloss:再见', 'chunk:你好', 'gloss:你好']);
    expect(translated(filler, 2)).toBe('T(再见)');
    expect(translated(filler, 0)).toBe('T(你好)');
    expect(gloss(filler, 2)).toBe('G(再见)');
  });

  it('an unfetched neighbor line blocks both paragraphs beside it until the page lands and it is asked again', async () => {
    lines = ['你好在此', undefined, '确认完毕'];
    const filler = makeFiller();

    filler.update(inputs());
    await settled(filler);
    // Both paragraphs touch the unfetched line 1, so neither is planned — no error, no call.
    expect(translateChunk).not.toHaveBeenCalled();

    lines[1] = '';
    filler.update(inputs());
    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(2));
    await settled(filler);
    expect(translated(filler, 0)).toBe('T(你好在此)');
    expect(translated(filler, 2)).toBe('T(确认完毕)');
  });

  it('a dictionaryVersion change invalidates without discarding: stale text stays until its replacement lands', async () => {
    lines = ['你好'];
    translateChunk.mockResolvedValueOnce(chunkResult('Hello'));
    const filler = makeFiller();
    filler.update(inputs());
    await vi.waitFor(() => expect(translated(filler, 0)).toBe('Hello'));

    const second = deferred<ChunkTranslationResult>();
    translateChunk.mockImplementationOnce(() => second.promise);
    filler.update(inputs({ dictionaryVersion: 1 }));

    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(2));
    expect(translated(filler, 0)).toBe('Hello');

    second.resolve(chunkResult('Xin chào'));
    await vi.waitFor(() => expect(translated(filler, 0)).toBe('Xin chào'));
  });

  it('a dictionaryVersion change while disabled still marks the cache stale for the next plan', async () => {
    lines = ['你好'];
    const filler = makeFiller();
    filler.update(inputs());
    await settled(filler);

    filler.update(inputs({ dictionaryVersion: 1, isEnabled: false }));
    filler.update(inputs({ dictionaryVersion: 1 }));
    await settled(filler);

    expect(translateChunk).toHaveBeenCalledTimes(2);
  });

  it('hiding the Reader mid-fill starts no further chunk, clears the indicator, and showing it resumes', async () => {
    lines = ['你好', '', '再见'];
    const first = deferred<ChunkTranslationResult>();
    translateChunk.mockImplementationOnce(() => first.promise);
    const filler = makeFiller();

    filler.update(inputs({ anchorLine: 0 }));
    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(1));

    filler.update(inputs({ anchorLine: 0, isEnabled: false }));
    expect(filler.getSnapshot().isTranslating).toBe(false);

    // The chunk already in flight finishes (its gloss included); the next one never starts.
    first.resolve(chunkResult('Hello'));
    await vi.waitFor(() => expect(translateGloss).toHaveBeenCalledTimes(1));
    await flush();
    expect(translateChunk).toHaveBeenCalledTimes(1);
    expect(translated(filler, 0)).toBe('Hello');
    expect(filler.getSnapshot().isTranslating).toBe(false);

    filler.update(inputs({ anchorLine: 0 }));
    await settled(filler);
    expect(translated(filler, 2)).toBe('T(再见)');
  });

  it('isEnabled: false never calls the engine', async () => {
    lines = ['你好'];
    const filler = makeFiller();

    filler.update(inputs({ isEnabled: false }));
    await flush();

    expect(translateChunk).not.toHaveBeenCalled();
    expect(filler.getSnapshot().isTranslating).toBe(false);
  });

  it('a chunk error is isolated: the rest of the plan still translates', async () => {
    lines = ['你好', '', '再见'];
    translateChunk.mockImplementation(async (text: string) => {
      if (text === '再见') throw new Error('engine exploded');
      return chunkResult(`T(${text})`);
    });
    const filler = makeFiller();

    // Anchored nearest '再见', so it is attempted first and fails.
    filler.update(inputs({ anchorLine: 2 }));
    await settled(filler);

    expect(translated(filler, 2)).toBeUndefined();
    expect(translated(filler, 0)).toBe('T(你好)');
    expect(translateChunk).toHaveBeenCalledTimes(2);
  });

  it('re-projects rows whenever a chunk lands, bumping version', async () => {
    lines = ['你好'];
    const filler = makeFiller();
    const listener = vi.fn();
    filler.subscribe(listener);

    filler.update(inputs());
    await settled(filler);

    // Translated, then glossed.
    expect(filler.getSnapshot().version).toBe(2);
    expect(listener).toHaveBeenCalled();
  });
});

describe('WindowFiller — the two staleness signals', () => {
  it('an ordinary anchor move mid-gloss does not orphan that chunk’s gloss (regression: this exact bug shipped once)', async () => {
    lines = ['你好'];
    const glossCall = deferred<GlossResult>();
    translateChunk.mockResolvedValue(chunkResult('Hello'));
    translateGloss.mockImplementationOnce(() => glossCall.promise);
    const filler = makeFiller();

    filler.update(inputs({ viewportLines: 1 }));
    await vi.waitFor(() => expect(translated(filler, 0)).toBe('Hello'));
    expect(translateGloss).toHaveBeenCalledTimes(1);

    // An ordinary re-plan: the chunk is already fresh, so it starts no new work, while the
    // previous plan's fill is still awaiting the gloss.
    filler.update(inputs({ viewportLines: 1, anchorLine: 1 }));

    glossCall.resolve(glossResult('Xin chào từng chữ'));
    await vi.waitFor(() => expect(gloss(filler, 0)).toBe('Xin chào từng chữ'));
  });

  it('after dispose, the call in flight resolves and lands nowhere', async () => {
    lines = ['你好'];
    const chunkCall = deferred<ChunkTranslationResult>();
    translateChunk.mockImplementationOnce(() => chunkCall.promise);
    const filler = makeFiller();
    const listener = vi.fn();
    filler.subscribe(listener);

    filler.update(inputs());
    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(1));
    filler.dispose();
    listener.mockClear();

    chunkCall.resolve(chunkResult('Hello'));
    await flush();

    expect(translated(filler, 0)).toBeUndefined();
    expect(translateGloss).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores updates after dispose', async () => {
    lines = ['你好'];
    const filler = makeFiller();
    filler.dispose();

    filler.update(inputs());
    await flush();

    expect(translateChunk).not.toHaveBeenCalled();
  });

  it('open after dispose fills again (StrictMode runs the cleanup, then the setup, on one instance)', async () => {
    lines = ['你好'];
    translateChunk.mockResolvedValue(chunkResult('Xin chào'));
    const filler = makeFiller();
    filler.open();
    filler.dispose();
    filler.open();

    filler.update(inputs());

    await vi.waitFor(() => expect(translated(filler, 0)).toBe('Xin chào'));
  });
});

describe('WindowFiller — isTranslating', () => {
  // Two paragraphs far apart, blank lines between, so a one-line viewport plans only the
  // paragraph under the anchor and a middle anchor plans nothing.
  const farApart = (): (string | undefined)[] => {
    const book: (string | undefined)[] = Array.from({ length: 41 }, () => '');
    book[0] = '你好';
    book[40] = '再见';
    return book;
  };

  it('a re-plan that finds nothing missing clears it, even though the abandoned fill never reaches its own end', async () => {
    lines = farApart();
    const chunkCall = deferred<ChunkTranslationResult>();
    translateChunk.mockImplementationOnce(() => chunkCall.promise);
    const filler = makeFiller();

    filler.update(inputs({ viewportLines: 1, anchorLine: 0 }));
    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(1));
    expect(filler.getSnapshot().isTranslating).toBe(true);

    // Scrolled into blank lines: nothing to translate there.
    filler.update(inputs({ viewportLines: 1, anchorLine: 20 }));
    expect(filler.getSnapshot().isTranslating).toBe(false);

    // The older fill finishing does not turn it back on.
    chunkCall.resolve(chunkResult('Hello'));
    await flush();
    await flush();
    expect(filler.getSnapshot().isTranslating).toBe(false);
  });

  it('an older fill ending does not clear it while the newest plan is still filling', async () => {
    lines = farApart();
    const first = deferred<ChunkTranslationResult>();
    const second = deferred<ChunkTranslationResult>();
    translateChunk.mockImplementationOnce(() => first.promise);
    translateChunk.mockImplementationOnce(() => second.promise);
    const filler = makeFiller();

    filler.update(inputs({ viewportLines: 1, anchorLine: 0 }));
    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(1));
    filler.update(inputs({ viewportLines: 1, anchorLine: 40 }));
    await vi.waitFor(() => expect(translateChunk).toHaveBeenCalledTimes(2));

    first.resolve(chunkResult('Hello'));
    await flush();
    await flush();
    expect(filler.getSnapshot().isTranslating).toBe(true);

    second.resolve(chunkResult('Goodbye'));
    await settled(filler);
    expect(translated(filler, 40)).toBe('Goodbye');
  });
});
