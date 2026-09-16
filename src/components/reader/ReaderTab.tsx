import React, { useCallback, useEffect, useState } from 'react';
import tauriAPI from '../../tauriAPI';
import { loadAppConfig, saveAppConfig } from '../../utils/appConfig';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import type { EncodingReport, LibraryBook, OpenBook } from '../../types/ReaderTypes';
import Bookshelf from './Bookshelf';
import BookReader from './BookReader';
import EncodingPrompt from './EncodingPrompt';
import styles from '../../styles/Reader.module.css';

/** The book the reader is currently in, if any. */
interface OpenState {
  book: OpenBook;
  encoding: EncodingReport;
}

/** A book that would not decode: its name plus the report explaining why. */
interface EncodingChoiceState {
  fileName: string;
  title: string;
  report: EncodingReport;
}

/**
 * The Reader tab.
 *
 * Bookshelf model: the library is a destination, opening a book replaces the shelf, and
 * Back returns to it. Back is pure navigation — the book stays decoded in the Rust-side
 * cache, so returning to it is instant. A book closes only when a different one opens.
 */
const ReaderTab: React.FC = () => {
  const [libraryPath, setLibraryPath] = useState<string>('');
  const [configuredPath, setConfiguredPath] = useState<string | null>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [encodingChoice, setEncodingChoice] = useState<EncodingChoiceState | null>(null);
  const [isReading, setIsReading] = useState(false);

  const scan = useCallback(async (path: string | null): Promise<void> => {
    setIsScanning(true);
    try {
      const result = await tauriAPI.scanLibrary(path);
      setLibraryPath(result.libraryPath);
      setBooks(result.books);
      setShelfError(null);
    } catch (cause) {
      logger.error('Failed to scan the library:', cause);
      setBooks([]);
      setShelfError(extractErrorMessage(cause));
    } finally {
      setIsScanning(false);
    }
  }, []);

  // One load of the configured path, then one scan. The library folder changes a few
  // times a year, so there is no watcher and no polling — the Rescan button is the
  // refresh path.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let path: string | null = null;
      try {
        const config = await loadAppConfig();
        path = config.reader.libraryPath;
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

  const openBook = useCallback(
    async (book: LibraryBook, encodingOverride?: string): Promise<void> => {
      // Returning to a book that is already decoded costs nothing — don't re-open it.
      if (!encodingOverride && open && open.book.fileName === book.fileName) {
        setEncodingChoice(null);
        setIsReading(true);
        return;
      }
      setShelfError(null);
      try {
        const result = await tauriAPI.openBook(
          book.fileName,
          configuredPath,
          encodingOverride ?? null
        );
        if (result.status === 'needsEncoding' || !result.book) {
          setEncodingChoice({
            fileName: book.fileName,
            title: book.title,
            report: result.encoding,
          });
          setOpen(null);
          setIsReading(true);
          return;
        }
        setEncodingChoice(null);
        setOpen({ book: result.book, encoding: result.encoding });
        setIsReading(true);
      } catch (cause) {
        logger.error('Failed to open the book:', cause);
        setShelfError(extractErrorMessage(cause));
        setIsReading(false);
      }
    },
    [configuredPath, open]
  );

  const chooseEncoding = useCallback(
    (label: string): void => {
      if (!encodingChoice) return;
      const book = books.find((candidate) => candidate.fileName === encodingChoice.fileName);
      if (!book) return;
      void openBook(book, label);
    },
    [books, encodingChoice, openBook]
  );

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
      setShelfError(extractErrorMessage(cause));
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

  const backToShelf = useCallback((): void => {
    // Pure navigation: the book stays decoded so coming back is instant.
    setIsReading(false);
  }, []);

  if (isReading && encodingChoice) {
    return (
      <div className={styles.container}>
        <EncodingPrompt
          title={encodingChoice.title}
          report={encodingChoice.report}
          onChoose={chooseEncoding}
          onBack={backToShelf}
        />
      </div>
    );
  }

  if (isReading && open) {
    return (
      <div className={styles.container}>
        <BookReader book={open.book} encoding={open.encoding} onBack={backToShelf} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Bookshelf
        books={books}
        libraryPath={libraryPath}
        isUsingDefaultPath={configuredPath === null}
        isLoading={isScanning}
        error={shelfError}
        openFileName={open?.book.fileName ?? null}
        onOpen={(book) => void openBook(book)}
        onChooseFolder={() => void changeFolder()}
        onUseDefaultFolder={() => void resetToDefaultFolder()}
        onRescan={() => void scan(configuredPath)}
      />
    </div>
  );
};

export default ReaderTab;
