import React, { useCallback, useEffect, useRef, useState } from 'react';
import tauriAPI from '../../tauriAPI';
import { loadAppConfig, saveAppConfig } from '../../utils/appConfig';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import type {
  BookRecord,
  EncodingChoiceTrigger,
  EncodingReport,
  LibraryBook,
  OpenBook,
} from '../../types/ReaderTypes';
import {
  loadBookRecords,
  recordBookOpened,
  withBookRecordsLock,
} from '../../utils/reader/BookRecordsBackend';
import { emptyBookRecord } from '../../utils/reader/BookRecord';
import {
  reconcileLibraryScan,
  type ShelfBook,
  type UnavailableBook,
} from '../../utils/reader/ReconcileLibrary';
import { useBookBinding } from '../BookBindingContext';
import type { OpenBookIdentity } from '../BookBindingContext';
import { useReaderEngine } from '../../hooks/useReaderEngine';
import Bookshelf from './Bookshelf';
import BookReader from './BookReader';
import EncodingPrompt from './EncodingPrompt';
import styles from '../../styles/Reader.module.css';

interface ReaderTabProps {
  /** Whether the Reader is the visible tab. Every tab stays mounted across a switch, so
   * this is what tells `BookReader` to flush a pending position write on switch-away. */
  isActive: boolean;
}

/** The book the reader is currently in, if any. */
interface OpenState {
  book: OpenBook;
  encoding: EncodingReport;
  /** Its record as of the latest open or reopen. Not kept current while reading — the
   * position and outline are written straight to disk from elsewhere — which is why a
   * reopen re-reads it rather than trusting this copy. */
  record: BookRecord;
}

/** A book waiting on the reader's choice of encoding: its name plus the report to choose
 * from. */
interface EncodingChoiceState {
  fileName: string;
  title: string;
  report: EncodingReport;
  trigger: EncodingChoiceTrigger;
}

/** The slice of an open book that `announceOpenBook` needs — same shape whether the book
 * just finished decoding or was already open and is only being re-announced. */
function identityOf(book: OpenBook): OpenBookIdentity {
  return { fingerprint: book.fingerprint, fileName: book.fileName, title: book.title };
}

/**
 * The Reader tab.
 *
 * Bookshelf model: the library is a destination, opening a book replaces the shelf, and
 * Back returns to it. Back is pure navigation — the book stays decoded in the Rust-side
 * cache, so returning to it is instant. A book closes only when a different one opens.
 */
const ReaderTab: React.FC<ReaderTabProps> = ({ isActive }) => {
  const [libraryPath, setLibraryPath] = useState<string>('');
  const [configuredPath, setConfiguredPath] = useState<string | null>(null);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [unavailableBooks, setUnavailableBooks] = useState<UnavailableBook[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [encodingChoice, setEncodingChoice] = useState<EncodingChoiceState | null>(null);
  const [isReading, setIsReading] = useState(false);
  const { announceOpenBook } = useBookBinding();
  // The Reader's engine queue lives here, above every `BookReader` instance — see
  // `useReaderEngine`.
  const readerEngine = useReaderEngine();

  const scan = useCallback(async (path: string | null): Promise<void> => {
    setIsScanning(true);
    try {
      const result = await tauriAPI.scanLibrary(path);
      setLibraryPath(result.libraryPath);
      setShelfError(null);
      // Reconciliation (lazy fingerprint recompute, relink-on-move, unavailable
      // marking) runs after every scan, not just the first — a rescan is the only
      // refresh path this feature has, so it must be the one that catches a book that
      // moved or came back since the last scan.
      try {
        const { shelfBooks, unavailableBooks: missing } = await reconcileLibraryScan(
          result.books,
          path
        );
        setBooks(shelfBooks);
        setUnavailableBooks(missing);
      } catch (cause) {
        logger.error('Failed to reconcile book records:', cause);
        // Reconciliation failure shouldn't blank the shelf — show the scan as-is, with
        // no progress info, rather than nothing.
        setBooks(result.books.map((book) => ({ ...book, fingerprint: '' })));
      }
    } catch (cause) {
      logger.error('Failed to scan the library:', cause);
      setBooks([]);
      setUnavailableBooks([]);
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

  // Guards against a double-click firing two concurrent `open_book` calls for the same
  // file — each does a full read + decode on the Rust side, so a duplicate is wasted
  // work, not just a UI oddity.
  const openingFileNameRef = useRef<string | null>(null);

  const openBook = useCallback(
    async (book: LibraryBook, encodingOverride?: string): Promise<void> => {
      // Returning to a book that is already decoded costs nothing — don't re-open it. Its
      // record is re-read rather than trusting the `open` state's own copy: the position
      // and outline are written straight to disk from elsewhere (scroll debounce, an
      // outline override) without ever flowing back into this component's state. Read
      // under the lock: Back queued the final position write as the reader unmounted, and
      // a reopen faster than that write would otherwise restore the position before it.
      if (!encodingOverride && open && open.book.fileName === book.fileName) {
        setEncodingChoice(null);
        try {
          const { records } = await withBookRecordsLock(loadBookRecords);
          const record = records[open.book.fingerprint];
          if (record) {
            // Re-announcing on a reopen is what makes returning to a book you had bound
            // put its dictionaries back after reading something else. The apply is a
            // no-op when the active list already matches, so a Back-then-forward costs
            // nothing.
            announceOpenBook(identityOf(open.book), record.binding);
            setOpen((previous) => (previous ? { ...previous, record } : previous));
          }
        } catch (cause) {
          logger.error('Failed to refresh the book record on reopen:', cause);
        }
        setIsReading(true);
        return;
      }
      if (openingFileNameRef.current === book.fileName) return;
      openingFileNameRef.current = book.fileName;
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
            trigger: 'uncertain',
          });
          setOpen(null);
          setIsReading(true);
          return;
        }
        setEncodingChoice(null);
        // Refresh (or create) this book's observations now that its true line count and
        // encoding are known — preserves any existing reading position and chapter outline.
        // A failed write leaves the record at "nothing known" rather than blocking the open.
        let record: BookRecord = emptyBookRecord(result.book.fingerprint);
        try {
          record = await recordBookOpened(result.book.fingerprint, {
            title: result.book.title,
            lastKnownPath: result.book.fileName,
            lineCount: result.book.lineCount,
            encodingLabel: result.encoding.label,
            sizeBytes: result.book.sizeBytes,
            modifiedMs: book.modifiedMs,
          });
        } catch (cause) {
          logger.error('Failed to record the book as opened:', cause);
        }
        // Outside that try on purpose. If the record write failed, the new book must still
        // take authority: `record` is then `emptyBookRecord`, whose `binding` is `null`
        // ("never answered"), which applies the
        // general dictionaries only and shows the offer. Leaving the *previous* book
        // authoritative instead would keep its `properNouns-f_*` active over this novel —
        // the silent wrong-dictionary failure the binding exists to prevent.
        announceOpenBook(identityOf(result.book), record.binding);
        setOpen({ book: result.book, encoding: result.encoding, record });
        setIsReading(true);
      } catch (cause) {
        logger.error('Failed to open the book:', cause);
        setShelfError(extractErrorMessage(cause));
        setIsReading(false);
      } finally {
        openingFileNameRef.current = null;
      }
    },
    [announceOpenBook, configuredPath, open]
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

  /** For a book that opened on a confident but wrong guess — the low-confidence prompt is
   * the only other way to choose, and a confident guess never reaches it. Shows the same
   * choice over the open book's own report; choosing reopens it through `chooseEncoding`.
   * The prompt replaces the reader, so `BookReader` unmounts and flushes the position
   * before the new decode's record is read. */
  const reopenWithEncoding = useCallback((): void => {
    if (!open) return;
    setEncodingChoice({
      fileName: open.book.fileName,
      title: open.book.title,
      report: open.encoding,
      trigger: 'chosen',
    });
  }, [open]);

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

  /** Open another book by file name — what the Reader's command palette switches with.
   * Routed through the same `openBook` a shelf click uses, so the new book arrives with
   * its own binding announced and its position restored. */
  const switchBook = useCallback(
    (fileName: string): void => {
      const book = books.find((candidate) => candidate.fileName === fileName);
      if (!book) return;
      void openBook(book);
    },
    [books, openBook]
  );

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
          trigger={encodingChoice.trigger}
          onChoose={chooseEncoding}
          onBack={backToShelf}
        />
      </div>
    );
  }

  if (isReading && open) {
    return (
      <div className={styles.container}>
        {/* One instance per book: a switch remounts it, so nothing a book left behind —
            the panels' measured row heights, the scroll offset, a cache keyed by line range
            — reaches the next one (ADR-050). A new encoding for the same file needs no key
            of its own: it goes through `EncodingPrompt`, which unmounts this first. */}
        <BookReader
          key={open.book.fingerprint}
          book={open.book}
          encoding={open.encoding}
          record={open.record}
          isActive={isActive}
          engine={readerEngine}
          books={books}
          onSwitchBook={switchBook}
          onReopenWithEncoding={reopenWithEncoding}
          onBack={backToShelf}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Bookshelf
        books={books}
        unavailableBooks={unavailableBooks}
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
