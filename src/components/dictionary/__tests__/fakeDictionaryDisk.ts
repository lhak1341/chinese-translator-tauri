import { vi } from 'vitest';
import type { DictionaryStoreDeps } from '../DictionaryStore';
import type { Dictionaries } from '../../../utils/dictionary/DictionaryEdit';
import type { DictionaryTypesCollection } from '../../../types/ComponentTypes';
import type { DictionaryData } from '../../../types/DictionaryTypes';
import type { DictionaryOperationResult } from '../../../types/ElectronTypes';

/**
 * A fake dictionary directory for Dictionary Store tests: `files` is what is on disk, and an
 * id in `unreadable` exists but fails to load. Every read and save copies, like IPC does.
 */
export function fakeDictionaryDisk(initial: Dictionaries) {
  const files: Dictionaries = structuredClone(initial);
  const unreadable = new Set<string>();

  const deps = {
    listDictionaries: vi.fn(async (): Promise<DictionaryTypesCollection> => {
      const ids = [...new Set([...Object.keys(files), ...unreadable])];
      return Object.fromEntries(
        ids.map((id) => [id, { id, label: id, description: '', data: null }])
      );
    }),
    load: vi.fn(async (ids: string[]) => {
      const loadedDictionaries: Dictionaries = {};
      const stillFailedIds: string[] = [];
      for (const id of ids) {
        if (unreadable.has(id)) stillFailedIds.push(id);
        else loadedDictionaries[id] = structuredClone(files[id] ?? {});
      }
      return { loadedDictionaries, stillFailedIds, total: ids.length };
    }),
    save: vi.fn(async (id: string, data: DictionaryData) => {
      files[id] = structuredClone(data);
      return { success: true };
    }),
    // An import rewrites the files; a test that wants that sets `files` inside its own mock.
    importFiles: vi.fn(async (): Promise<DictionaryOperationResult> => ({
      success: true,
      message: 'Imported',
    })),
  } satisfies DictionaryStoreDeps;

  return { files, unreadable, deps };
}
