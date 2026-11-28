import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import { loadAppConfig, saveAppConfig } from '../../utils/appConfig';
import { findLastBook } from '../../utils/reader/LastBook';
import type {
  BookRecord,
  EncodingChoiceTrigger,
  EncodingReport,
  LibraryBook,
  OpenBook,
} from '../../types/ReaderTypes';
import {
  readSettledRecords,
  recordBookOpened,
  setOmissions,
} from '../../utils/reader/BookRecordsBackend';
import { emptyBookRecord } from '../../utils/reader/BookRecord';
import { useBookBinding } from '../BookBindingContext';
import type { OpenBookIdentity } from '../BookBindingContext';
import { useReaderEngine } from '../../hooks/useReaderEngine';
import { useLibrary } from '../../hooks/useLibrary';
import Bookshelf from './Bookshelf';
import BookReader from './BookReader';
import type { ShelfNavigation } from '../../utils/reader/PaletteCommands';
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
const NO_BOOKS: LibraryBook[] = [];

/** Remember what is on screen for the next launch — `lastBook` and `resumeOnLaunch` in
 * `ReaderConfig`. Best-effort: a failed write costs only the next launch's resume. */
function rememberReading(reader: { lastBook?: string; resumeOnLaunch: boolean }): void {
  void (async () => {
    try {
      await saveAppConfig({ reader });
    } catch (cause) {
      logger.warn('Could not remember the open book for the next launch:', cause);
    }
  })();
}

const ReaderTab: React.FC<ReaderTabProps> = ({ isActive }) => {
  const library = useLibrary();
  const { configuredPath } = library;
  const books: LibraryBook[] =
    library.outcome && library.outcome.kind !== 'scanFailed' ? library.outcome.books : NO_BOOKS;
  /** Opening a book failed — shown on the shelf, separate from the scan's own state. */
  const [openError, setOpenError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [encodingChoice, setEncodingChoice] = useState<EncodingChoiceState | null>(null);
  const [isReading, setIsReading] = useState(false);
  /** Set between an Omissions save and the record re-read that follows it: the reader is
   * unmounted meanwhile, so its final position write is queued before the re-read. */
  const [isReloadingBook, setIsReloadingBook] = useState(false);
  /** Fingerprint of the book opened most recently, this session or a past one — what the
   * shelf's "Continue reading" card offers. */
  const [lastBook, setLastBook] = useState<string | null>(null);
  // Read by the launch resume, which must not replace a book the reader opened while the
  // config load was still in flight.
  const isReadingRef = useRef(false);
  isReadingRef.current = isReading;
  const { announceOpenBook, announceClosedBook } = useBookBinding();
  // The Reader's engine calls are built here, above every `BookReader` instance — see
  // `useReaderEngine`.
  const readerEngine = useReaderEngine();

  // Guards against a double-click firing two concurrent `open_book` calls for the same
  // file — each does a full read + decode on the Rust side, so a duplicate is wasted
  // work, not just a UI oddity.
  const openingFileNameRef = useRef<string | null>(null);
  // Latest started wins: a shelf click during a slow decode (the launch resume's, typically)
  // starts a second open, and whichever resolved last used to take the screen and the binding.
  // Each open takes a number and lands only if no open started after it.
  const latestOpenRef = useRef(0);

  /** Every way off a book — Back, the encoding prompt, a failed open — lets go of the
   * fiction slice and stops the next launch resuming it. The caller decides the screen. */
  const leaveReading = useCallback((): void => {
    announceClosedBook();
    rememberReading({ resumeOnLaunch: false });
  }, [announceClosedBook]);

  const openBook = useCallback(
    async (book: LibraryBook, encodingOverride?: string): Promise<void> => {
      // Returning to a book that is already decoded costs nothing — don't re-open it. Its
      // record is re-read rather than trusting the `open` state's own copy: the position
      // and outline are written straight to disk from elsewhere (scroll debounce, an
      // outline override) without ever flowing back into this component's state. Read it
      // settled: Back queued the final position write as the reader unmounted, and a reopen
      // faster than that write would otherwise restore the position before it.
      if (!encodingOverride && open && open.book.fileName === book.fileName) {
        const openId = ++latestOpenRef.current;
        setEncodingChoice(null);
        try {
          const records = await readSettledRecords();
          if (openId !== latestOpenRef.current) return;
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
        if (openId !== latestOpenRef.current) return;
        rememberReading({ lastBook: open.book.fingerprint, resumeOnLaunch: true });
        setLastBook(open.book.fingerprint);
        setIsReading(true);
        return;
      }
      if (openingFileNameRef.current === book.fileName) return;
      openingFileNameRef.current = book.fileName;
      const openId = ++latestOpenRef.current;
      setOpenError(null);
      try {
        const result = await window.electronAPI.openBook(
          book.fileName,
          configuredPath,
          encodingOverride ?? null
        );
        if (result.status === 'needsEncoding' || !result.book) {
          if (openId !== latestOpenRef.current) return;
          setEncodingChoice({
            fileName: book.fileName,
            title: book.title,
            report: result.encoding,
            trigger: 'uncertain',
          });
          setOpen(null);
          // No book on screen while the encoding is chosen, so the previous one stops
          // holding the fiction slice; picking an encoding announces the new book.
          leaveReading();
          setIsReading(true);
          return;
        }
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
        // The record write lands either way (it is true of the file); the screen does not.
        if (openId !== latestOpenRef.current) return;
        setEncodingChoice(null);
        // Outside that try on purpose. If the record write failed, the new book must still
        // take authority: `record` is then `emptyBookRecord`, whose `binding` is `null`
        // ("never answered"), which applies the
        // general dictionaries only and shows the offer. Leaving the *previous* book
        // authoritative instead would keep its `properNouns-f_*` active over this novel —
        // the silent wrong-dictionary failure the binding exists to prevent.
        announceOpenBook(identityOf(result.book), record.binding);
        setOpen({ book: result.book, encoding: result.encoding, record });
        rememberReading({ lastBook: result.book.fingerprint, resumeOnLaunch: true });
        setLastBook(result.book.fingerprint);
        setIsReading(true);
        // The Candidate finder's spread gate counts this book from now on. Its text is in
        // memory, so this is the cheap moment; a failure only defers it to the first run.
        const openedFingerprint = result.book.fingerprint;
        void (async () => {
          try {
            await window.electronAPI.indexOpenBook(openedFingerprint);
          } catch (cause) {
            logger.warn('Failed to index the opened book:', cause);
          }
        })();
      } catch (cause) {
        logger.error('Failed to open the book:', cause);
        if (openId !== latestOpenRef.current) return;
        // A failed switch lands on the shelf, so the book still decoded behind it lets go
        // too, the same as Back.
        leaveReading();
        setOpenError(extractErrorMessage(cause));
        setIsReading(false);
      } finally {
        // Only this open's own claim: a later open of another file holds the ref now.
        if (openingFileNameRef.current === book.fileName) openingFileNameRef.current = null;
      }
    },
    [announceOpenBook, configuredPath, leaveReading, open]
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

  /** Save the open book's Omissions, then reload it with them: unmount the reader (which
   * queues its position write), read the record settled, and mount it again. The decoded
   * text and the binding are untouched, so nothing is re-announced. A failed save rejects
   * and leaves the book as it was. */
  const changeOmissions = useCallback(
    async (omissions: string[]): Promise<void> => {
      if (!open) return;
      await setOmissions(open.book.fingerprint, omissions);
      setOpen((previous) =>
        previous ? { ...previous, record: { ...previous.record, omissions } } : previous
      );
      setIsReloadingBook(true);
    },
    [open]
  );

  const reloadFingerprint = isReloadingBook ? (open?.book.fingerprint ?? null) : null;
  useEffect(() => {
    if (!isReloadingBook) return;
    let cancelled = false;
    void (async () => {
      try {
        const records = await readSettledRecords();
        const record = reloadFingerprint ? records[reloadFingerprint] : undefined;
        if (!cancelled && record) {
          setOpen((previous) =>
            previous && previous.book.fingerprint === record.fingerprint
              ? { ...previous, record }
              : previous
          );
        }
      } catch (cause) {
        // The saved Omissions are already in `open`; only the position may be a write old.
        logger.error('Failed to re-read the book record after changing its omissions:', cause);
      } finally {
        if (!cancelled) setIsReloadingBook(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReloadingBook, reloadFingerprint]);

  const backToShelf = useCallback((): void => {
    // The book stays decoded so coming back is instant, but it stops holding the fiction
    // slice of the active dictionaries — reopening it announces it again.
    leaveReading();
    setIsReading(false);
  }, [leaveReading]);

  /**
   * Launch resume: once the first scan lands, reopen the book that was on screen when the
   * app last quit. Quitting runs no Back, so `resumeOnLaunch` is still true then; a reader
   * who went Back to the shelf first finds the shelf. Runs once — a rescan is not a launch.
   */
  const resumeCheckedRef = useRef(false);
  useEffect(() => {
    if (resumeCheckedRef.current || library.outcome === null) return;
    resumeCheckedRef.current = true;
    const outcome = library.outcome;
    void (async () => {
      try {
        const { reader } = await loadAppConfig();
        setLastBook(reader.lastBook);
        if (!reader.resumeOnLaunch || isReadingRef.current) return;
        const book = findLastBook(outcome, reader.lastBook);
        if (book) await openBook(book);
      } catch (cause) {
        logger.warn('Could not reopen the last book:', cause);
      }
    })();
  }, [library.outcome, openBook]);

  const continueBook = useMemo(
    () => findLastBook(library.outcome, lastBook),
    [library.outcome, lastBook]
  );

  /** What the open book's palette offers from the shelf — one record, so `BookReader`
   * carries it without reading it. */
  const shelf = useMemo<ShelfNavigation>(
    () => ({ books, switchBook, reopenWithEncoding }),
    [books, switchBook, reopenWithEncoding]
  );

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

  if (isReading && open && isReloadingBook) {
    return <div className={styles.container} />;
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
          shelf={shelf}
          onBack={backToShelf}
          onOmissionsChange={changeOmissions}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Bookshelf
        outcome={library.outcome}
        libraryPath={library.libraryPath}
        isUsingDefaultPath={library.isUsingDefaultPath}
        isLoading={library.isScanning}
        notice={openError ?? library.folderError}
        openFileName={open?.book.fileName ?? null}
        continueBook={continueBook}
        onOpen={(book) => void openBook(book)}
        onChooseFolder={() => void library.changeFolder()}
        onUseDefaultFolder={() => void library.resetToDefaultFolder()}
        onRescan={() => void library.rescan()}
      />
    </div>
  );
};

// Memoized: every tab stays mounted, so without it each tab switch re-renders this tab too.
export default React.memo(ReaderTab);
