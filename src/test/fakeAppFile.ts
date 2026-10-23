import { vi } from 'vitest';

type IpcName = keyof typeof window.electronAPI;

/**
 * A fake App file (GLOSSARY.md "App file") behind one `window.electronAPI` load/save pair —
 * `loadBookRecords`/`saveBookRecords`, `loadTransformRules`/`saveTransformRules` and the
 * like — for tests that want the real backend (its cache, lock and commit queue) over a disk
 * that just works. Load answers `{ success: true, data }`; save stores what it is given and
 * answers `{ success: true }`.
 *
 * `load` and `save` are the installed `vi.fn`s, so a test that needs a failure or a malformed
 * payload overrides one (`load.mockResolvedValueOnce(...)`) and a call-count assert still
 * works. Mutate `disk.data` to play a write from outside the app.
 *
 * Call it after the test has assigned its own `window.electronAPI`: it adds to that object.
 */
export function installFakeAppFile<T>(
  ipc: { load: IpcName; save: IpcName },
  initial: T,
  clone: (value: T) => T = structuredClone
) {
  const disk = { data: clone(initial) };
  const load = vi.fn(async () => ({ success: true, data: clone(disk.data) }));
  const save = vi.fn(async (data: T) => {
    disk.data = clone(data);
    return { success: true };
  });
  const api = ((window as unknown as { electronAPI?: object }).electronAPI ??= {});
  Object.assign(api, { [ipc.load]: load, [ipc.save]: save });
  return { disk, load, save };
}
