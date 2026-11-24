import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { installFakeConfigDisk } from '../../test/fakeConfigDisk';
import { installFakeAppFile } from '../../test/fakeAppFile';
import { invalidateBookRecords } from '../../utils/reader/BookRecordsBackend';

// The render's dictionaries and the store's differ, as after an Add React has not rendered:
// a run must send the store's.
const sources = vi.hoisted(() => ({
  rendered: { 'properNouns-f_Novel': { old: {} } } as Record<string, object>,
  store: { 'properNouns-f_Novel': { old: {}, fresh: {} } } as Record<string, object>,
  view: {
    defaultQuickAddDictionary: 'properNouns-f_Novel',
    activeProperNouns: ['properNouns-f_Novel'],
  },
}));

vi.mock(import('../../components/dictionary/DictionaryContext'), () => ({
  useDictionary: () =>
    ({
      dictionaries: sources.rendered,
      unreadDictionaryIds: [],
      getDictionarySnapshot: () => ({ dictionaries: sources.store, unreadDictionaryIds: [] }),
      addEntry: vi.fn(),
      addEntries: vi.fn(),
    }) as unknown as ReturnType<
      typeof import('../../components/dictionary/DictionaryContext').useDictionary
    >,
}));
const loadQuickAddView = vi.hoisted(() => vi.fn());
vi.mock(import('../../components/BookBindingContext'), () => ({
  useBookBinding: () =>
    ({ loadQuickAddView }) as unknown as ReturnType<
      typeof import('../../components/BookBindingContext').useBookBinding
    >,
}));
vi.mock(import('../useTransformRules'), () => ({
  useTransformRules: () => ({ rules: [], isLoading: false }),
}));

import { useCandidateFinder } from '../useCandidateFinder';

const findCandidates = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  loadQuickAddView.mockResolvedValue(sources.view);
  findCandidates.mockResolvedValue({ candidates: [], weakFiltering: false });
  global.window.electronAPI = {
    findCandidates,
    cancelCandidateRun: vi.fn(),
    onCandidateProgress: vi.fn(async () => () => {}),
  } as unknown as typeof window.electronAPI;
  installFakeConfigDisk({ libraryPath: '/library' });
  invalidateBookRecords();
  installFakeAppFile({ load: 'loadBookRecords', save: 'saveBookRecords' }, {});
});

describe('useCandidateFinder run', () => {
  it("hands the store the binding's view and the Dictionary Store's own snapshot", async () => {
    const { result } = renderHook(() => useCandidateFinder('fp'));
    await act(async () => {
      result.current.run();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(loadQuickAddView).toHaveBeenCalledTimes(1);
    expect(findCandidates).toHaveBeenCalledWith(
      'fp',
      expect.any(String),
      [],
      ['old', 'fresh'],
      [],
      '/library',
      []
    );
    expect(result.current.snapshot).toMatchObject({ status: 'done', view: sources.view });
  });
});
