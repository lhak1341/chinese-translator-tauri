import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFakeAppFile } from '../../test/fakeAppFile';
import { invalidateBookRecords } from '../../utils/reader/BookRecordsBackend';
import { makeBookRecord } from '../../utils/reader/__tests__/bookRecordFixture';
import type { BookRecords } from '../../types/ReaderTypes';

vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries: {}, unreadDictionaryIds: [], addEntry: vi.fn() }),
}));
vi.mock('../../components/BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('../useTransformRules', () => ({ useTransformRules: () => ({ rules: [] }) }));

import { useCandidateFinder } from '../useCandidateFinder';

function install(initial: BookRecords) {
  invalidateBookRecords();
  global.window.electronAPI = {} as unknown as typeof window.electronAPI;
  return installFakeAppFile({ load: 'loadBookRecords', save: 'saveBookRecords' }, initial);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useCandidateFinder dismissals', () => {
  it('a dismiss persists in the book record and a restore takes it out again', async () => {
    const { disk } = install({ fp1: makeBookRecord() });
    const { result } = renderHook(() => useCandidateFinder('fp1'));
    await waitFor(() => expect(result.current.dismissals.canDismiss).toBe(true));

    await act(() => result.current.dismissals.dismiss('滕青山'));
    expect(result.current.dismissals.names).toEqual(['滕青山']);
    expect((disk.data as BookRecords).fp1.dismissedCandidates).toEqual(['滕青山']);

    await act(() => result.current.dismissals.restore('滕青山'));
    expect(result.current.dismissals.names).toEqual([]);
    expect((disk.data as BookRecords).fp1.dismissedCandidates).toEqual([]);
  });

  it('a name dismissed earlier is still dismissed after a restart', async () => {
    install({ fp1: makeBookRecord({ dismissedCandidates: ['滕青山'] }) });
    const { result } = renderHook(() => useCandidateFinder('fp1'));
    await waitFor(() => expect(result.current.dismissals.names).toEqual(['滕青山']));
  });

  it('a book whose records cannot be read still runs, but cannot dismiss, and says why', async () => {
    const { load, save } = install({});
    load.mockResolvedValue({ success: false, error: 'EACCES' } as never);
    const { result } = renderHook(() => useCandidateFinder('fp1'));
    await waitFor(() => expect(result.current.dismissals.unreadable).toMatch(/not saving over it/));

    expect(result.current.dismissals.canDismiss).toBe(false);
    expect(result.current.run).toBeTypeOf('function');
    await act(() => result.current.dismissals.dismiss('滕青山').catch(() => {}));
    expect(save).not.toHaveBeenCalled();
  });
});
