import { useCallback, useEffect, useState } from 'react';
import { loadAppConfig, saveAppConfig } from '../utils/appConfig';
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
  /** Choosing a folder failed before it could be scanned (the setting could not be saved).
   * The shelf on screen stays; cleared when the next scan starts. */
  folderError: string | null;
  rescan: () => Promise<void>;
  changeFolder: () => Promise<void>;
  resetToDefaultFolder: () => Promise<void>;
}

/**
 * The Reader's library: the folder setting, and the shelf its last scan produced
 * (`scanShelf`). One load of the configured path, then one scan. The library folder changes
 * a few times a year, so there is no watcher and no polling — Rescan is the refresh path.
 */
export function useLibrary(): Library {
  const [configuredPath, setConfiguredPath] = useState<string | null>(null);
  const [libraryPath, setLibraryPath] = useState('');
  const [outcome, setOutcome] = useState<ShelfOutcome | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [folderError, setFolderError] = useState<string | null>(null);

  const scan = useCallback(async (path: string | null): Promise<void> => {
    setIsScanning(true);
    setFolderError(null);
    const next = await scanShelf(path);
    if (next.kind !== 'scanFailed') setLibraryPath(next.libraryPath);
    setOutcome(next);
    setIsScanning(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let path: string | null = null;
      try {
        path = (await loadAppConfig()).reader.libraryPath;
      } catch (cause) {
        logger.warn('Falling back to the default library folder:', cause);
      }
      if (cancelled) return;
      setConfiguredPath(path);
      await scan(path);
    })();
    return () => {
      cancelled = true;
    };
  }, [scan]);

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
      await saveAppConfig({ reader: { libraryPath: chosen } });
      setConfiguredPath(chosen);
      await scan(chosen);
    } catch (cause) {
      logger.error('Failed to change the library folder:', cause);
      setFolderError(extractErrorMessage(cause));
    }
  }, [scan]);

  const resetToDefaultFolder = useCallback(async (): Promise<void> => {
    try {
      await saveAppConfig({ reader: { libraryPath: null } });
    } catch (cause) {
      logger.error('Failed to reset the library folder:', cause);
    }
    setConfiguredPath(null);
    await scan(null);
  }, [scan]);

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
