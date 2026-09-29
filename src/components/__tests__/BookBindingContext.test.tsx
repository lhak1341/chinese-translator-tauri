/**
 * Tests for the sequencing `BookBindingProvider` owns.
 *
 * `BindingActivation.ts` decides *what* the active dictionary list should be; this file
 * covers *when* that list is written and when the engine is rebuilt — the part with no
 * pure function to point at. The spec's "deliberately untested" carve-out is for the React
 * panel wiring (virtualizer mounting, resize measurement, the who-is-driving latch), not
 * for this: none of it is DOM behavior, and each rule below fails silently rather than
 * loudly when it breaks.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { BookBindingProvider, useBookBinding } from '../BookBindingContext';

// The engine module is 300+ KB and only its debug-level enum is needed here.
vi.mock('../../utils/TranslationEngine.js', () => ({ DEBUG_LEVELS: { ERROR: 0 } }));

const { config, loadAppConfig, saveAppConfig, callRustConfigWrite } = vi.hoisted(() => {
  const config = {
    engine: { activeProperNouns: ['properNouns'] },
    ui: { defaultQuickAddDictionary: null as string | null },
    session: { lastSelectedDictionary: null },
    reader: { libraryPath: null },
  };
  return {
    config,
    // Mutable, like the real cached config: a save is visible to the next load, which is
    // what makes the "reopening changes nothing" case testable at all.
    loadAppConfig: vi.fn(async () => config),
    saveAppConfig: vi.fn(async (patch: Record<string, Record<string, unknown>>) => {
      Object.assign(config.engine, patch.engine ?? {});
      Object.assign(config.ui, patch.ui ?? {});
    }),
    callRustConfigWrite: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  };
});
vi.mock('../../utils/appConfig', () => ({
  loadAppConfig,
  saveAppConfig,
  callRustConfigWrite,
  invalidateAppConfig: vi.fn(),
}));

const { setBookBinding, renameBoundDictionary } = vi.hoisted(() => ({
  setBookBinding: vi.fn().mockResolvedValue(undefined),
  renameBoundDictionary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/reader/BookRecordsBackend', () => ({
  setBookBinding,
  renameBoundDictionary,
}));

const listProperNounsDictionaryIds = vi.hoisted(() => vi.fn());
vi.mock('../../utils/dictionary/DictionaryBackend', () => ({ listProperNounsDictionaryIds }));

const { reinitializeEngine, loadDictionary, removeDictionaryKey, dictionaries } = vi.hoisted(
  () => ({
    reinitializeEngine: vi.fn().mockResolvedValue(true),
    loadDictionary: vi.fn().mockResolvedValue(undefined),
    removeDictionaryKey: vi.fn(),
    dictionaries: { properNouns: {} },
  })
);
vi.mock('../EngineContext', () => ({ useEngine: () => ({ reinitializeEngine }) }));
vi.mock('../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries, loadDictionary, removeDictionaryKey }),
}));

const createFictionDictionaryPair = vi.fn();
const renameProperNounsDictionary = vi.fn();

const BOOK = { fingerprint: 'fp1', fileName: 'Tạp đồ 卡徒.txt', title: 'Tạp đồ 卡徒' };

function setup() {
  return renderHook(() => useBookBinding(), {
    wrapper: ({ children }) => <BookBindingProvider>{children}</BookBindingProvider>,
  });
}

/** The `activeProperNouns` of the most recent `saveAppConfig` call. */
function lastSavedActive(): string[] | undefined {
  const calls = saveAppConfig.mock.calls;
  return calls.length === 0
    ? undefined
    : (calls[calls.length - 1][0] as { engine?: { activeProperNouns?: string[] } }).engine
        ?.activeProperNouns;
}

beforeEach(() => {
  vi.clearAllMocks();
  config.engine.activeProperNouns = ['properNouns', 'properNouns-_AiCap'];
  config.ui.defaultQuickAddDictionary = null;
  listProperNounsDictionaryIds.mockResolvedValue([
    'properNouns',
    'properNouns-_AiCap',
    'properNouns-f_TapDo',
    'properNouns-f_TruTien',
  ]);
  createFictionDictionaryPair.mockResolvedValue({ success: true });
  renameProperNounsDictionary.mockResolvedValue({ success: true });
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    createFictionDictionaryPair,
    renameProperNounsDictionary,
  };
});

describe('opening a book', () => {
  test('offers only the fiction dictionaries', async () => {
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.fictionDictionaries).toEqual([
        'properNouns-f_TapDo',
        'properNouns-f_TruTien',
      ])
    );
  });

  test('an unanswered book reads with the general dictionaries only, and persists nothing', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });

    // The previous book's fiction dictionary is dropped — leaving it active is the silent
    // wrong-dictionary failure — but no answer is written, so the offer still stands.
    await waitFor(() => expect(lastSavedActive()).toEqual(['properNouns']));
    expect(setBookBinding).not.toHaveBeenCalled();
    expect(result.current.binding).toBeNull();
    expect(reinitializeEngine).toHaveBeenCalledTimes(1);
  });

  test('a bound book applies its own dictionary and reinitializes', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    await waitFor(() => expect(lastSavedActive()).toEqual(['properNouns', 'properNouns-f_TapDo']));
    expect(reinitializeEngine).toHaveBeenCalledWith(dictionaries, {
      forceConfigReload: true,
      debugLevel: 0,
    });
    expect(result.current.boundFictionDictionary).toBe('properNouns-f_TapDo');
  });

  test('reopening the book already applied writes nothing and rebuilds nothing', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TapDo'];
    config.ui.defaultQuickAddDictionary = 'properNouns-f_TapDo';
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    // A reinitialization here would throw away every translation already on screen for a
    // dictionary set that did not change.
    expect(saveAppConfig).not.toHaveBeenCalled();
    expect(reinitializeEngine).not.toHaveBeenCalled();
  });

  test('the binding becomes the default quick-add target', async () => {
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    await waitFor(() =>
      expect(saveAppConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          ui: { defaultQuickAddDictionary: 'properNouns-f_TapDo' },
        })
      )
    );
  });
});

describe('closing a book', () => {
  test('gives up the book, unlocking Configuration, and writes and rebuilds nothing', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });
    await waitFor(() => expect(result.current.isApplying).toBe(false));
    saveAppConfig.mockClear();
    reinitializeEngine.mockClear();

    await act(async () => {
      result.current.announceClosedBook();
    });

    expect(result.current.isBookOpen).toBe(false);
    expect(result.current.openBook).toBeNull();
    expect(result.current.binding).toBeNull();
    expect(result.current.boundFictionDictionary).toBeNull();
    expect(saveAppConfig).not.toHaveBeenCalled();
    expect(reinitializeEngine).not.toHaveBeenCalled();
    // The last book's dictionary stays active: closing is not an answer.
    expect(config.engine.activeProperNouns).toContain('properNouns-f_TapDo');
  });

  test('clears a missing dictionary and a failed apply once the queued apply has finished', async () => {
    listProperNounsDictionaryIds.mockResolvedValue(['properNouns']);
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
      result.current.announceClosedBook();
    });

    await waitFor(() => expect(result.current.isApplying).toBe(false));
    expect(result.current.missingFictionDictionary).toBeNull();
    expect(result.current.applyError).toBeNull();
    expect(result.current.isBookOpen).toBe(false);
  });

  test('a book announced right after a close keeps its own state', async () => {
    listProperNounsDictionaryIds.mockResolvedValue(['properNouns']);
    const { result } = setup();
    await act(async () => {
      result.current.announceClosedBook();
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    });

    await waitFor(() => expect(result.current.missingFictionDictionary).toBe('properNouns-f_Gone'));
    expect(result.current.isBookOpen).toBe(true);
  });

  test('the dialog cannot open once the book is closed', async () => {
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
});

describe('a bound dictionary that no longer exists', () => {
  test('reads with no fiction dictionary, names the missing one, and keeps the answer', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    });

    // Writing the missing name into activeProperNouns would load the book with no fiction
    // dictionary and no word of why; so would keeping the previous book's.
    await waitFor(() => expect(lastSavedActive()).toEqual(['properNouns']));
    expect(result.current.missingFictionDictionary).toBe('properNouns-f_Gone');
    expect(result.current.boundFictionDictionary).toBeNull();
    // The record is the reader's answer; nothing but the reader rewrites it.
    expect(result.current.binding).toEqual({ fictionDictionary: 'properNouns-f_Gone' });
    expect(setBookBinding).not.toHaveBeenCalled();
  });

  test('is checked against disk, not a fiction list that has not loaded yet', async () => {
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    await waitFor(() => expect(lastSavedActive()).toContain('properNouns-f_TapDo'));
    expect(result.current.missingFictionDictionary).toBeNull();
  });

  test('a failed listing applies the binding as recorded rather than blocking the open', async () => {
    const { result } = setup();
    await waitFor(() => expect(listProperNounsDictionaryIds).toHaveBeenCalled());
    listProperNounsDictionaryIds.mockRejectedValueOnce(new Error('io'));

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });

    await waitFor(() => expect(lastSavedActive()).toContain('properNouns-f_TapDo'));
    expect(result.current.missingFictionDictionary).toBeNull();
  });

  test('binding another dictionary clears it', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    });
    await waitFor(() => expect(result.current.missingFictionDictionary).toBe('properNouns-f_Gone'));

    await act(async () => {
      await result.current.bind('properNouns-f_TruTien');
    });

    expect(result.current.missingFictionDictionary).toBeNull();
    expect(result.current.boundFictionDictionary).toBe('properNouns-f_TruTien');
  });
});

describe('renaming a fiction dictionary', () => {
  test('carries the new name into book records and the open book, without a rebuild', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });
    await waitFor(() => expect(result.current.boundFictionDictionary).toBe('properNouns-f_TapDo'));
    reinitializeEngine.mockClear();

    let response: { success: boolean } | undefined;
    await act(async () => {
      response = await result.current.renameFictionDictionary(
        'properNouns-f_TapDo',
        'properNouns-f_TapDoMoi'
      );
    });

    expect(response?.success).toBe(true);
    expect(renameProperNounsDictionary).toHaveBeenCalledWith(
      'properNouns-f_TapDo',
      'properNouns-f_TapDoMoi'
    );
    expect(renameBoundDictionary).toHaveBeenCalledWith(
      'properNouns-f_TapDo',
      'properNouns-f_TapDoMoi'
    );
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_TapDoMoi');
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_TapDoMoi');
    expect(removeDictionaryKey).toHaveBeenCalledWith('properNouns-f_TapDo');
    expect(removeDictionaryKey).toHaveBeenCalledWith('patterns-f_TapDo');
    expect(result.current.binding).toEqual({ fictionDictionary: 'properNouns-f_TapDoMoi' });
    expect(result.current.boundFictionDictionary).toBe('properNouns-f_TapDoMoi');
    // Rust already renamed the config's entry, and the dictionary's data is unchanged.
    expect(reinitializeEngine).not.toHaveBeenCalled();
  });

  test('a failed backend rename touches no records', async () => {
    renameProperNounsDictionary.mockResolvedValue({ success: false, error: 'already exists' });
    const { result } = setup();

    let response: { success: boolean; error?: string } | undefined;
    await act(async () => {
      response = await result.current.renameFictionDictionary(
        'properNouns-f_TapDo',
        'properNouns-f_TruTien'
      );
    });

    expect(response).toEqual({ success: false, error: 'already exists', filesMoved: false });
    expect(renameBoundDictionary).not.toHaveBeenCalled();
    expect(removeDictionaryKey).not.toHaveBeenCalled();
  });

  test('a failed records rewrite is reported, and the open book shows its binding missing', async () => {
    renameBoundDictionary.mockRejectedValueOnce(new Error('books.json locked'));
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });
    await waitFor(() => expect(result.current.boundFictionDictionary).toBe('properNouns-f_TapDo'));

    let response: { success: boolean; error?: string } | undefined;
    await act(async () => {
      response = await result.current.renameFictionDictionary(
        'properNouns-f_TapDo',
        'properNouns-f_TapDoMoi'
      );
    });

    expect(response?.success).toBe(false);
    expect(response?.error).toContain('books.json locked');
    // The file did move, so the record now names a dictionary that does not exist.
    expect(result.current.missingFictionDictionary).toBe('properNouns-f_TapDo');
    expect(result.current.boundFictionDictionary).toBeNull();
  });
});

describe('creating a fiction dictionary from the Configuration tab', () => {
  test('creates the pair, loads both halves, and refreshes the list, binding nothing', async () => {
    const { result } = setup();

    let response: { success: boolean } | undefined;
    await act(async () => {
      response = await result.current.createFictionDictionary('properNouns-f_DaiBatHau');
    });

    expect(response?.success).toBe(true);
    expect(createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_DaiBatHau');
    expect(listProperNounsDictionaryIds).toHaveBeenCalledTimes(2);
    expect(setBookBinding).not.toHaveBeenCalled();
  });
});

describe('answering the dialog', () => {
  test('binding a dictionary persists the answer before applying it', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });
    saveAppConfig.mockClear();

    await act(async () => {
      await result.current.bind('properNouns-f_TapDo');
    });

    expect(setBookBinding).toHaveBeenCalledWith('fp1', {
      fictionDictionary: 'properNouns-f_TapDo',
    });
    expect(lastSavedActive()).toEqual(['properNouns', 'properNouns-_AiCap', 'properNouns-f_TapDo']);
    expect(result.current.isDialogOpen).toBe(false);
  });

  test('"no fiction dictionary" is persisted as an answer, not as an absent one', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });

    await act(async () => {
      await result.current.bind(null);
    });

    expect(setBookBinding).toHaveBeenCalledWith('fp1', { fictionDictionary: null });
    expect(result.current.binding).toEqual({ fictionDictionary: null });
  });

  test('bind does nothing when no book is open', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.bind('properNouns-f_TapDo');
    });
    expect(setBookBinding).not.toHaveBeenCalled();
  });
});

describe('creating a dictionary from the dialog', () => {
  test('creates the pair, loads both halves, then binds to it', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });

    await act(async () => {
      await result.current.createAndBind('Đại bát hầu');
    });

    // Diacritics folded, so the suggestion derived from the file name can match it later.
    expect(createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_DaiBatHau');
    expect(setBookBinding).toHaveBeenCalledWith('fp1', {
      fictionDictionary: 'properNouns-f_DaiBatHau',
    });
  });

  test('a failed create binds nothing and surfaces the error', async () => {
    createFictionDictionaryPair.mockResolvedValue({ success: false, error: 'disk full' });
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });

    await act(async () => {
      await result.current.createAndBind('DaiBatHau');
    });

    expect(setBookBinding).not.toHaveBeenCalled();
    expect(result.current.error).toBe('disk full');
  });

  test('a name with no letters to slug is refused before it reaches the backend', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });

    await act(async () => {
      await result.current.createAndBind('卡徒');
    });

    expect(createFictionDictionaryPair).not.toHaveBeenCalled();
    expect(result.current.error).toContain('卡徒');
    // A refused name is a dialog message, not a failed apply: nothing changed.
    expect(result.current.applyError).toBeNull();
  });
});

describe('a failed apply', () => {
  test('on open, it is reported as an apply error, and a later successful bind clears it', async () => {
    reinitializeEngine.mockRejectedValueOnce(new Error('engine exploded'));
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const { result } = setup();

    await act(async () => {
      result.current.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    });
    await waitFor(() => expect(result.current.applyError).toBe('engine exploded'));

    config.engine.activeProperNouns = ['properNouns'];
    await act(async () => {
      await result.current.bind('properNouns-f_TruTien');
    });
    expect(result.current.applyError).toBeNull();
  });

  test('a failed save of the answer is not an apply error: the engine was never touched', async () => {
    setBookBinding.mockRejectedValueOnce(new Error('disk full'));
    const { result } = setup();
    await act(async () => {
      result.current.announceOpenBook(BOOK, null);
    });

    await act(async () => {
      await result.current.bind('properNouns-f_TapDo');
    });

    expect(result.current.error).toBe('disk full');
    expect(result.current.applyError).toBeNull();
  });
});

describe('the dialog flag', () => {
  test('opening it with no book open is a no-op — nothing would render it', async () => {
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
});
