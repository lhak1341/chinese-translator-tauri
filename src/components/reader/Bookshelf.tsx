import React, { useMemo, useState } from 'react';
import {
  FolderOpen,
  Loader,
  RefreshCw,
  AlertCircle,
  FileWarning,
  LayoutGrid,
  List,
  BookOpen,
  Trash2,
} from 'lucide-react';
import type { BookRecord, LibraryBook } from '../../types/ReaderTypes';
import { useBookRecords } from '../../hooks/useBookRecords';
import { bindingLabel } from '../../utils/reader/FictionDictionarySuggestion';
import { patternInEffect } from '../../utils/reader/ChapterNavigation';
import { forgetUnavailableBook } from '../../utils/reader/ReconcileLibrary';
import type { ShelfBook, ShelfOutcome, UnavailableBook } from '../../utils/reader/ReconcileLibrary';
import { logger } from '../../utils/logger';
import toast from '../../utils/toast';
import { extractErrorMessage } from '../../utils/errorHelpers';
import styles from '../../styles/Reader.module.css';
import { SearchFilterHeader } from '../SearchFilterHeader';

interface BookshelfProps {
  /** The last scan's outcome (`scanShelf`), or `null` before the first one finishes. */
  outcome: ShelfOutcome | null;
  libraryPath: string;
  isUsingDefaultPath: boolean;
  isLoading: boolean;
  /** Something that failed apart from the scan — opening a book, saving the folder. Shown
   * above the shelf, which stays as the last scan left it. */
  notice: string | null;
  /** File name of the book currently loaded, if any. */
  openFileName: string | null;
  /** The book opened most recently, if it is still on the shelf — offered above the list
   * as "Continue reading". */
  continueBook: ShelfBook | null;
  onOpen: (book: LibraryBook) => void;
  onChooseFolder: () => void;
  onUseDefaultFolder: () => void;
  onRescan: () => void;
}

type ShelfLayout = 'list' | 'card';

const SHELF_LAYOUT_STORAGE_KEY = 'reader.shelfLayout';

function loadShelfLayout(): ShelfLayout {
  try {
    return localStorage.getItem(SHELF_LAYOUT_STORAGE_KEY) === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Splits a "<Vietnamese title> <Chinese title>" filename stem at the first Han
 * character, e.g. "Đại bát hầu 大泼猴" → { vietnamese: "Đại bát hầu", chinese: "大泼猴" }.
 * Returns `null` when the title has no Han text (nothing to split) or is Han-only
 * (no Vietnamese half). */
function splitBookTitle(title: string): { vietnamese: string; chinese: string } | null {
  const chars = Array.from(title);
  const hanIndex = chars.findIndex((ch) => /\p{Script=Han}/u.test(ch));
  if (hanIndex <= 0) return null;
  const vietnamese = chars.slice(0, hanIndex).join('').trim();
  const chinese = chars.slice(hanIndex).join('').trim();
  if (!vietnamese || !chinese) return null;
  return { vietnamese, chinese };
}

/** What a book shows for progress, binding and chapters when the scan could not be
 * reconciled against the records (`recordsUnknown`) — unknown, not "Not started". */
const UNKNOWN_LABEL = '—';
const NO_UNAVAILABLE: UnavailableBook[] = [];
const NO_BOOKS: LibraryBook[] = [];

/** "Not started" / "line N of M" / "in progress" (line count not cached yet — the book
 * hasn't been opened, just seen on a scan). Read off the live record, never a copy taken
 * at scan time, so Back from reading shows where the reader got to. */
function formatProgress(record: BookRecord | undefined): string {
  if (!record?.position) return 'Not started';
  if (record.lineCount > 0) {
    return `Line ${(record.position.line + 1).toLocaleString()} of ${record.lineCount.toLocaleString()}`;
  }
  return 'In progress';
}

/** The fiction dictionary a book is bound to — see `bindingLabel`. A book the shelf has
 * no record for was never asked either. */
function formatBinding(record: BookRecord | undefined): string {
  return bindingLabel(record?.binding ?? null, 'Not bound');
}

/** How many chapters the book's outline has: the hit count of the pattern in effect,
 * the reader's override or else election's. `null` for a book never opened, or one where
 * nothing cleared election — no outline is not zero chapters. */
function formatChapterCount(record: BookRecord | undefined): string | null {
  const outline = record?.chapterOutline;
  if (!outline) return null;
  const pattern = patternInEffect(record.manualChapterPattern, outline.pattern);
  const count = outline.candidates.find((candidate) => candidate.pattern === pattern)?.hitCount;
  if (count === undefined) return null;
  return `${count.toLocaleString()} ${count === 1 ? 'chapter' : 'chapters'}`;
}

/**
 * What one shelf row shows for a book. The one place the unknown-identity rule lives: when
 * the scan could not be reconciled against the records, `recordOf` has no record to give and
 * every column reads `UNKNOWN_LABEL` rather than "Not started" or "Not bound". `chapters` is
 * `null` for a book with no outline; each layout decides how to show `UNKNOWN_LABEL` (the
 * list prints it, the card drops the row — see the card's footer).
 */
function rowLabels(
  record: BookRecord | undefined,
  identityKnown: boolean
): { binding: string; chapters: string | null; progress: string } {
  if (!identityKnown) {
    return { binding: UNKNOWN_LABEL, chapters: UNKNOWN_LABEL, progress: UNKNOWN_LABEL };
  }
  return {
    binding: formatBinding(record),
    chapters: formatChapterCount(record),
    progress: formatProgress(record),
  };
}

/**
 * The library as a destination: every text file in the library folder, one row each.
 * Opening a book replaces the shelf; Back brings it here again with the book still
 * loaded.
 */
const Bookshelf: React.FC<BookshelfProps> = ({
  outcome,
  libraryPath,
  isUsingDefaultPath,
  isLoading,
  notice,
  openFileName,
  continueBook,
  onOpen,
  onChooseFolder,
  onUseDefaultFolder,
  onRescan,
}) => {
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<ShelfLayout>(loadShelfLayout);
  const records = useBookRecords();
  const books: readonly LibraryBook[] =
    outcome && outcome.kind !== 'scanFailed' ? outcome.books : NO_BOOKS;
  const scannedUnavailable = outcome?.kind === 'loaded' ? outcome.unavailableBooks : NO_UNAVAILABLE;
  // Read against the live records, so a forgotten book leaves the shelf at once, without a
  // rescan: the scan's list is a snapshot, the records are not.
  const unavailableBooks = useMemo(
    () => scannedUnavailable.filter((book) => records[book.fingerprint] !== undefined),
    [scannedUnavailable, records]
  );
  const [confirmingForget, setConfirmingForget] = useState<string | null>(null);
  const forget = (fingerprint: string): void => {
    setConfirmingForget(null);
    void (async () => {
      try {
        await forgetUnavailableBook(fingerprint);
      } catch (cause) {
        logger.error('Failed to forget a book:', cause);
        toast.error(`Couldn't forget the book: ${extractErrorMessage(cause)}`);
      }
    })();
  };
  const scanError = outcome?.kind === 'scanFailed' ? outcome.error : null;
  const identityKnown = outcome?.kind !== 'recordsUnknown';
  /** A shelf book's record — `undefined` for one never recorded, or when no identity is
   * known (then every column shows `UNKNOWN_LABEL` instead). */
  const recordOf = (book: LibraryBook): BookRecord | undefined =>
    identityKnown ? records[(book as ShelfBook).fingerprint] : undefined;

  const toggleLayout = () => {
    const next: ShelfLayout = layout === 'list' ? 'card' : 'list';
    setLayout(next);
    try {
      localStorage.setItem(SHELF_LAYOUT_STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only; the toggle still works for this session.
    }
  };

  const filteredBooks = useMemo(() => {
    // NFC both sides: a title from a macOS filename is NFD ("a" + U+0300), the typed query is NFC ("à").
    const fold = (s: string) => s.normalize('NFC').toLowerCase();
    const query = fold(search.trim());
    if (!query) return books;
    return books.filter((book) => fold(book.title).includes(query));
  }, [books, search]);

  return (
    <div className={styles.shelf}>
      <div className={styles.shelfHeader}>
        <div className={styles.shelfHeaderLeft}>
          <h2 className={styles.shelfTitle}>Library</h2>
          <span className={styles.shelfPath} title={libraryPath}>
            {libraryPath || 'Resolving…'}
            {isUsingDefaultPath && <span className={styles.defaultBadge}>default</span>}
          </span>
        </div>
        <div className={styles.shelfActions}>
          <button
            onClick={toggleLayout}
            className={styles.secondaryButton}
            title={layout === 'list' ? 'Switch to card view' : 'Switch to list view'}
          >
            {layout === 'list' ? <LayoutGrid size={14} /> : <List size={14} />}
            {layout === 'list' ? 'Cards' : 'List'}
          </button>
          <button onClick={onRescan} className={styles.secondaryButton} title="Rescan the folder">
            <RefreshCw size={14} />
            Rescan
          </button>
          {!isUsingDefaultPath && (
            <button
              onClick={onUseDefaultFolder}
              className={styles.secondaryButton}
              title="Go back to the default fiction folder"
            >
              Use default
            </button>
          )}
          <button onClick={onChooseFolder} className={`primary ${styles.primaryButton}`}>
            <FolderOpen size={14} />
            Change folder
          </button>
        </div>
      </div>

      {notice && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {notice}
        </div>
      )}

      {scanError && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {scanError}
        </div>
      )}

      {!identityKnown && !isLoading && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          Reading progress couldn't be loaded — Rescan to retry.
        </div>
      )}

      {/* No identity guard: `continueBook` is a ShelfBook, which only a `loaded` outcome has
          (`findLastBook`), so its record is always known. */}
      {!isLoading && continueBook && (
        <button
          className={styles.continueCard}
          onClick={() => onOpen(continueBook)}
          title={`Continue reading ${continueBook.title}`}
        >
          <BookOpen size={18} className={styles.continueIcon} />
          <span className={styles.continueLabel}>Continue reading</span>
          <span className={styles.continueTitle}>{continueBook.title}</span>
          <span className={styles.bookProgress}>
            {formatProgress(records[continueBook.fingerprint])}
          </span>
        </button>
      )}

      {!isLoading && books.length > 0 && (
        <SearchFilterHeader
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Filter by title…"
          searchAriaLabel="Filter library by title"
          showFilterButton={false}
          filterOpen={false}
          filterActive={false}
          onToggleFilter={() => {}}
          filterButtonLabel=""
        />
      )}

      {isLoading ? (
        <div className={styles.centeredNotice}>
          <Loader size={18} className="animate-spin" />
          <span>Scanning the library…</span>
        </div>
      ) : books.length === 0 && !scanError ? (
        <div className={styles.centeredNotice}>
          <span>No .txt files in this folder.</span>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className={styles.centeredNotice}>
          <span>No books match "{search}".</span>
        </div>
      ) : layout === 'card' ? (
        <div className={styles.bookGrid}>
          {filteredBooks.map((book) => {
            const isOpen = openFileName === book.fileName;
            const split = splitBookTitle(book.title);
            const labels = rowLabels(recordOf(book), identityKnown);
            const chapterCount = labels.chapters === UNKNOWN_LABEL ? null : labels.chapters;
            return (
              <button
                key={book.fileName}
                className={`${styles.bookCard} ${isOpen ? styles.bookCardOpen : ''}`}
                onClick={() => onOpen(book)}
              >
                {isOpen && (
                  <div className={styles.bookCardHeader}>
                    <span className={styles.openBadge}>open</span>
                  </div>
                )}
                {split ? (
                  <div className={styles.bookCardTitle}>
                    <span className={styles.bookCardTitleVi} title={split.vietnamese}>
                      {split.vietnamese}
                    </span>
                    <span className={styles.bookCardTitleZh} title={split.chinese}>
                      {split.chinese}
                    </span>
                  </div>
                ) : (
                  <div className={styles.bookCardTitle}>
                    <span className={styles.bookCardTitleVi} title={book.title}>
                      {book.title}
                    </span>
                  </div>
                )}
                <div className={styles.bookCardFooter}>
                  <span className={styles.bookMeta}>{labels.binding}</span>
                  {/* A flex column, not a grid: an empty span here would only add a gap. */}
                  {chapterCount && <span className={styles.bookMeta}>{chapterCount}</span>}
                  <span className={styles.bookProgress}>{labels.progress}</span>
                  <span className={styles.bookMeta}>{formatSize(book.sizeBytes)}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className={styles.bookList}>
          {filteredBooks.map((book) => {
            const isOpen = openFileName === book.fileName;
            const split = splitBookTitle(book.title);
            const labels = rowLabels(recordOf(book), identityKnown);
            return (
              <li key={book.fileName}>
                <button
                  className={`${styles.bookRow} ${isOpen ? styles.bookRowOpen : ''}`}
                  onClick={() => onOpen(book)}
                >
                  {split ? (
                    <>
                      <span className={styles.bookTitleVi} title={split.vietnamese}>
                        {split.vietnamese}
                      </span>
                      <span className={styles.bookTitleZh} title={split.chinese}>
                        {split.chinese}
                      </span>
                    </>
                  ) : (
                    <span className={styles.bookTitle}>{book.title}</span>
                  )}
                  <span className={styles.bookMeta}>{labels.binding}</span>
                  <span className={styles.bookMeta}>{labels.chapters}</span>
                  <span className={styles.bookProgress}>{labels.progress}</span>
                  <span className={styles.bookMeta}>{formatSize(book.sizeBytes)}</span>
                  {isOpen && <span className={styles.openBadge}>open</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* No identity guard: `unavailableBooks` is empty unless the outcome is `loaded`. */}
      {unavailableBooks.length > 0 && (
        <div className={styles.unavailableSection}>
          <div className={styles.unavailableTitle}>Unavailable</div>
          {unavailableBooks.map((book) => {
            const chapterCount = formatChapterCount(records[book.fingerprint]);
            const isConfirming = confirmingForget === book.fingerprint;
            return (
              <div key={book.fingerprint} className={styles.unavailableRow}>
                <FileWarning size={16} className={styles.unavailableIcon} />
                <div className={styles.unavailableInfo}>
                  <span className={styles.bookTitle}>{book.title}</span>
                  <span className={styles.unavailablePath} title={book.lastKnownPath}>
                    Last seen at {book.lastKnownPath}
                  </span>
                  <span className={styles.unavailableMeta}>
                    <span>{formatBinding(records[book.fingerprint])}</span>
                    {chapterCount && <span>{chapterCount}</span>}
                  </span>
                </div>
                {isConfirming ? (
                  <div className={styles.unavailableActions}>
                    <span className={styles.unavailableMeta}>Forget its progress and binding?</span>
                    <button
                      onClick={() => forget(book.fingerprint)}
                      className={styles.secondaryButton}
                      aria-label={`Forget ${book.title}`}
                    >
                      Forget
                    </button>
                    <button
                      onClick={() => setConfirmingForget(null)}
                      className={styles.secondaryButton}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingForget(book.fingerprint)}
                    className={styles.secondaryButton}
                    title="Remove this book from the shelf. Its reading position and binding are lost."
                  >
                    <Trash2 size={14} />
                    Forget…
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Bookshelf;
