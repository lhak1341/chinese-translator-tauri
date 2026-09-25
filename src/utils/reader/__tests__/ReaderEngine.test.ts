import { describe, it, expect, vi } from 'vitest';
import { createReaderEngine } from '../ReaderEngine';
import type { TranslationEngine } from '../../../types/TranslationEngineTypes';

/** A promise the test resolves or rejects by hand, to hold a call in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeEngine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isReady: () => true,
    translateWithSegments: vi.fn(async (text: string) => ({
      translatedText: `T(${text})`,
      semanticArrays: null,
      prebuiltSegments: [],
    })),
    translateWithCharactersOnly: vi.fn(async (text: string) => ({
      translatedText: `G(${text})`,
      semanticArrays: null,
    })),
    ...overrides,
  } as unknown as TranslationEngine & {
    translateWithSegments: ReturnType<typeof vi.fn>;
    translateWithCharactersOnly: ReturnType<typeof vi.fn>;
  };
}

/** Let every already-settled promise continuation run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('createReaderEngine — serialization', () => {
  it('starts a second call only after the first has settled', async () => {
    // `translateWithSegments` resets engine-wide segment state on entry, so a second call
    // starting while the first awaits its result would corrupt it.
    const first = deferred<unknown>();
    const engine = fakeEngine();
    engine.translateWithSegments.mockImplementationOnce(() => first.promise);
    const calls = createReaderEngine(() => engine);

    const chunk = calls.translateChunk('a');
    const gloss = calls.translateGloss('b');
    await settle();

    expect(engine.translateWithSegments).toHaveBeenCalledTimes(1);
    expect(engine.translateWithCharactersOnly).not.toHaveBeenCalled();

    first.resolve({ translatedText: 'A', semanticArrays: null, prebuiltSegments: [] });
    await chunk;
    await gloss;

    expect(engine.translateWithCharactersOnly).toHaveBeenCalledWith('b');
  });

  it('serializes the outline batch with the viewport fill — two loops, one queue', async () => {
    const first = deferred<unknown>();
    const engine = fakeEngine();
    engine.translateWithSegments.mockImplementationOnce(() => first.promise);
    const calls = createReaderEngine(() => engine);

    void calls.translateChunk('a');
    const titles = calls.translateOutlineBatch('第一章');
    await settle();
    expect(engine.translateWithSegments).toHaveBeenCalledTimes(1);

    first.resolve({ translatedText: 'A', semanticArrays: null, prebuiltSegments: [] });
    await titles;
    expect(engine.translateWithSegments).toHaveBeenCalledTimes(2);
  });

  it('does not let a rejected call poison the calls queued behind it', async () => {
    const engine = fakeEngine();
    engine.translateWithSegments.mockRejectedValueOnce(new Error('engine blew up'));
    const calls = createReaderEngine(() => engine);

    const failed = calls.translateChunk('a');
    const next = calls.translateChunk('b');

    await expect(failed).rejects.toThrow('engine blew up');
    await expect(next).resolves.toMatchObject({ translatedText: 'T(b)' });
  });
});

describe('createReaderEngine — readiness', () => {
  it('rejects, rather than throwing, when there is no engine', async () => {
    const calls = createReaderEngine(() => null);
    await expect(calls.translateChunk('a')).rejects.toThrow('Translation engine is not ready');
  });

  it('rejects when the engine is not ready', async () => {
    const calls = createReaderEngine(() => fakeEngine({ isReady: () => false }));
    await expect(calls.translateGloss('a')).rejects.toThrow('Translation engine is not ready');
  });

  it('reads the engine when a call runs, not when it was queued', async () => {
    // A reload replaces the engine while calls wait. Whatever is queued runs on the engine
    // live by then; the fill's own generation check discards a stale result.
    const first = deferred<unknown>();
    const oldEngine = fakeEngine();
    oldEngine.translateWithSegments.mockImplementationOnce(() => first.promise);
    const newEngine = fakeEngine();
    let current: TranslationEngine | null = oldEngine;
    const calls = createReaderEngine(() => current);

    void calls.translateChunk('a');
    const queued = calls.translateChunk('b');
    await settle();
    current = newEngine;
    first.resolve({ translatedText: 'A', semanticArrays: null, prebuiltSegments: [] });
    await queued;

    expect(oldEngine.translateWithSegments).toHaveBeenCalledTimes(1);
    expect(newEngine.translateWithSegments).toHaveBeenCalledWith('b', { progressive: true });
  });
});

describe('createReaderEngine — result mapping', () => {
  it('passes the chunk through the progressive path and keeps what the Reader uses', async () => {
    const segments = [{ start: 0, end: 2, unitIndex: 0 }];
    const engine = fakeEngine();
    engine.translateWithSegments.mockResolvedValueOnce({
      translatedText: 'Xin chào',
      semanticArrays: { original: [], translated: [], metadata: [] },
      prebuiltSegments: segments,
      somethingElse: 'dropped',
    });
    const calls = createReaderEngine(() => engine);

    const result = await calls.translateChunk('你好');

    expect(engine.translateWithSegments).toHaveBeenCalledWith('你好', { progressive: true });
    expect(result).toEqual({
      translatedText: 'Xin chào',
      semanticArrays: { original: [], translated: [], metadata: [] },
      prebuiltSegments: segments,
    });
  });

  it('fills in an empty chunk result rather than passing undefined on', async () => {
    const engine = fakeEngine();
    engine.translateWithSegments.mockResolvedValueOnce(undefined);
    const calls = createReaderEngine(() => engine);

    expect(await calls.translateChunk('a')).toEqual({
      translatedText: '',
      semanticArrays: null,
      prebuiltSegments: [],
    });
  });

  it('keeps the gloss semantic arrays — its clickable runs are built from them', async () => {
    const arrays = { original: ['你'], translated: ['nhĩ'], metadata: [] };
    const engine = fakeEngine();
    engine.translateWithCharactersOnly.mockResolvedValueOnce({
      translatedText: 'nhĩ',
      semanticArrays: arrays,
    });
    const calls = createReaderEngine(() => engine);

    expect(await calls.translateGloss('你')).toEqual({
      translatedText: 'nhĩ',
      semanticArrays: arrays,
    });
  });

  it('gives the outline batch only the translated text', async () => {
    const calls = createReaderEngine(() => fakeEngine());
    expect(await calls.translateOutlineBatch('第一章\n第二章')).toBe('T(第一章\n第二章)');
  });

  it('gives the outline batch an empty string for an empty result', async () => {
    const engine = fakeEngine();
    engine.translateWithSegments.mockResolvedValueOnce(undefined);
    const calls = createReaderEngine(() => engine);
    expect(await calls.translateOutlineBatch('第一章')).toBe('');
  });
});
