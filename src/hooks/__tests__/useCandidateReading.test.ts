import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCandidateReading } from '../useCandidateReading';
import type { EngineCall } from '../../utils/reader/ReaderEngine';
import type { GlossResult } from '../../utils/reader/WindowedTranslationFill';

const glossCall = () =>
  vi.fn((text: string) =>
    Promise.resolve({ translatedText: `g:${text}`, semanticArrays: null })
  ) as unknown as EngineCall<GlossResult> & ReturnType<typeof vi.fn>;

const setup = (overrides: Partial<Parameters<typeof useCandidateReading>[0]> = {}) => {
  const translateGloss = glossCall();
  const jump = vi.fn();
  const lit = vi.fn();
  const view = renderHook((props) => useCandidateReading(props), {
    initialProps: {
      fingerprint: 'fp',
      translateGloss,
      canTranslate: true,
      dictionaryVersion: 1,
      scrollToLine: jump,
      onLit: lit,
      ...overrides,
    },
  });
  return { translateGloss, jump, lit, view };
};

/** Plays the book scan: `candidate_context` answering with whole lines. */
const fakeContextScan = (answer: () => Promise<unknown>) => {
  const candidateContext = vi.fn(answer);
  global.window.electronAPI = { candidateContext } as unknown as typeof window.electronAPI;
  return candidateContext;
};

describe('useCandidateReading', () => {
  afterEach(() => {
    global.window.electronAPI = undefined as unknown as typeof window.electronAPI;
  });

  test("context lines come back clipped, the book's own ellipsis kept in the source", async () => {
    const long = `${'甲'.repeat(40)}他沉默了……滕青山开口${'乙'.repeat(40)}`;
    fakeContextScan(() =>
      Promise.resolve({
        lines: [
          { line: 3, text: '滕青山来了' },
          { line: 9, text: long },
        ],
        total: 5,
      })
    );
    const { view } = setup();
    const found = await view.result.current.context('滕青山');
    expect(found.total).toBe(5);
    expect(found.lines[0]).toEqual({
      line: 3,
      source: '滕青山来了',
      cutBefore: false,
      cutAfter: false,
    });
    expect(found.lines[1]).toMatchObject({ line: 9, cutBefore: true, cutAfter: true });
    expect(found.lines[1].source).toContain('他沉默了……滕青山');
    expect(long).toContain(found.lines[1].source);
  });

  test('a name is looked up in the book once, across a new engine and new dictionaries', async () => {
    const scan = fakeContextScan(() => Promise.resolve({ lines: [], total: 0 }));
    const { translateGloss, view } = setup();
    await view.result.current.context('滕青山');
    view.rerender({
      fingerprint: 'fp',
      translateGloss,
      canTranslate: false,
      dictionaryVersion: 2,
      scrollToLine: vi.fn(),
      onLit: vi.fn(),
    });
    await view.result.current.context('滕青山');
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith('fp', '滕青山', 3);
  });

  test('a failed lookup is not kept: the next ask scans again', async () => {
    const scan = fakeContextScan(() => Promise.reject(new Error('no book')));
    const { view } = setup();
    await expect(view.result.current.context('滕青山')).rejects.toThrow('no book');
    scan.mockImplementation(() => Promise.resolve({ lines: [], total: 0 }));
    await expect(view.result.current.context('滕青山')).resolves.toEqual({ lines: [], total: 0 });
    expect(scan).toHaveBeenCalledTimes(2);
  });

  test('a gloss is the engine character-only text, asked once per string', async () => {
    const { translateGloss, view } = setup();
    expect(await view.result.current.gloss('滕青山')).toBe('g:滕青山');
    expect(await view.result.current.gloss('滕青山')).toBe('g:滕青山');
    expect(translateGloss).toHaveBeenCalledTimes(1);
  });

  test('a new dictionary version asks again', async () => {
    const { translateGloss, view } = setup();
    await view.result.current.gloss('滕青山');
    view.rerender({
      fingerprint: 'fp',
      translateGloss,
      canTranslate: true,
      dictionaryVersion: 2,
      scrollToLine: vi.fn(),
      onLit: vi.fn(),
    });
    await view.result.current.gloss('滕青山');
    expect(translateGloss).toHaveBeenCalledTimes(2);
  });

  test('with the engine not ready a gloss is refused, not queued', async () => {
    const { translateGloss, view } = setup({ canTranslate: false });
    await expect(view.result.current.gloss('滕青山')).rejects.toThrow();
    expect(translateGloss).not.toHaveBeenCalled();
  });

  test('a tab round trip keeps the cache', async () => {
    const { translateGloss, view } = setup();
    await view.result.current.gloss('滕青山');
    const props = {
      fingerprint: 'fp',
      translateGloss,
      dictionaryVersion: 1,
      scrollToLine: vi.fn(),
      onLit: vi.fn(),
    };
    view.rerender({ ...props, canTranslate: false });
    view.rerender({ ...props, canTranslate: true });
    expect(await view.result.current.gloss('滕青山')).toBe('g:滕青山');
    expect(translateGloss).toHaveBeenCalledTimes(1);
  });

  test('with the engine not ready a cached gloss is answered and a new one refused', async () => {
    const { translateGloss, view } = setup();
    await view.result.current.gloss('滕青山');
    view.rerender({
      fingerprint: 'fp',
      translateGloss,
      canTranslate: false,
      dictionaryVersion: 1,
      scrollToLine: vi.fn(),
      onLit: vi.fn(),
    });
    expect(await view.result.current.gloss('滕青山')).toBe('g:滕青山');
    await expect(view.result.current.gloss('韩立')).rejects.toThrow();
    expect(translateGloss).toHaveBeenCalledTimes(1);
  });

  test('a gloss refused while the engine was down is asked again once it is up', async () => {
    const { translateGloss, jump, lit, view } = setup({ canTranslate: false });
    const refusing = view.result.current;
    await expect(refusing.gloss('滕青山')).rejects.toThrow();
    // Every other prop keeps its identity: only the engine coming up may change the object.
    view.rerender({
      fingerprint: 'fp',
      translateGloss,
      canTranslate: true,
      dictionaryVersion: 1,
      scrollToLine: jump,
      onLit: lit,
    });
    // A new object is what makes a mounted row ask again.
    expect(view.result.current).not.toBe(refusing);
    expect(await view.result.current.gloss('滕青山')).toBe('g:滕青山');
    expect(translateGloss).toHaveBeenCalledTimes(1);
  });

  test('jumping scrolls to the line and lights it', () => {
    const { jump, lit, view } = setup();
    view.result.current.jump(41);
    expect(jump).toHaveBeenCalledWith(41);
    expect(lit).toHaveBeenCalledWith(41);
  });

  test('a gloss and its marked parts share one engine call', async () => {
    const { translateGloss, view } = setup();
    await view.result.current.gloss('滕青山');
    const parts = await view.result.current.glossParts('滕青山', '滕青山');
    expect(parts.map((part) => part.text).join('')).toBe('g:滕青山');
    expect(translateGloss).toHaveBeenCalledTimes(1);
  });
});
