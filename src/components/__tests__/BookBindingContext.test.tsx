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

const setBookBinding = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../utils/reader/BookRecordsBackend', () => ({ setBookBinding }));

const listProperNounsDictionaryIds = vi.hoisted(() => vi.fn());
vi.mock('../../utils/dictionary/DictionaryBackend', () => ({ listProperNounsDictionaryIds }));

const { reinitializeEngine, loadDictionary, dictionaries } = vi.hoisted(() => ({
  reinitializeEngine: vi.fn().mockResolvedValue(true),
  loadDictionary: vi.fn().mockResolvedValue(undefined),
  dictionaries: { properNouns: {} },
}));
vi.mock('../EngineContext', () => ({ useEngine: () => ({ reinitializeEngine }) }));
vi.mock('../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries, loadDictionary }),
}));

const createFictionDictionaryPair = vi.fn();

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
  (window as unknown as { electronAPI: unknown }).electronAPI = { createFictionDictionaryPair };
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
