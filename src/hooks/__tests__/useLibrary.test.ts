/**
 * The library folder setting, moved here from the tab-level `ReaderTab.library.test.tsx`
 * (architecture review 2026-09-29, candidate #5 grilling). What a scan comes to is
 * `scanShelf`'s, tested in `scanShelf.test.ts`; this is the hook around it.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLibrary } from '../useLibrary';

const scanShelf = vi.hoisted(() => vi.fn());
vi.mock('../../utils/reader/ReconcileLibrary', () => ({ scanShelf }));
const appConfig = vi.hoisted(() => ({ loadAppConfig: vi.fn(), saveAppConfig: vi.fn() }));
vi.mock('../../utils/appConfig', () => appConfig);
const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);
vi.mock('../../utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  appConfig.loadAppConfig.mockResolvedValue({ reader: { libraryPath: '/saved' } });
  appConfig.saveAppConfig.mockResolvedValue(undefined);
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
  test('scans the configured folder on mount', async () => {
    const { result } = await renderLibrary();
    expect(scanShelf).toHaveBeenCalledWith('/saved');
    expect(result.current.libraryPath).toBe('/saved');
    expect(result.current.isUsingDefaultPath).toBe(false);
    expect(result.current.outcome?.kind).toBe('loaded');
  });

  test('a config that fails to load scans the default folder', async () => {
    appConfig.loadAppConfig.mockRejectedValue(new Error('unreadable'));
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

  test('choosing a folder saves it, then scans it', async () => {
    dialog.open.mockResolvedValue('/chosen');
    const { result } = await renderLibrary();

    await act(() => result.current.changeFolder());

    expect(appConfig.saveAppConfig).toHaveBeenCalledWith({ reader: { libraryPath: '/chosen' } });
    expect(appConfig.saveAppConfig.mock.invocationCallOrder[0]).toBeLessThan(
      scanShelf.mock.invocationCallOrder[1]
    );
    expect(scanShelf).toHaveBeenLastCalledWith('/chosen');
    expect(result.current.isUsingDefaultPath).toBe(false);
  });

  test('cancelling the dialog changes nothing', async () => {
    dialog.open.mockResolvedValue(null);
    const { result } = await renderLibrary();

    await act(() => result.current.changeFolder());

    expect(appConfig.saveAppConfig).not.toHaveBeenCalled();
    expect(scanShelf).toHaveBeenCalledTimes(1);
  });

  test('a folder that cannot be saved is not scanned; the shelf stays and says why', async () => {
    dialog.open.mockResolvedValue('/chosen');
    appConfig.saveAppConfig.mockRejectedValue(
      new Error("Couldn't read config.json; not saving over it")
    );
    const { result } = await renderLibrary();

    await act(() => result.current.changeFolder());

    expect(result.current.folderError).toBe("Couldn't read config.json; not saving over it");
    expect(result.current.outcome?.kind).toBe('loaded');
    expect(scanShelf).toHaveBeenCalledTimes(1);

    // The next scan clears it.
    await act(() => result.current.rescan());
    expect(result.current.folderError).toBeNull();
  });

  test('using the default folder saves null and scans the default, even if the save fails', async () => {
    appConfig.saveAppConfig.mockRejectedValue(new Error('disk full'));
    const { result } = await renderLibrary();

    await act(() => result.current.resetToDefaultFolder());

    expect(appConfig.saveAppConfig).toHaveBeenCalledWith({ reader: { libraryPath: null } });
    expect(scanShelf).toHaveBeenLastCalledWith(null);
    expect(result.current.isUsingDefaultPath).toBe(true);
  });
});
