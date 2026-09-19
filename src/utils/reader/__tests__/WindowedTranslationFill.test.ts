import { describe, expect, it, vi } from 'vitest';
import { fillPlan } from '../WindowedTranslationFill';
import type { ChunkTranslationResult, GlossResult, FillEvent } from '../WindowedTranslationFill';
import { TranslationChunkCache } from '../TranslationChunkCache';
import type { ChunkPlan } from '../TranslationWindow';

/** A single-line chunk spanning the whole of `line`'s text, for `chunkText` to read back. */
function chunkPlan(lineIndex: number, line: string): ChunkPlan {
  return {
    key: `${lineIndex}:0-${lineIndex}:${line.length}`,
    startLine: lineIndex,
    startChar: 0,
    endLine: lineIndex,
    endChar: line.length,
    charCount: line.length,
  };
}

const chunkResult = (translatedText: string): ChunkTranslationResult => ({
  translatedText,
  semanticArrays: null,
  prebuiltSegments: [],
});

const glossResult = (translatedText: string): GlossResult => ({
  translatedText,
  semanticArrays: null,
});

const notStale = (): boolean => false;
const notAbandoned = (): boolean => false;

async function collect(gen: AsyncGenerator<FillEvent>): Promise<FillEvent[]> {
  const events: FillEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe('fillPlan', () => {
  it('translates each chunk then glosses it, in plan order, before moving to the next', async () => {
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, '你好'), chunkPlan(2, '再见')];
    const getLine = (i: number): string | undefined => ['你好', '', '再见'][i];
    const callOrder: string[] = [];
    const translateChunk = vi.fn(async (text: string) => {
      callOrder.push(`chunk:${text}`);
      return chunkResult(`T(${text})`);
    });
    const translateGloss = vi.fn(async (text: string) => {
      callOrder.push(`gloss:${text}`);
      return glossResult(`G(${text})`);
    });

    const events = await collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, notStale, notAbandoned)
    );

    expect(callOrder).toEqual(['chunk:你好', 'gloss:你好', 'chunk:再见', 'gloss:再见']);
    expect(events.map((e) => e.type)).toEqual(['translated', 'glossed', 'translated', 'glossed']);
    expect(cache.get(plan[0].key)?.translatedText).toBe('T(你好)');
    expect(cache.get(plan[0].key)?.characterOnlyText).toBe('G(你好)');
  });

  it('skips a blank chunk without calling the engine', async () => {
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, '   ')];
    const getLine = (): string | undefined => '   ';
    const translateChunk = vi.fn();
    const translateGloss = vi.fn();

    const events = await collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, notStale, notAbandoned)
    );

    expect(events).toEqual([]);
    expect(translateChunk).not.toHaveBeenCalled();
  });

  it('a chunk that throws is yielded as skipped, and the loop continues to the next chunk', async () => {
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, 'bad'), chunkPlan(2, 'good')];
    const getLine = (i: number): string | undefined => ['bad', '', 'good'][i];
    const cause = new Error('engine exploded');
    const translateChunk = vi.fn(async (text: string) => {
      if (text === 'bad') throw cause;
      return chunkResult(`T(${text})`);
    });
    const translateGloss = vi.fn(async (text: string) => glossResult(`G(${text})`));

    const events = await collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, notStale, notAbandoned)
    );

    expect(events).toEqual([
      { type: 'skipped', chunk: plan[0], cause },
      { type: 'translated', chunk: plan[1] },
      { type: 'glossed', chunk: plan[1] },
    ]);
    expect(cache.get(plan[0].key)).toBeUndefined();
    expect(cache.get(plan[1].key)?.translatedText).toBe('T(good)');
  });

  it('stops immediately when isStale() is already true, calling the engine for nothing', async () => {
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, '你好')];
    const getLine = (): string | undefined => '你好';
    const translateChunk = vi.fn();
    const translateGloss = vi.fn();

    const events = await collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, () => true, notAbandoned)
    );

    expect(events).toEqual([]);
    expect(translateChunk).not.toHaveBeenCalled();
  });

  it('an ordinary re-plan (isStale) does NOT abandon a chunk already in flight — its gloss still completes', async () => {
    // Regression test: a chunk's translateChunk landing marks it `isFresh` in the cache, so
    // if its own gloss call were abandoned by the same signal that starts new chunks,
    // no future plan would ever retry it — the reference panel would show Chinese for
    // that chunk forever, no error logged. `isStale` going true here must NOT stop this
    // chunk's own two-call sequence once started; only `isAbandoned` may.
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, '你好')];
    const getLine = (): string | undefined => '你好';
    const translateChunk = vi.fn(async () => chunkResult('Hello'));
    const translateGloss = vi.fn(async () => glossResult('gloss'));

    // Goes stale (an ordinary re-plan — anchor moved) the instant after the loop's
    // first isStale() check passes, simulating a re-plan firing while this chunk's own
    // translateChunk/translateGloss calls are still in flight.
    let calls = 0;
    const isStale = (): boolean => {
      calls += 1;
      return calls > 1;
    };

    const events = await collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, isStale, notAbandoned)
    );

    expect(events).toEqual([
      { type: 'translated', chunk: plan[0] },
      { type: 'glossed', chunk: plan[0] },
    ]);
    expect(cache.get(plan[0].key)?.translatedText).toBe('Hello');
    expect(cache.get(plan[0].key)?.characterOnlyText).toBe('gloss');
  });

  it('going abandoned between the gloss landing and being merged drops the gloss, keeps the translation', async () => {
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, '你好')];
    const getLine = (): string | undefined => '你好';
    const translateChunk = vi.fn(async () => chunkResult('Hello'));
    const translateGloss = vi.fn(async () => glossResult('gloss'));
    // isAbandoned() is called twice per chunk in the non-abandoned path: after
    // translateChunk, after translateGloss. Stay fresh for the first so the translation
    // writes and yields, then go abandoned right before the gloss is merged.
    let calls = 0;
    const isAbandoned = (): boolean => {
      calls += 1;
      return calls > 1;
    };

    const events = await collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, notStale, isAbandoned)
    );

    expect(events).toEqual([{ type: 'translated', chunk: plan[0] }]);
    expect(translateGloss).toHaveBeenCalledTimes(1);
    // The translation is cached and stays cached; the gloss was fetched but never merged.
    expect(cache.get(plan[0].key)?.translatedText).toBe('Hello');
    expect(cache.get(plan[0].key)?.characterOnlyText).toBeNull();
  });

  it('a book switch mid-await no longer lets a stale chunk land (regression for the fixed 4th silent-failure mode)', async () => {
    const cache = new TranslationChunkCache();
    const plan = [chunkPlan(0, '你好')];
    const getLine = (): string | undefined => '你好';
    let resolveChunk: (r: ChunkTranslationResult) => void = () => {};
    const translateChunk = vi.fn(
      () =>
        new Promise<ChunkTranslationResult>((resolve) => {
          resolveChunk = resolve;
        })
    );
    const translateGloss = vi.fn(async () => glossResult('gloss'));

    // Simulates the book-change effect bumping the book-identity signal independently of
    // this fill's own effect — the exact race that used to slip through when only
    // `cache.version` (not book identity) was re-checked after the await.
    let switchedBooks = false;
    const isAbandoned = (): boolean => switchedBooks;

    const genPromise = collect(
      fillPlan(cache, plan, getLine, { translateChunk, translateGloss }, notStale, isAbandoned)
    );
    await Promise.resolve(); // let the loop reach its first await
    switchedBooks = true;
    resolveChunk(chunkResult('from the old book'));

    const events = await genPromise;
    expect(events).toEqual([]);
    expect(cache.get(plan[0].key)).toBeUndefined();
  });
});
