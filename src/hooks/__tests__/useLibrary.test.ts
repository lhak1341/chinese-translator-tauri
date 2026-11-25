/**
 * The library folder setting, moved here from the tab-level `ReaderTab.library.test.tsx`
 * (architecture review 2026-09-29, candidate #5 grilling). What a scan comes to is
 * `scanShelf`'s, tested in `scanShelf.test.ts`; this is the hook around it. The setting is
 * read from a fake config.json behind the real `appConfig`, because the hook renders it
 * through the config subscription.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLibrary } from '../useLibrary';
import { installFakeConfigDisk } from '../../test/fakeConfigDisk';

const scanShelf = vi.hoisted(() => vi.fn());
vi.mock('../../utils/reader/ReconcileLibrary', () => ({ scanShelf }));
const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);
vi.mock('../../utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let disk: ReturnType<typeof installFakeConfigDisk>;

beforeEach(() => {
  vi.clearAllMocks();
  disk = installFakeConfigDisk({ libraryPath: '/saved' });
  scanShelf.mockImplementation(async (path: string | null) => ({
    kind: 'loaded',
    libraryPath: path ?? '/default',
    books: [],
    unavailableBooks: [],
  }));
});

async function renderLibrary() {
  const hook = renderHook(() => useLibrary());
  await waitFor(() => expect(hook.result.current.isScanning).toBe(false));
  return hook;
}

describe('useLibrary', () => {
  test('scans the configured folder once config has loaded', async () => {
    const { result } = await renderLibrary();
    expect(scanShelf).toHaveBeenCalledTimes(1);
    expect(scanShelf).toHaveBeenCalledWith('/saved');
    expect(result.current.libraryPath).toBe('/saved');
    expect(result.current.isUsingDefaultPath).toBe(false);
    expect(result.current.outcome?.kind).toBe('loaded');
  });

  test('an unreadable config.json scans the default folder', async () => {
    disk.loadConfiguration.mockResolvedValueOnce({ success: false, error: 'unreadable' } as never);
    const { result } = await renderLibrary();
    expect(scanShelf).toHaveBeenCalledWith(null);
    expect(result.current.isUsingDefaultPath).toBe(true);
  });

  test('a failed scan keeps the last folder it resolved', async () => {
    const { result } = await renderLibrary();
    scanShelf.mockResolvedValueOnce({ kind: 'scanFailed', error: 'folder gone' });
    await act(() => result.current.rescan());
    expect(result.current.outcome).toEqual({ kind: 'scanFailed', error: 'folder gone' });
    expect(result.current.libraryPath).toBe('/saved');
  });

  test('choosing a folder saves it, then scans it once, through the saved setting', async () => {
    dialog.open.mockResolvedValue('/chosen');
    const { result } = await renderLibrary();

    await act(() => result.current.changeFolder());

    expect(disk.disk.raw.libraryPath).toBe('/chosen');
    await waitFor(() => expect(result.current.libraryPath).toBe('/chosen'));
    expect(disk.saveConfiguration.mock.invocationCallOrder[0]).toBeLessThan(
      scanShelf.mock.invocationCallOrder[1]
    );
    expect(scanShelf).toHaveBeenCalledTimes(2);
    expect(scanShelf).toHaveBeenLastCalledWith('/chosen');
    expect(result.current.isUsingDefaultPath).toBe(false);
  });

  test('cancelling the dialog changes nothing', async () => {
    dialog.open.mockResolvedValue(null);
    const { result } = await renderLibrary();

    await act(() => result.current.changeFolder());

    expect(disk.saveConfiguration).not.toHaveBeenCalled();
    expect(scanShelf).toHaveBeenCalledTimes(1);
  });

  test('a folder that cannot be saved is not scanned; the shelf stays and says why', async () => {
    dialog.open.mockResolvedValue('/chosen');
    disk.saveConfiguration.mockResolvedValueOnce({
      success: false,
      error: "Couldn't read config.json; not saving over it",
    } as never);
    const { result } = await renderLibrary();

    await act(() => result.current.changeFolder());

    expect(result.current.folderError).toBe("Couldn't read config.json; not saving over it");
    expect(result.current.outcome?.kind).toBe('loaded');
    expect(result.current.configuredPath).toBe('/saved');
    expect(scanShelf).toHaveBeenCalledTimes(1);

    // The next scan clears it.
    await act(() => result.current.rescan());
    expect(result.current.folderError).toBeNull();
  });

  test('using the default folder saves null, then scans the default', async () => {
    const { result } = await renderLibrary();

    await act(() => result.current.resetToDefaultFolder());

    expect(disk.disk.raw.libraryPath).toBeNull();
    await waitFor(() => expect(scanShelf).toHaveBeenLastCalledWith(null));
    expect(result.current.isUsingDefaultPath).toBe(true);
  });

  test('a default that cannot be saved changes nothing, as a chosen folder does not, and says why', async () => {
    disk.saveConfiguration.mockResolvedValueOnce({ success: false, error: 'disk full' } as never);
    const { result } = await renderLibrary();

    await act(() => result.current.resetToDefaultFolder());

    expect(result.current.folderError).toBe('disk full');
    expect(result.current.isUsingDefaultPath).toBe(false);
    expect(result.current.configuredPath).toBe('/saved');
    expect(result.current.libraryPath).toBe('/saved');
    expect(scanShelf).toHaveBeenCalledTimes(1);
  });
});

describe('overlapping scans', () => {
  // Rescan, Choose folder and Use default stay enabled while a scan runs, so a second scan
  // can start before the first resolves. Whichever *started* last is what the shelf shows.
  const loaded = (libraryPath: string) => ({
    kind: 'loaded',
    libraryPath,
    books: [],
    unavailableBooks: [],
  });

  function heldScan() {
    let release: (outcome: ReturnType<typeof loaded>) => void = () => {};
    scanShelf.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    return { release: (outcome: ReturnType<typeof loaded>) => release(outcome) };
  }

  test('a slow scan of the old folder resolving last does not replace the new folder', async () => {
    dialog.open.mockResolvedValue('/chosen');
    const { result } = await renderLibrary();
    const slow = heldScan();

    let rescanning!: Promise<void>;
    act(() => {
      rescanning = result.current.rescan();
    });
    await act(() => result.current.changeFolder());
    await waitFor(() => expect(result.current.libraryPath).toBe('/chosen'));

    await act(async () => {
      slow.release(loaded('/saved'));
      await rescanning;
    });

    expect(result.current.libraryPath).toBe('/chosen');
    expect(result.current.outcome).toEqual(loaded('/chosen'));
    expect(result.current.isUsingDefaultPath).toBe(false);
    expect(result.current.isScanning).toBe(false);
  });

  test('an earlier rescan resolving after a later one does not replace it', async () => {
    const { result } = await renderLibrary();
    const slow = heldScan();

    let first!: Promise<void>;
    act(() => {
      first = result.current.rescan();
    });
    scanShelf.mockResolvedValueOnce(loaded('/second'));
    await act(() => result.current.rescan());

    await act(async () => {
      slow.release(loaded('/first'));
      await first;
    });

    expect(result.current.outcome).toEqual(loaded('/second'));
    expect(result.current.libraryPath).toBe('/second');
  });

  test('stays scanning until the newest scan lands, not the first to finish', async () => {
    const { result } = await renderLibrary();
    const slow = heldScan();
    let newest!: Promise<void>;
    act(() => {
      void result.current.rescan();
    });
    // The second scan is the one in flight when the first finishes.
    let release2: (outcome: ReturnType<typeof loaded>) => void = () => {};
    scanShelf.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release2 = resolve;
        })
    );
    act(() => {
      newest = result.current.rescan();
    });

    await act(async () => {
      slow.release(loaded('/first'));
    });
    expect(result.current.isScanning).toBe(true);

    await act(async () => {
      release2(loaded('/second'));
      await newest;
    });
    expect(result.current.isScanning).toBe(false);
    expect(result.current.libraryPath).toBe('/second');
  });
});
