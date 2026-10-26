import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const store = vi.hoisted(() => ({
  dictionaries: { properNouns: {}, patterns: { '#星X': {} } } as Record<string, object>,
}));
const addEntry = vi.hoisted(() => vi.fn());
const addEntries = vi.hoisted(() => vi.fn());
const rules = vi.hoisted(() => []);

vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({
    dictionaries: store.dictionaries,
    unreadDictionaryIds: [],
    addEntry,
    addEntries,
  }),
}));
vi.mock('../../components/BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('../useTransformRules', () => ({ useTransformRules: () => ({ rules }) }));

import { useCandidateFinder } from '../useCandidateFinder';

describe('useCandidateFinder rank', () => {
  // An Add hands the hook a new dictionaries object; a new `rank` would make the panel re-rank
  // every survivor (the pattern coverage pass cost about 3 s there before it moved to the run).
  it('keeps its identity when the dictionaries change, as after an Add', () => {
    const { result, rerender } = renderHook(() => useCandidateFinder('fp'));
    const before = result.current.adder.rank;

    store.dictionaries = { ...store.dictionaries, properNouns: { 滕青山: 'Đằng Thanh Sơn' } };
    rerender();

    expect(result.current.adder.isAdded('滕青山')).toBe(true);
    expect(result.current.adder.rank).toBe(before);
  });
});
