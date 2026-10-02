import React, { useSyncExternalStore } from 'react';
import { vi } from 'vitest';
import { BookBindingProvider } from '../../BookBindingContext';
import { createDictionaryStore } from '../../dictionary/DictionaryStore';
import { getDictionaryTypes } from '../../dictionary/DictionaryTypes';
import { fakeDictionaryDisk } from '../../dictionary/__tests__/fakeDictionaryDisk';
import { installFakeConfigDisk } from '../../../test/fakeConfigDisk';
import {
  hasPairedPatterns,
  isPatternsDict,
  isProperNounsDict,
  tierOf,
  toPatternsId,
} from '../../../utils/dictionary/DictionaryIdClassifier';

/**
 * The Configuration tab over the real Dictionary Store and the real binding provider, with
 * fakes only where the app leaves the process: the Rust commands (`window.electronAPI`) and
 * `config.json`. A create or rename is then judged by what the tab shows once the two stores
 * have done their parts, not by what a mocked context returned.
 *
 * The test file mocks `DictionaryContext` to `useDictionary` of this harness (the real
 * provider needs history, toasts and a selection this tab never touches), and `EngineContext`,
 * the book records and the engine module as `BookBindingContext.test.tsx` does.
 */

/** `ids` with each paired dictionary's patterns half added — what a migrated install has. */
export function withPatterns(ids: string[]): string[] {
  return ids.flatMap((id) => (hasPairedPatterns(id) ? [id, toPatternsId(id)] : [id]));
}

export interface StoresHarness {
  store: ReturnType<typeof createDictionaryStore>;
  /** What is on disk: the dictionary files, by id. */
  files: Record<string, object>;
  /** The Rust commands, as spies. Replace one's behaviour with `mockResolvedValueOnce`. */
  api: Record<string, ReturnType<typeof vi.fn>>;
  disk: ReturnType<typeof installFakeConfigDisk>;
  useDictionary: () => unknown;
  /** Lists and loads every dictionary, as the provider does at startup. Call before rendering. */
  load: () => Promise<void>;
  Wrapper: React.FC<{ children: React.ReactNode }>;
}

export function installRealStores(options: {
  /** Every dictionary file that exists, patterns halves included (`withPatterns`). */
  ids: string[];
  config: Record<string, unknown>;
}): StoresHarness {
  const fake = fakeDictionaryDisk(Object.fromEntries(options.ids.map((id) => [id, {}])));
  const { files } = fake;
  let disk!: ReturnType<typeof installFakeConfigDisk>;
  const raw = () => disk.disk.raw as { activeProperNouns: string[] } & Record<string, unknown>;

  const idsWhere = (test: (id: string) => boolean) => Object.keys(files).filter(test);
  const create = (...created: string[]) => {
    for (const id of created) files[id] = {};
    return { success: true };
  };

  const api = {
    listProperNounsDictionaries: vi.fn(async () => ({
      success: true,
      dictionaries: idsWhere(isProperNounsDict),
    })),
    listFictionPatternDictionaries: vi.fn(async () => ({
      success: true,
      dictionaries: idsWhere((id) => isPatternsDict(id) && tierOf(id) !== 'root'),
    })),
    createStructuralPatternsDictionary: vi.fn(async (id: string) => create(id)),
    // Rust only creates the files; activating them is the binding store's config write.
    createProperNounsDictionary: vi.fn(async (id: string) => create(id)),
    createFictionDictionaryPair: vi.fn(async (id: string) => create(id, toPatternsId(id))),
    // Rust moves each half and substitutes the id wherever config names it.
    renameProperNounsDictionary: vi.fn(async (oldId: string, newId: string) => {
      const moves: [string, string][] = [[oldId, newId]];
      if (hasPairedPatterns(oldId)) moves.push([toPatternsId(oldId), toPatternsId(newId)]);
      if (moves.some(([, to]) => to in files)) {
        return { success: false, error: 'Dictionary already exists' };
      }
      for (const [from, to] of moves) {
        files[to] = files[from];
        delete files[from];
      }
      const swap = (id: string) => (id === oldId ? newId : id);
      raw().activeProperNouns = raw().activeProperNouns.map(swap);
      raw().defaultQuickAddDictionary = swap(raw().defaultQuickAddDictionary as string);
      return { success: true };
    }),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = api;
  disk = installFakeConfigDisk(options.config);

  // The real listing (`getDictionaryTypes`, over the fake Rust list commands), so a created or
  // renamed id reaches the store the way it does in the app.
  const store = createDictionaryStore({
    ...fake.deps,
    listDictionaries: () => getDictionaryTypes() as never,
  });
  const applyRename = (renames: ReadonlyArray<readonly [string, string]>) => store.rename(renames);
  const getDictionaries = () => store.getSnapshot().dictionaries;

  const useDictionary = () => {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    return {
      dictionaries: snapshot.dictionaries,
      dictionaryTypes: snapshot.dictionaryTypes,
      isLoading: false,
      loadDictionary: store.reload,
      applyRename,
      getDictionaries,
    };
  };

  return {
    store,
    files,
    api,
    disk,
    useDictionary,
    load: async () => {
      await store.loadAll();
    },
    Wrapper: ({ children }) => <BookBindingProvider>{children}</BookBindingProvider>,
  };
}
