/**
 * Tests for the sequencing `BookBindingStore` owns.
 *
 * `BindingActivation.ts` decides *what* the active dictionary list should be; this file
 * covers *when* that list is written and when the engine is rebuilt — the part with no
 * pure function to point at. It runs the store directly, with no React: each rule below
 * fails silently rather than loudly when it breaks, and none of it is DOM behavior.
 * `BookBindingContext.test.tsx` covers only the provider's wiring.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createBookBindingStore, type BookBindingStore } from '../BookBindingStore';
import { createDictionary, renameDictionary } from '../../utils/dictionary/DictionaryPairs';
import { dictionaryInUse } from '../../utils/reader/BindingActivation';
import { quickAddTarget } from '../../utils/dictionary/QuickAddTarget';
import { invalidateAppConfig, loadAppConfig, saveAppConfig } from '../../utils/appConfig';
import { installFakeConfigDisk } from '../../test/fakeConfigDisk';

const waitFor = vi.waitFor;

/** Lets everything the store has queued run to completion, as React's `act` does for the
 * provider: the fakes resolve in microtasks, so one macrotask turn drains them. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// The real `appConfig` over a fake `config.json`: its lock, its diff and its no-op saves are
// what these tests are about. `config` is a view of the fake disk, and setting a field plays a
// Rust-side write — the cache is dropped, as `callRustConfigWrite` does for the real ones.
let disk: ReturnType<typeof installFakeConfigDisk>;
function diskField<T>(key: string) {
  return {
    get: () => disk.disk.raw[key] as T,
    set: (value: T) => {
      disk.disk.raw[key] = value;
      invalidateAppConfig();
    },
  };
}
const config = {
  engine: Object.defineProperty({} as { activeProperNouns: string[] }, 'activeProperNouns', {
    ...diskField<string[]>('activeProperNouns'),
    enumerable: true,
  }),
  ui: Object.defineProperty(
    {} as { defaultQuickAddDictionary: string | null },
    'defaultQuickAddDictionary',
    { ...diskField<string | null>('defaultQuickAddDictionary'), enumerable: true }
  ),
};

const { setBookBinding, renameBoundDictionary, unbindDictionary } = vi.hoisted(() => ({
  setBookBinding: vi.fn().mockResolvedValue(undefined),
  renameBoundDictionary: vi.fn().mockResolvedValue(undefined),
  unbindDictionary: vi.fn().mockResolvedValue(undefined),
}));
const listProperNounsDictionaryIds = vi.fn();

const dictionaries = { properNouns: {} };
const reinitializeEngine = vi.fn();
const loadDictionary = vi.fn();
const applyRename = vi.fn();
const getDictionaries = vi.fn();

const createFictionDictionaryPair = vi.fn();
const createProperNounsDictionary = vi.fn();
const renameProperNounsDictionary = vi.fn();

const BOOK = { fingerprint: 'fp1', fileName: 'Tạp đồ 卡徒.txt', title: 'Tạp đồ 卡徒' };

let current: BookBindingStore;
function setup(): BookBindingStore {
  const pairOps = { loadDictionary, applyRename };
  current = createBookBindingStore({
    listDictionaryIds: listProperNounsDictionaryIds,
    setBookBinding,
    renameBoundDictionary,
    unbindDictionary,
    createDictionaryFiles: (dictionaryId) => createDictionary(dictionaryId, pairOps),
    renameDictionary: (oldId, newId) => renameDictionary(oldId, newId, pairOps),
    rebuildEngine: async () => {
      await reinitializeEngine(getDictionaries(), { forceConfigReload: true, debugLevel: 0 });
    },
  });
  return current;
}
const snap = () => current.getSnapshot();
const inUse = () => dictionaryInUse(snap().binding, snap().missingFictionDictionary);

/** The `activeProperNouns` of the most recent save of `config.json`. */
function lastSavedActive(): string[] | undefined {
  const calls = disk.saveConfiguration.mock.calls;
  return calls.length === 0
    ? undefined
    : (calls[calls.length - 1][0] as { activeProperNouns?: string[] }).activeProperNouns;
}

/** Holds the next save of `config.json` until `release()`. */
function deferredSave() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = disk.saveConfiguration.getMockImplementation()!;
  disk.saveConfiguration.mockImplementationOnce(async (raw) => {
    await gate;
    return original(raw);
  });
  return { release };
}

beforeEach(() => {
  vi.clearAllMocks();
  reinitializeEngine.mockResolvedValue(true);
  loadDictionary.mockResolvedValue(undefined);
  applyRename.mockResolvedValue(undefined);
  getDictionaries.mockImplementation(() => dictionaries);
  setBookBinding.mockResolvedValue(undefined);
  renameBoundDictionary.mockResolvedValue(undefined);
  unbindDictionary.mockResolvedValue(undefined);
  listProperNounsDictionaryIds.mockResolvedValue([
    'properNouns',
    'properNouns-_AiCap',
    'properNouns-f_TapDo',
    'properNouns-f_TruTien',
  ]);
  createFictionDictionaryPair.mockResolvedValue({ success: true });
  createProperNounsDictionary.mockResolvedValue({ success: true });
  renameProperNounsDictionary.mockResolvedValue({ success: true });
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    createFictionDictionaryPair,
    createProperNounsDictionary,
    renameProperNounsDictionary,
  };
  disk = installFakeConfigDisk({
    activeProperNouns: ['properNouns', 'properNouns-_AiCap'],
    defaultQuickAddDictionary: null,
  });
});

describe('opening a book', () => {
  test('an unanswered book reads with the general dictionaries only, and persists nothing', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const store = setup();

    store.announceOpenBook(BOOK, null);
    await settle();

    // The previous book's fiction dictionary is dropped — leaving it active is the silent
    // wrong-dictionary failure — but no answer is written, so the offer still stands.
    await waitFor(() => expect(lastSavedActive()).toEqual(['properNouns']));
    expect(setBookBinding).not.toHaveBeenCalled();
    expect(snap().binding).toBeNull();
    expect(reinitializeEngine).toHaveBeenCalledTimes(1);
  });

  test('a bound book applies its own dictionary and reinitializes', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const store = setup();

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    await waitFor(() => expect(lastSavedActive()).toEqual(['properNouns', 'properNouns-f_TapDo']));
    expect(reinitializeEngine).toHaveBeenCalledWith(dictionaries, {
      forceConfigReload: true,
      debugLevel: 0,
    });
    expect(inUse()).toBe('properNouns-f_TapDo');
  });

  test('reopening the book already applied writes nothing and rebuilds nothing', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TapDo'];
    config.ui.defaultQuickAddDictionary = 'properNouns-f_TapDo';
    const store = setup();

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    // A reinitialization here would throw away every translation already on screen for a
    // dictionary set that did not change.
    expect(disk.saveConfiguration).not.toHaveBeenCalled();
    expect(reinitializeEngine).not.toHaveBeenCalled();
  });

  test('the binding becomes the default quick-add target', async () => {
    const store = setup();

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    await waitFor(() =>
      expect(disk.saveConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({ defaultQuickAddDictionary: 'properNouns-f_TapDo' })
      )
    );
  });
});

describe('a config write that lands while a book is being applied', () => {
  test('is kept: the answer is computed from the freshest config, not from an earlier read', async () => {
    await loadAppConfig(); // warm cache: the apply reads it at once, then queues its save
    const held = deferredSave();
    // A toggle from the Configuration tab, saving while the apply has already read.
    const toggle = saveAppConfig({
      engine: { activeProperNouns: ['properNouns', 'properNouns-_AiCap', 'properNouns-_New'] },
    });
    await vi.waitFor(() => expect(disk.saveConfiguration).toHaveBeenCalledTimes(1));

    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle(); // the apply has read config and is queued behind the held save
    held.release();
    await toggle;
    await settle();

    expect(disk.disk.raw.activeProperNouns).toEqual([
      'properNouns',
      'properNouns-_AiCap',
      'properNouns-_New',
      'properNouns-f_TapDo',
    ]);
  });
});

describe('closing a book', () => {
  test('gives up the book, unlocking Configuration, and writes and rebuilds nothing', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(snap().isApplying).toBe(false));
    disk.saveConfiguration.mockClear();
    reinitializeEngine.mockClear();

    store.announceClosedBook();
    await settle();

    expect(snap().openBook).toBeNull();
    expect(snap().openBook).toBeNull();
    expect(snap().binding).toBeNull();
    expect(inUse()).toBeNull();
    expect(disk.saveConfiguration).not.toHaveBeenCalled();
    expect(reinitializeEngine).not.toHaveBeenCalled();
    // The last book's dictionary stays active: closing is not an answer.
    expect(config.engine.activeProperNouns).toContain('properNouns-f_TapDo');
  });

  test('clears a missing dictionary and a failed apply once the queued apply has finished', async () => {
    listProperNounsDictionaryIds.mockResolvedValue(['properNouns']);
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    store.announceClosedBook();
    await settle();

    await waitFor(() => expect(snap().isApplying).toBe(false));
    expect(snap().missingFictionDictionary).toBeNull();
    expect(snap().applyError).toBeNull();
    expect(snap().openBook).toBeNull();
  });

  test('a book announced right after a close keeps its own state', async () => {
    listProperNounsDictionaryIds.mockResolvedValue(['properNouns']);
    const store = setup();
    store.announceClosedBook();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    await settle();

    await waitFor(() => expect(snap().missingFictionDictionary).toBe('properNouns-f_Gone'));
    expect(snap().openBook).not.toBeNull();
  });
});

describe('a bound dictionary that no longer exists', () => {
  test('reads with no fiction dictionary, names the missing one, and keeps the answer', async () => {
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const store = setup();

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    await settle();

    // Writing the missing name into activeProperNouns would load the book with no fiction
    // dictionary and no word of why; so would keeping the previous book's.
    await waitFor(() => expect(lastSavedActive()).toEqual(['properNouns']));
    expect(snap().missingFictionDictionary).toBe('properNouns-f_Gone');
    expect(inUse()).toBeNull();
    // The record is the reader's answer; nothing but the reader rewrites it.
    expect(snap().binding).toEqual({ fictionDictionary: 'properNouns-f_Gone' });
    expect(setBookBinding).not.toHaveBeenCalled();
  });

  test('is checked against disk, not a fiction list that has not loaded yet', async () => {
    const store = setup();

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    await waitFor(() => expect(lastSavedActive()).toContain('properNouns-f_TapDo'));
    expect(snap().missingFictionDictionary).toBeNull();
  });

  test('a failed listing applies the binding as recorded rather than blocking the open', async () => {
    const store = setup();
    listProperNounsDictionaryIds.mockRejectedValueOnce(new Error('io'));

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    await waitFor(() => expect(lastSavedActive()).toContain('properNouns-f_TapDo'));
    expect(snap().missingFictionDictionary).toBeNull();
  });

  test('binding another dictionary clears it', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    await settle();
    await waitFor(() => expect(snap().missingFictionDictionary).toBe('properNouns-f_Gone'));

    await store.bind('properNouns-f_TruTien');

    expect(snap().missingFictionDictionary).toBeNull();
    expect(inUse()).toBe('properNouns-f_TruTien');
  });
});

describe('renaming a dictionary', () => {
  test('carries the new name into book records and the open book, without a rebuild', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(inUse()).toBe('properNouns-f_TapDo'));
    reinitializeEngine.mockClear();

    let response: { success: boolean } | undefined;
    response = await store.renameDictionary('properNouns-f_TapDo', 'properNouns-f_TapDoMoi');

    expect(response?.success).toBe(true);
    expect(renameProperNounsDictionary).toHaveBeenCalledWith(
      'properNouns-f_TapDo',
      'properNouns-f_TapDoMoi'
    );
    expect(renameBoundDictionary).toHaveBeenCalledWith(
      'properNouns-f_TapDo',
      'properNouns-f_TapDoMoi'
    );
    expect(applyRename).toHaveBeenCalledWith([
      ['properNouns-f_TapDo', 'properNouns-f_TapDoMoi'],
      ['patterns-f_TapDo', 'patterns-f_TapDoMoi'],
    ]);
    expect(snap().binding).toEqual({ fictionDictionary: 'properNouns-f_TapDoMoi' });
    expect(inUse()).toBe('properNouns-f_TapDoMoi');
    // Rust already renamed the config's entry, and the dictionary's data is unchanged.
    expect(reinitializeEngine).not.toHaveBeenCalled();
  });

  test('a dictionary no book can bind to has no records to update', async () => {
    const store = setup();

    const response = await store.renameDictionary('properNouns-_AiCap', 'properNouns-_AiCapMoi');

    expect(response).toEqual({ success: true, filesMoved: true });
    expect(renameProperNounsDictionary).toHaveBeenCalledWith(
      'properNouns-_AiCap',
      'properNouns-_AiCapMoi'
    );
    expect(renameBoundDictionary).not.toHaveBeenCalled();
  });

  test('a failed backend rename touches no records', async () => {
    renameProperNounsDictionary.mockResolvedValue({ success: false, error: 'already exists' });
    const store = setup();

    let response: { success: boolean; error?: string } | undefined;
    response = await store.renameDictionary('properNouns-f_TapDo', 'properNouns-f_TruTien');

    expect(response).toEqual({ success: false, error: 'already exists', filesMoved: false });
    expect(renameBoundDictionary).not.toHaveBeenCalled();
    expect(applyRename).not.toHaveBeenCalled();
  });

  test('a failed records rewrite is reported, and the open book shows its binding missing', async () => {
    renameBoundDictionary.mockRejectedValueOnce(new Error('books.json locked'));
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(inUse()).toBe('properNouns-f_TapDo'));

    let response: { success: boolean; error?: string } | undefined;
    response = await store.renameDictionary('properNouns-f_TapDo', 'properNouns-f_TapDoMoi');

    expect(response?.success).toBe(false);
    expect(response?.error).toContain('books.json locked');
    // The file did move, so the record now names a dictionary that does not exist.
    expect(snap().missingFictionDictionary).toBe('properNouns-f_TapDo');
    expect(inUse()).toBeNull();
  });
});

describe('moving a dictionary between fiction and generic', () => {
  /** What Rust's rename does to config: substitute the id wherever it is named. */
  function renameLikeRust(): void {
    renameProperNounsDictionary.mockImplementation(async (oldId: string, newId: string) => {
      config.engine.activeProperNouns = config.engine.activeProperNouns.map((id) =>
        id === oldId ? newId : id
      );
      if (config.ui.defaultQuickAddDictionary === oldId) {
        config.ui.defaultQuickAddDictionary = newId;
      }
      return { success: true };
    });
  }

  test('promoting moves the pair, unbinds the open book, and rebuilds under the new tier', async () => {
    renameLikeRust();
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(inUse()).toBe('properNouns-f_TapDo'));
    reinitializeEngine.mockClear();

    let response: { success: boolean; newId: string | null } | undefined;
    response = await store.moveDictionaryTier('properNouns-f_TapDo');

    expect(response).toEqual({ success: true, filesMoved: true, newId: 'properNouns-_TapDo' });
    expect(applyRename).toHaveBeenCalledWith([
      ['properNouns-f_TapDo', 'properNouns-_TapDo'],
      ['patterns-f_TapDo', 'patterns-_TapDo'],
    ]);
    expect(unbindDictionary).toHaveBeenCalledWith('properNouns-f_TapDo');
    // Answered "none", not unanswered: the offer must not come back.
    expect(snap().binding).toEqual({ fictionDictionary: null });
    expect(config.engine.activeProperNouns).toContain('properNouns-_TapDo');
    // Same list, different tier: its trie priority changed, so the engine is rebuilt.
    expect(reinitializeEngine).toHaveBeenCalledTimes(1);
  });

  test('promoting an inactive fiction dictionary activates it, so its books keep its names', async () => {
    renameLikeRust();
    const store = setup();

    await store.moveDictionaryTier('properNouns-f_TruTien');

    expect(lastSavedActive()).toEqual([
      'properNouns',
      'properNouns-_AiCap',
      'properNouns-_TruTien',
    ]);
    expect(reinitializeEngine).toHaveBeenCalledTimes(1);
  });

  test('demoting with a book open leaves the fiction slice to its binding', async () => {
    renameLikeRust();
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(inUse()).toBe('properNouns-f_TapDo'));

    let response: { success: boolean; newId: string | null } | undefined;
    response = await store.moveDictionaryTier('properNouns-_AiCap');

    expect(response?.newId).toBe('properNouns-f_AiCap');
    expect(unbindDictionary).not.toHaveBeenCalled();
    expect(config.engine.activeProperNouns).toEqual(['properNouns', 'properNouns-f_TapDo']);
    expect(snap().binding).toEqual({ fictionDictionary: 'properNouns-f_TapDo' });
  });

  test('a name the other tier already has is refused before anything moves', async () => {
    renameProperNounsDictionary.mockResolvedValue({ success: false, error: 'already exists' });
    const store = setup();

    let response: { success: boolean; filesMoved: boolean } | undefined;
    response = await store.moveDictionaryTier('properNouns-f_TapDo');

    expect(response).toMatchObject({ success: false, filesMoved: false });
    expect(unbindDictionary).not.toHaveBeenCalled();
    expect(disk.saveConfiguration).not.toHaveBeenCalled();
    expect(reinitializeEngine).not.toHaveBeenCalled();
  });

  test('root and custom dictionaries have no other tier', async () => {
    const store = setup();

    let response: { success: boolean; newId: string | null } | undefined;
    response = await store.moveDictionaryTier('properNouns-Custom');

    expect(response).toMatchObject({ success: false, newId: null });
    expect(renameProperNounsDictionary).not.toHaveBeenCalled();
  });
});

describe('creating a dictionary from the Configuration tab', () => {
  test('creates a fiction pair and loads both halves, binding nothing', async () => {
    const store = setup();

    let response: { success: boolean } | undefined;
    response = await store.createDictionary('properNouns-f_DaiBatHau');

    expect(response?.success).toBe(true);
    expect(createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_DaiBatHau');
    expect(setBookBinding).not.toHaveBeenCalled();
  });

  test('a custom dictionary is one file, created through the same interface', async () => {
    const store = setup();

    const response = await store.createDictionary('properNouns-Custom');

    expect(response.success).toBe(true);
    expect(createProperNounsDictionary).toHaveBeenCalledWith('properNouns-Custom');
    expect(createFictionDictionaryPair).not.toHaveBeenCalled();
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-Custom');
    expect(loadDictionary).toHaveBeenCalledTimes(1);
  });

  test('activates what it creates, in config', async () => {
    const store = setup();
    disk.saveConfiguration.mockClear();

    await store.createDictionary('properNouns-Custom');

    expect(lastSavedActive()).toEqual(['properNouns', 'properNouns-_AiCap', 'properNouns-Custom']);
    // Only the list moves: a quick-add default is not this operation's to change.
    expect(disk.disk.raw.defaultQuickAddDictionary).toBeNull();
    expect(reinitializeEngine).not.toHaveBeenCalled();
  });

  test('with no book open a new fiction dictionary is activated too', async () => {
    const store = setup();

    await store.createDictionary('properNouns-f_DaiBatHau');

    expect(config.engine.activeProperNouns).toContain('properNouns-f_DaiBatHau');
  });

  test('with a book open its binding owns the fiction slice: an unbound fiction dictionary is created, not activated', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    disk.saveConfiguration.mockClear();

    const response = await store.createDictionary('properNouns-f_DaiBatHau');

    expect(response).toEqual({ success: true });
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(config.engine.activeProperNouns).toEqual([
      'properNouns',
      'properNouns-_AiCap',
      'properNouns-f_TapDo',
    ]);
  });

  test('with a book open a generic or custom dictionary still joins the list', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    await store.createDictionary('properNouns-Custom');

    // The binding keeps the fiction slice last; the rest of the list is as it was.
    expect([...config.engine.activeProperNouns].sort()).toEqual(
      ['properNouns', 'properNouns-_AiCap', 'properNouns-Custom', 'properNouns-f_TapDo'].sort()
    );
  });

  test('a dictionary that exists but could not be activated says so, and stays loaded', async () => {
    const store = setup();
    disk.saveConfiguration.mockResolvedValueOnce({ success: false, error: 'disk full' });

    const response = await store.createDictionary('properNouns-Custom');

    expect(response.success).toBe(true);
    expect(response.warning).toContain('properNouns-Custom');
    expect(response.warning).toContain('not activated');
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-Custom');
  });

  test('a failed create activates nothing', async () => {
    createProperNounsDictionary.mockResolvedValue({ success: false, error: 'exists' });
    const store = setup();
    disk.saveConfiguration.mockClear();

    const response = await store.createDictionary('properNouns-Custom');

    expect(response).toEqual({ success: false, error: 'exists' });
    expect(disk.saveConfiguration).not.toHaveBeenCalled();
  });

  test('waits behind the apply in flight, since activating rewrites the same config key', async () => {
    const store = setup();
    const { release } = deferredSave();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();

    const creating = store.createDictionary('properNouns-Custom');
    await settle();
    expect(createProperNounsDictionary).not.toHaveBeenCalled();

    release();
    await creating;
    expect(createProperNounsDictionary).toHaveBeenCalledWith('properNouns-Custom');
  });
});

describe('answering the dialog', () => {
  test('binding a dictionary persists the answer before applying it', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();
    disk.saveConfiguration.mockClear();

    await store.bind('properNouns-f_TapDo');

    expect(setBookBinding).toHaveBeenCalledWith('fp1', {
      fictionDictionary: 'properNouns-f_TapDo',
    });
    expect(lastSavedActive()).toEqual(['properNouns', 'properNouns-_AiCap', 'properNouns-f_TapDo']);
  });

  test('"no fiction dictionary" is persisted as an answer, not as an absent one', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();

    await store.bind(null);

    expect(setBookBinding).toHaveBeenCalledWith('fp1', { fictionDictionary: null });
    expect(snap().binding).toEqual({ fictionDictionary: null });
  });

  test('bind does nothing when no book is open', async () => {
    const store = setup();
    await store.bind('properNouns-f_TapDo');
    expect(setBookBinding).not.toHaveBeenCalled();
  });
});

describe('creating a dictionary from the dialog', () => {
  test('creates the pair, loads both halves, then binds to it', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();

    await store.createAndBind('Đại bát hầu');

    // Diacritics folded, so the suggestion derived from the file name can match it later.
    expect(createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_DaiBatHau');
    expect(setBookBinding).toHaveBeenCalledWith('fp1', {
      fictionDictionary: 'properNouns-f_DaiBatHau',
    });
  });

  test('writes the active list once, through the bind — creating activates nothing itself', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();
    disk.saveConfiguration.mockClear();

    await store.createAndBind('Đại bát hầu');

    expect(disk.saveConfiguration).toHaveBeenCalledTimes(1);
    expect(lastSavedActive()).toEqual([
      'properNouns',
      'properNouns-_AiCap',
      'properNouns-f_DaiBatHau',
    ]);
  });

  test('the rebuild sees the pair it just loaded, read from the Dictionary Store at call time', async () => {
    // The Dictionary Store gains the pair as each load resolves; no snapshot taken earlier
    // ever has it — the case where nothing refreshes between the load and the rebuild.
    const loaded: Record<string, object> = { properNouns: {} };
    loadDictionary.mockImplementation(async (id: string) => {
      loaded[id] = {};
    });
    getDictionaries.mockImplementation(() => ({ ...loaded }));
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();
    reinitializeEngine.mockClear();

    await store.createAndBind('Đại bát hầu');

    expect(reinitializeEngine).toHaveBeenCalledTimes(1);
    expect(Object.keys(reinitializeEngine.mock.calls[0][0])).toEqual(
      expect.arrayContaining(['properNouns-f_DaiBatHau', 'patterns-f_DaiBatHau'])
    );
    // clearAllMocks keeps implementations: put the shared defaults back.
    loadDictionary.mockResolvedValue(undefined);
    getDictionaries.mockImplementation(() => dictionaries);
  });

  test('a failed create binds nothing and surfaces the error', async () => {
    createFictionDictionaryPair.mockResolvedValue({ success: false, error: 'disk full' });
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();

    await store.createAndBind('DaiBatHau');

    expect(setBookBinding).not.toHaveBeenCalled();
    expect(snap().error).toBe('disk full');
  });

  test('a name with no letters to slug is refused before it reaches the backend', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();

    await store.createAndBind('卡徒');

    expect(createFictionDictionaryPair).not.toHaveBeenCalled();
    expect(snap().error).toContain('卡徒');
    // A refused name is a dialog message, not a failed apply: nothing changed.
    expect(snap().applyError).toBeNull();
  });
});

describe('the quick-add view', () => {
  /** Config as a failed apply leaves it: still naming the previous novel. */
  function staleConfig() {
    config.engine.activeProperNouns = [
      'properNouns',
      'properNouns-_AiCap',
      'properNouns-f_TruTien',
    ];
    config.ui.defaultQuickAddDictionary = 'properNouns-f_TruTien';
  }

  test('with no book open, it is config as loaded', async () => {
    staleConfig();
    const store = setup();
    let view;
    view = await store.loadQuickAddView();
    expect(view).toEqual({
      defaultQuickAddDictionary: 'properNouns-f_TruTien',
      activeProperNouns: ['properNouns', 'properNouns-_AiCap', 'properNouns-f_TruTien'],
    });
  });

  test("with a bound book open, the fiction slice is the binding's, whatever config says", async () => {
    // The apply fails, so config keeps naming the previous novel.
    reinitializeEngine.mockRejectedValueOnce(new Error('engine exploded'));
    staleConfig();
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(snap().applyError).toBe('engine exploded'));
    // The failed apply did write config; put the previous novel back, as a failed write would.
    staleConfig();

    let view;
    view = await store.loadQuickAddView();
    expect(view).toEqual({
      defaultQuickAddDictionary: 'properNouns-f_TapDo',
      activeProperNouns: ['properNouns', 'properNouns-_AiCap', 'properNouns-f_TapDo'],
    });
  });

  test('an unanswered book offers no fiction dictionary, keeping the non-fiction ones', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();
    await waitFor(() => expect(snap().isApplying).toBe(false));
    staleConfig();

    let view;
    view = await store.loadQuickAddView();
    expect(view).toEqual({
      defaultQuickAddDictionary: null,
      activeProperNouns: ['properNouns', 'properNouns-_AiCap'],
    });
  });

  test('a bound dictionary that no longer exists files nothing', async () => {
    listProperNounsDictionaryIds.mockResolvedValue(['properNouns', 'properNouns-_AiCap']);
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_Gone' });
    await settle();
    await waitFor(() => expect(snap().missingFictionDictionary).toBe('properNouns-f_Gone'));

    let view: { activeProperNouns: string[] } | null = null;
    view = await store.loadQuickAddView();
    expect(view!.activeProperNouns).not.toContain('properNouns-f_Gone');
  });

  test('after the book closes, it is config as loaded again', async () => {
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();
    await waitFor(() => expect(snap().isApplying).toBe(false));
    store.announceClosedBook();
    await settle();
    staleConfig();

    let view: { activeProperNouns: string[] } | null = null;
    view = await store.loadQuickAddView();
    expect(view!.activeProperNouns).toContain('properNouns-f_TruTien');
  });

  test("any tab's Cmd-5 files under the open book after a failed apply, not the stale config", async () => {
    // The Translator and the Dictionary tab both decide Cmd-5 as `quickAddTarget` over
    // `loadQuickAddView` (useDictionaryModals, TabbedInterface) — the same composition here.
    reinitializeEngine.mockRejectedValueOnce(new Error('engine exploded'));
    const store = setup();
    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(snap().applyError).toBe('engine exploded'));
    staleConfig();

    const loaded = {
      properNouns: {},
      'properNouns-f_TapDo': {},
      'properNouns-f_TruTien': {},
    };
    let target;
    target = quickAddTarget('properNoun', await store.loadQuickAddView(), loaded);
    expect(target).toEqual({ kind: 'open', dictionaryId: 'properNouns-f_TapDo' });
  });
});

describe('a failed apply', () => {
  test('on open, it is reported as an apply error, and a later successful bind clears it', async () => {
    reinitializeEngine.mockRejectedValueOnce(new Error('engine exploded'));
    config.engine.activeProperNouns = ['properNouns', 'properNouns-f_TruTien'];
    const store = setup();

    store.announceOpenBook(BOOK, { fictionDictionary: 'properNouns-f_TapDo' });
    await settle();
    await waitFor(() => expect(snap().applyError).toBe('engine exploded'));

    config.engine.activeProperNouns = ['properNouns'];
    await store.bind('properNouns-f_TruTien');
    expect(snap().applyError).toBeNull();
  });

  test('a failed save of the answer is not an apply error: the engine was never touched', async () => {
    setBookBinding.mockRejectedValueOnce(new Error('disk full'));
    const store = setup();
    store.announceOpenBook(BOOK, null);
    await settle();

    await store.bind('properNouns-f_TapDo');

    expect(snap().error).toBe('disk full');
    expect(snap().applyError).toBeNull();
  });
});
