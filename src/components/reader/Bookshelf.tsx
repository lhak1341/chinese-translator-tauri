import React, { useMemo, useState } from 'react';
import {
  FolderOpen,
  Loader,
  RefreshCw,
  AlertCircle,
  FileWarning,
  LayoutGrid,
  List,
} from 'lucide-react';
import type { BookRecord, LibraryBook } from '../../types/ReaderTypes';
import { useBookRecords } from '../../hooks/useBookRecords';
import { bindingLabel } from '../../utils/reader/FictionDictionarySuggestion';
import type { ShelfBook, UnavailableBook } from '../../utils/reader/ReconcileLibrary';
import styles from '../../styles/Reader.module.css';
import { SearchFilterHeader } from '../SearchFilterHeader';

interface BookshelfProps {
  books: ShelfBook[];
  /** Previously-known books this scan couldn't find, anywhere under the library root. */
  unavailableBooks: UnavailableBook[];
  libraryPath: string;
  isUsingDefaultPath: boolean;
  isLoading: boolean;
  error: string | null;
  /** File name of the book currently loaded, if any. */
  openFileName: string | null;
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
  const pattern = record.manualChapterPattern ?? outline.pattern;
  const count = outline.candidates.find((candidate) => candidate.pattern === pattern)?.hitCount;
  if (count === undefined) return null;
  return `${count.toLocaleString()} ${count === 1 ? 'chapter' : 'chapters'}`;
}

/**
 * The library as a destination: every text file in the library folder, one row each.
 * Opening a book replaces the shelf; Back brings it here again with the book still
 * loaded.
 */
const Bookshelf: React.FC<BookshelfProps> = ({
  books,
  unavailableBooks,
  libraryPath,
  isUsingDefaultPath,
  isLoading,
  error,
  openFileName,
  onOpen,
  onChooseFolder,
  onUseDefaultFolder,
  onRescan,
}) => {
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<ShelfLayout>(loadShelfLayout);
  const records = useBookRecords();

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
    const query = search.trim().toLowerCase();
    if (!query) return books;
    return books.filter((book) => book.title.toLowerCase().includes(query));
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

      {error && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error}
        </div>
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
      ) : books.length === 0 && !error ? (
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
            const chapterCount = formatChapterCount(records[book.fingerprint]);
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
                  <span className={styles.bookMeta}>
                    {formatBinding(records[book.fingerprint])}
                  </span>
                  {/* A flex column, not a grid: an empty span here would only add a gap. */}
                  {chapterCount && <span className={styles.bookMeta}>{chapterCount}</span>}
                  <span className={styles.bookProgress}>
                    {formatProgress(records[book.fingerprint])}
                  </span>
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
                  <span className={styles.bookMeta}>
                    {formatBinding(records[book.fingerprint])}
                  </span>
                  <span className={styles.bookMeta}>
                    {formatChapterCount(records[book.fingerprint])}
                  </span>
                  <span className={styles.bookProgress}>
                    {formatProgress(records[book.fingerprint])}
                  </span>
                  <span className={styles.bookMeta}>{formatSize(book.sizeBytes)}</span>
                  {isOpen && <span className={styles.openBadge}>open</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {unavailableBooks.length > 0 && (
        <div className={styles.unavailableSection}>
          <div className={styles.unavailableTitle}>Unavailable</div>
          {unavailableBooks.map((book) => {
            const chapterCount = formatChapterCount(records[book.fingerprint]);
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Bookshelf;
