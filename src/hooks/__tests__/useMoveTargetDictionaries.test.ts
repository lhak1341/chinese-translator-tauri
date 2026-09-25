import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMoveTargetDictionaries } from '../useMoveTargetDictionaries';

const mockGetDictionaryTypes = vi.fn();

vi.mock('../../components/dictionary/DictionaryTypes', () => ({
  getDictionaryTypes: (...args: unknown[]) => mockGetDictionaryTypes(...args),
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

describe('useMoveTargetDictionaries', () => {
  beforeEach(() => {
    mockGetDictionaryTypes.mockReset();
  });

  it('loads same-family targets only, filtering out the current one, base dictionaries first', async () => {
    mockGetDictionaryTypes.mockResolvedValue({
      properNouns: {},
      phrases: {},
      characters: {},
      patterns: {},
      'properNouns-HarryPotter': {},
    });

    const { result } = renderHook(() => useMoveTargetDictionaries('phrases'));

    await waitFor(() => expect(result.current.availableDictionaries).toHaveLength(2));

    expect(result.current.availableDictionaries).toEqual([
      { id: 'properNouns', label: 'Proper Nouns (Base)' },
      { id: 'properNouns-HarryPotter', label: 'Proper Nouns - HarryPotter' },
    ]);
  });

  it('offers only pattern dictionaries for a pattern source', async () => {
    mockGetDictionaryTypes.mockResolvedValue({
      patterns: {},
      'patterns-f_DuongThan': {},
      phrases: {},
      properNouns: {},
    });

    const { result } = renderHook(() => useMoveTargetDictionaries('patterns-f_DuongThan'));

    await waitFor(() => expect(result.current.availableDictionaries).toHaveLength(1));
    expect(result.current.availableDictionaries[0]).toEqual({
      id: 'patterns',
      label: 'Patterns (Base)',
    });
  });

  it('offers nothing for a string-only lookup table', async () => {
    mockGetDictionaryTypes.mockResolvedValue({ characters: {}, conversion: {}, phrases: {} });

    const { result } = renderHook(() => useMoveTargetDictionaries('characters'));

    await waitFor(() => expect(mockGetDictionaryTypes).toHaveBeenCalled());
    expect(result.current.availableDictionaries).toEqual([]);
  });

  it('excludes the current dictionary id from the available list', async () => {
    mockGetDictionaryTypes.mockResolvedValue({
      properNouns: {},
      phrases: {},
    });

    const { result } = renderHook(() => useMoveTargetDictionaries('properNouns'));

    await waitFor(() => expect(result.current.availableDictionaries).toHaveLength(1));
    expect(result.current.availableDictionaries[0].id).toBe('phrases');
  });

  it('calls onError and leaves the list empty when the load fails', async () => {
    mockGetDictionaryTypes.mockRejectedValue(new Error('IPC failure'));
    const onError = vi.fn();

    const { result } = renderHook(() => useMoveTargetDictionaries('phrases', onError));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to load available dictionaries')
    );
    expect(result.current.availableDictionaries).toEqual([]);
  });

  it.each([
    ['properNouns', 'Proper Nouns (Base)'],
    ['properNouns-HarryPotter', 'Proper Nouns - HarryPotter'],
    ['characters', 'Characters'],
  ])('derives sourceLabel for %s synchronously, independent of the async load', (id, expected) => {
    mockGetDictionaryTypes.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useMoveTargetDictionaries(id));

    expect(result.current.sourceLabel).toBe(expected);
  });

  it('keeps sourceLabel correct even when the dictionary-list load fails', async () => {
    mockGetDictionaryTypes.mockRejectedValue(new Error('IPC failure'));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useMoveTargetDictionaries('properNouns-HarryPotter', onError)
    );

    expect(result.current.sourceLabel).toBe('Proper Nouns - HarryPotter');
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.sourceLabel).toBe('Proper Nouns - HarryPotter');
  });
});
