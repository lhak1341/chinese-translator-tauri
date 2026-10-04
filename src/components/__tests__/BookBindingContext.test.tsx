/**
 * Tests for `BookBindingProvider`'s wiring: what it takes from other contexts, what it hands
 * to consumers, and the dialog flag, which is the one piece of state it owns.
 *
 * The rules — when config is written, when the engine is rebuilt, what a failure leaves — are
 * `BookBindingStore`'s, and are covered in `BookBindingStore.test.ts` with no React.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { BookBindingProvider, useBookBinding } from '../BookBindingContext';
import { installFakeConfigDisk } from '../../test/fakeConfigDisk';

// The engine module is 300+ KB and only its debug-level enum is needed here.

const { setBookBinding } = vi.hoisted(() => ({
  setBookBinding: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/reader/BookRecordsBackend', () => ({
  setBookBinding,
  renameBoundDictionary: vi.fn().mockResolvedValue(undefined),
  unbindDictionary: vi.fn().mockResolvedValue(undefined),
}));

const listProperNounsDictionaryIds = vi.hoisted(() => vi.fn());
vi.mock('../../utils/dictionary/DictionaryBackend', () => ({ listProperNounsDictionaryIds }));

// `engine.reinitializeEngine` is swappable: the provider must call whichever the latest render
// handed it, since its store is made once.
const { engine, dictionaries, dictionaryContext } = vi.hoisted(() => {
  const dictionaries = { properNouns: {} };
  return {
    engine: { reinitializeEngine: vi.fn() },
    dictionaries,
    dictionaryContext: {
      dictionaries,
      dictionaryTypes: {} as Record<string, unknown>,
      loadDictionary: vi.fn().mockResolvedValue(undefined),
      applyRename: vi.fn().mockResolvedValue(undefined),
      getDictionaries: vi.fn(() => dictionaries),
    },
  };
});
vi.mock('../EngineContext', () => ({
  useEngine: () => ({ reinitializeEngine: engine.reinitializeEngine }),
}));
vi.mock('../dictionary/DictionaryContext', () => ({
  useDictionary: () => dictionaryContext,
}));

const BOOK = { fingerprint: 'fp1', fileName: 'Tạp đồ 卡徒.txt', title: 'Tạp đồ 卡徒' };

function setup() {
  return renderHook(() => useBookBinding(), {
    wrapper: ({ children }) => <BookBindingProvider>{children}</BookBindingProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  engine.reinitializeEngine = vi.fn().mockResolvedValue({ ok: true });
  dictionaryContext.getDictionaries.mockImplementation(() => dictionaries);
  dictionaryContext.dictionaryTypes = {};
  setBookBinding.mockResolvedValue(undefined);
  listProperNounsDictionaryIds.mockResolvedValue([
    'properNouns',
    'properNouns-_AiCap',
    'properNouns-f_TapDo',
    'properNouns-f_TruTien',
  ]);
  (window as unknown as { electronAPI: unknown }).electronAPI = {};
  installFakeConfigDisk({
    activeProperNouns: ['properNouns', 'properNouns-_AiCap'],
    defaultQuickAddDictionary: null,
  });
});

describe('what consumers read', () => {
  test('lists the fiction dictionaries the Dictionary Store lists, sorted', () => {
    dictionaryContext.dictionaryTypes = Object.fromEntries(
      [
        'properNouns',
        'properNouns-f_TruTien',
        'properNouns-_AiCap',
        'patterns-f_TapDo',
        'properNouns-f_TapDo',
      ].map((id) => [id, {}])
    );
    const { result } = setup();

    expect(result.current.fictionDictionaries).toEqual([
      'properNouns-f_TapDo',
      'properNouns-f_TruTien',
    ]);
  });

  test('an announced book shows as open, with the dictionary in use read off its binding', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    await waitFor(() => expect(result.current.isApplying).toBe(false));
    expect(result.current.isBookOpen).toBe(true);
    expect(result.current.openBook).toEqual(BOOK);
    expect(result.current.binding).toEqual({ fictionDictionary: 'properNouns-f_TapDo' });
    expect(result.current.boundFictionDictionary).toBe('properNouns-f_TapDo');
  });

  test('a recorded dictionary that no longer exists is named, and not in use', async () => {
    listProperNounsDictionaryIds.mockResolvedValue(['properNouns']);
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    });

    await waitFor(() => expect(result.current.missingFictionDictionary).toBe('properNouns-f_Gone'));
    expect(result.current.binding).toEqual({ fictionDictionary: 'properNouns-f_Gone' });
    expect(result.current.boundFictionDictionary).toBeNull();
  });

  test('every operation and the quick-add view keep one identity as state changes', async () => {
    const { result } = setup();
    const first = { ...result.current };
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });
    await waitFor(() => expect(result.current.isApplying).toBe(false));

    for (const name of [
      'announceOpenBook',
      'announceClosedBook',
      'bind',
      'createAndBind',
      'createDictionary',
      'renameDictionary',
      'moveDictionaryTier',
      'loadQuickAddView',
      'openDialog',
      'closeDialog',
    ] as const) {
      expect(result.current[name], name).toBe(first[name]);
    }
  });
});

describe('the engine the store rebuilds', () => {
  test('is the one the latest render handed over, not the first', async () => {
    const first = engine.reinitializeEngine;
    const { result, rerender } = setup();
    engine.reinitializeEngine = vi.fn().mockResolvedValue({ ok: true });
    rerender();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });
    await waitFor(() => expect(engine.reinitializeEngine).toHaveBeenCalled());

    expect(engine.reinitializeEngine).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    // The Dictionary Store's map, read when the rebuild runs.
    expect(engine.reinitializeEngine).toHaveBeenCalledWith(dictionaries, {
      forceConfigReload: true,
    });
  });
});

describe('a rebuild the engine reports as failed', () => {
  test("reaches applyError, through the store's own failure path", async () => {
    engine.reinitializeEngine = vi.fn().mockResolvedValue({ ok: false, error: 'WASM exploded' });
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    await waitFor(() => expect(result.current.applyError).toBe('WASM exploded'));
  });
});

describe('the dialog flag', () => {
  test('opening it with no book open is a no-op — nothing would render it', () => {
    const { result } = setup();
    act(() => {
      result.current.openDialog();
    });
    expect(result.current.isDialogOpen).toBe(false);
  });

  test('opens once a book is open', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    act(() => {
      result.current.openDialog();
    });
    expect(result.current.isDialogOpen).toBe(true);
  });

  test('cannot open once the book is closed', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    act(() => {
      result.current.announceClosedBook();
      result.current.openDialog();
    });
    expect(result.current.isDialogOpen).toBe(false);
  });

  test('announcing another book closes a dialog left open for the last one', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    act(() => {
      result.current.openDialog();
    });
    await act(async () => {
      result.current.announceOpenBook({ ...BOOK, fingerprint: 'fp2' }, null);
    });
    expect(result.current.isDialogOpen).toBe(false);
  });

  test('closes once an answer has landed', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    act(() => {
      result.current.openDialog();
    });

    await act(async () => {
      await result.current.bind('properNouns-f_TapDo');
    });

    expect(result.current.isDialogOpen).toBe(false);
  });

  test('stays open to show a failure', async () => {
    setBookBinding.mockRejectedValueOnce(new Error('disk full'));
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    act(() => {
      result.current.openDialog();
    });

    await act(async () => {
      await result.current.bind('properNouns-f_TapDo');
    });

    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.error).toBe('disk full');
  });

  test('creating a dictionary from it closes it too, once bound', async () => {
    const createFictionDictionaryPair = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { electronAPI: unknown }).electronAPI = { createFictionDictionaryPair };
    installFakeConfigDisk({ activeProperNouns: ['properNouns'] });
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    act(() => {
      result.current.openDialog();
    });

    await act(async () => {
      await result.current.createAndBind('Đại bát hầu');
    });

    expect(result.current.isDialogOpen).toBe(false);
  });
});
