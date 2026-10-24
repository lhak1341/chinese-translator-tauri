import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const addEntry = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const dictionaries = vi.hoisted(() => ({
  properNouns: {},
  'properNouns-f_Novel': {},
  characters: { 滕: 'Đằng' },
}));

vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries, unreadDictionaryIds: [], addEntry }),
}));
vi.mock('../../components/BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('../useTransformRules', () => ({ useTransformRules: () => ({ rules: [] }) }));

import { useCandidateFinder } from '../useCandidateFinder';

describe('useCandidateFinder adder', () => {
  it('adds through the Dictionary Store: dictionary first, then source and the edited translation', async () => {
    const { result } = renderHook(() => useCandidateFinder('fp'));
    await result.current.adder.add('滕青山', 'properNouns-f_Novel', 'Đằng Thanh Sơn');
    expect(addEntry).toHaveBeenCalledWith(
      'properNouns-f_Novel',
      '滕青山',
      'Đằng Thanh Sơn',
      expect.objectContaining({ allowAsPatternVariable: false })
    );
  });

  it('offers only proper-noun dictionaries, never characters', () => {
    const { result } = renderHook(() => useCandidateFinder('fp'));
    expect(result.current.adder.choices).not.toContain('characters');
    expect(result.current.adder.choices).toContain('properNouns');
  });
});
