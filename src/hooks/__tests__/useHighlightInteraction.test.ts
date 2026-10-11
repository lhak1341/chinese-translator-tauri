import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useHighlightInteraction } from '../useHighlightInteraction';
import { HIGHLIGHT_SCROLL_DELAY_MS } from '../../utils/highlighting';
import type { SemanticArrays } from '../../utils/highlighting';
import { logger } from '../../utils/logger';
import { makeMeta } from '../../test/makeMeta';

// Real resolveHighlights and real findCharacterOnlyMatch: the behaviour under test is how a click,
// the lit unit, the Character Only mapping and the scrolls fit together.

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Stable fixtures — a new object per render is a new arrays reference, which clears the highlight.
const arrays = (original: string[]): SemanticArrays => ({
  original,
  translated: original.map((_, i) => `tr${i}`),
  metadata: original.map((_, i) => makeMeta({ source: 'characters', tokenIndex: i })),
});

// Original units are variable-length; Character Only units are one character each.
const SEMANTIC = arrays(['你', '好吗', '世']);
const CHAR_ONLY = arrays(['你', '好', '吗', '世']);

interface Panel {
  ref: RefObject<HTMLElement>;
  scrolled: (unitIndex: number) => number;
}

// jsdom has no scrollIntoView; give each unit its own spy so a test sees which one scrolled.
function makePanel(unitCount: number): Panel {
  const container = document.createElement('div');
  const spies: ReturnType<typeof vi.fn>[] = [];
  for (let i = 0; i < unitCount; i++) {
    const unit = document.createElement('span');
    unit.setAttribute('data-unit-index', String(i));
    const spy = vi.fn();
    unit.scrollIntoView = spy;
    spies.push(spy);
    container.appendChild(unit);
  }
  return { ref: { current: container }, scrolled: (i) => spies[i].mock.calls.length };
}

function setup(
  overrides: {
    semanticArrays?: SemanticArrays | null;
    characterOnlySemanticArrays?: SemanticArrays | null;
  } = {}
) {
  const original = makePanel(SEMANTIC.original.length);
  const translation = makePanel(SEMANTIC.original.length);
  const characterOnly = makePanel(CHAR_ONLY.original.length);
  const options = {
    semanticArrays: SEMANTIC as SemanticArrays | null,
    characterOnlySemanticArrays: CHAR_ONLY as SemanticArrays | null,
    ...overrides,
    originalTextRef: original.ref,
    translationTextRef: translation.ref,
    characterOnlyTextRef: characterOnly.ref,
  };
  const hook = renderHook(() => useHighlightInteraction(options));
  return { ...hook, original, translation, characterOnly };
}

const settle = () =>
  act(async () => {
    vi.advanceTimersByTime(HIGHLIGHT_SCROLL_DELAY_MS);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('translation-to-original click', () => {
  test('highlights both texts, maps to Character Only, scrolls Original then Character Only', async () => {
    const { result, original, translation, characterOnly } = setup();

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );

    expect(result.current.highlighting).toEqual({
      litIndex: 1,
      characterOnlyUnitIndex: [1, 2],
    });

    await settle();
    expect(original.scrolled(1)).toBe(1);
    expect(translation.scrolled(1)).toBe(0);
    expect(characterOnly.scrolled(1)).toBe(1);
  });
});

describe('original-to-translation click', () => {
  test('highlights the translation and scrolls only the translation panel', async () => {
    const { result, original, translation } = setup();

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'original-to-translation',
        unitIndex: 2,
      })
    );

    expect(result.current.highlighting.litIndex).toBe(2);
    await settle();
    expect(translation.scrolled(2)).toBe(1);
    expect(original.scrolled(2)).toBe(0);
  });
});

describe('character-only-to-original click', () => {
  test('highlights Original and Full Translation and scrolls both, without mapping back', async () => {
    const { result, original, translation, characterOnly } = setup();

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'character-only-to-original',
        unitIndex: 3,
      })
    );

    expect(result.current.highlighting).toEqual({ litIndex: 2, characterOnlyUnitIndex: -1 });
    await settle();
    expect(original.scrolled(2)).toBe(1);
    expect(translation.scrolled(2)).toBe(1);
    // a Character Only click leaves that panel unlit, so it is neither mapped back nor scrolled
    expect(characterOnly.scrolled(3)).toBe(0);
  });

  test('no match warns and clears the highlight', async () => {
    const { result, original, translation } = setup();
    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 0,
      })
    );
    await settle();
    vi.clearAllMocks();

    // '好' is a Character Only unit, but no Original unit equals it ('好吗' is one unit)
    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'character-only-to-original',
        unitIndex: 1,
      })
    );

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(result.current.highlighting.litIndex).toBe(-1);
    await settle();
    expect(original.scrolled(0)).toBe(0); // the no-match click schedules no scroll
    expect(translation.scrolled(0)).toBe(0);
  });

  test('does nothing while Character Only arrays are missing', async () => {
    const { result } = setup({ characterOnlySemanticArrays: null });

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'character-only-to-original',
        unitIndex: 3,
      })
    );

    expect(result.current.highlighting.litIndex).toBe(-1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('scroll timing', () => {
  test('a second click replaces the pending scroll of the first', async () => {
    const { result, original } = setup();

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 0,
      })
    );
    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 2,
      })
    );
    await settle();

    expect(original.scrolled(0)).toBe(0);
    expect(original.scrolled(2)).toBe(1);
  });

  test('a scroll still pending at unmount never fires', async () => {
    const { result, unmount, original, characterOnly } = setup();

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );
    unmount();
    await settle();

    expect(original.scrolled(1)).toBe(0);
    expect(characterOnly.scrolled(1)).toBe(0);
  });

  test('nothing scrolls before the delay elapses', async () => {
    const { result, original } = setup();

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_SCROLL_DELAY_MS - 1);
    });

    expect(original.scrolled(1)).toBe(0);
  });
});

describe('bridge', () => {
  test('without Character Only arrays a highlight is not mapped', async () => {
    const { result, characterOnly } = setup({ characterOnlySemanticArrays: null });

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );
    await settle();

    expect(result.current.highlighting.characterOnlyUnitIndex).toBe(-1);
    expect(characterOnly.scrolled(1)).toBe(0);
  });

  test('a unit with no Character Only match leaves the Character Only panel cleared', async () => {
    const noMatch = arrays(['无', '关']);
    const { result, characterOnly } = setup({ semanticArrays: noMatch });

    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 0,
      })
    );
    await settle();

    expect(result.current.highlighting.characterOnlyUnitIndex).toBe(-1);
    expect(characterOnly.scrolled(0)).toBe(0);
  });
});

describe('stale highlights and clearing', () => {
  test('a new semantic arrays reference clears the highlight in the same render', async () => {
    const original = makePanel(SEMANTIC.original.length);
    const translation = makePanel(SEMANTIC.original.length);
    const characterOnly = makePanel(CHAR_ONLY.original.length);
    const refs = {
      originalTextRef: original.ref,
      translationTextRef: translation.ref,
      characterOnlyTextRef: characterOnly.ref,
    };
    const { result, rerender } = renderHook(
      ({ semanticArrays }) =>
        useHighlightInteraction({
          semanticArrays,
          characterOnlySemanticArrays: CHAR_ONLY,
          ...refs,
        }),
      { initialProps: { semanticArrays: SEMANTIC as SemanticArrays } }
    );
    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );
    expect(result.current.highlighting.litIndex).toBe(1);

    rerender({ semanticArrays: arrays(['你', '好吗', '世']) });

    expect(result.current.highlighting).toEqual({ litIndex: -1, characterOnlyUnitIndex: -1 });
  });

  test('clearHighlighting lights nothing', async () => {
    const { result } = setup();
    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );
    act(() => result.current.clearHighlighting());
    expect(result.current.highlighting).toEqual({ litIndex: -1, characterOnlyUnitIndex: -1 });
  });

  test('an unrelated re-render does not scroll the Character Only panel again', async () => {
    const { result, rerender, characterOnly } = setup();
    act(() =>
      result.current.handleSemanticSegmentClick({
        direction: 'translation-to-original',
        unitIndex: 1,
      })
    );
    await settle();
    expect(characterOnly.scrolled(1)).toBe(1);

    rerender();
    await settle();

    expect(characterOnly.scrolled(1)).toBe(1);
  });
});
