import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAppConfig } from '../utils/appConfig';
import { useAppConfig } from './useAppConfig';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import { scanShelf, type ShelfOutcome } from '../utils/reader/ReconcileLibrary';

export interface Library {
  /** The last scan's outcome, or `null` before the first one finishes. */
  outcome: ShelfOutcome | null;
  /** The folder the last successful scan read — what "default" resolved to, when it is. */
  libraryPath: string;
  /** The folder setting: `null` means the default — what `open_book` resolves against. */
  configuredPath: string | null;
  isUsingDefaultPath: boolean;
  isScanning: boolean;
  /** Choosing a folder, or the default, failed before it could be scanned (the setting could
   * not be saved). The setting and the shelf on screen stay; cleared when the next scan starts. */
  folderError: string | null;
  rescan: () => Promise<void>;
  changeFolder: () => Promise<void>;
  resetToDefaultFolder: () => Promise<void>;
}

/**
 * The Reader's library: the folder setting, and the shelf its last scan produced
 * (`scanShelf`). The setting is rendered from config (`useAppConfig`), never copied, so the
 * shelf, a book open and the Candidate finder's background all read the one saved folder.
 * A scan starts when the setting is first known and whenever it changes; the folder buttons
 * only save it, so a save that fails starts nothing. The library folder changes a few times a
 * year, so there is no watcher and no polling — Rescan is the refresh path.
 */
export function useLibrary(): Library {
  const { config, isLoading: configLoading } = useAppConfig();
  // An unreadable config.json runs on the defaults, so this is `null`: the default folder.
  const configuredPath = config.reader.libraryPath;
  const [libraryPath, setLibraryPath] = useState('');
  const [outcome, setOutcome] = useState<ShelfOutcome | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [folderError, setFolderError] = useState<string | null>(null);

  /** Counts scans as they start. Rescan, Choose folder and Use default stay enabled while a
   * scan runs, so two can overlap; whichever *started* last is what the shelf shows, however
   * the two resolve, or an old folder's slow scan would replace the one just chosen. */
  const latestScanRef = useRef(0);

  const scan = useCallback(async (path: string | null): Promise<void> => {
    const id = (latestScanRef.current += 1);
    setIsScanning(true);
    setFolderError(null);
    const next = await scanShelf(path);
    if (latestScanRef.current !== id) return;
    if (next.kind !== 'scanFailed') setLibraryPath(next.libraryPath);
    setOutcome(next);
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (configLoading) return;
    void scan(configuredPath);
  }, [configLoading, configuredPath, scan]);

  const rescan = useCallback(() => scan(configuredPath), [scan, configuredPath]);

  const changeFolder = useCallback(async (): Promise<void> => {
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const chosen = await openDialog({
        directory: true,
        multiple: false,
        title: 'Choose the library folder',
      });
      if (typeof chosen !== 'string') return;
      // The config subscription carries the new setting back, and the effect scans it.
      await saveAppConfig({ reader: { libraryPath: chosen } });
    } catch (cause) {
      logger.error('Failed to change the library folder:', cause);
      setFolderError(extractErrorMessage(cause));
    }
  }, []);

  const resetToDefaultFolder = useCallback(async (): Promise<void> => {
    try {
      await saveAppConfig({ reader: { libraryPath: null } });
    } catch (cause) {
      logger.error('Failed to reset the library folder:', cause);
      setFolderError(extractErrorMessage(cause));
    }
  }, []);

  return {
    outcome,
    libraryPath,
    configuredPath,
    isUsingDefaultPath: configuredPath === null,
    isScanning,
    folderError,
    rescan,
    changeFolder,
    resetToDefaultFolder,
  };
}
