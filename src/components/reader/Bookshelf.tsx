import React from 'react';
import { BookOpen, FolderOpen, Loader, RefreshCw, AlertCircle, FileWarning } from 'lucide-react';
import type { LibraryBook } from '../../types/ReaderTypes';
import type { ShelfBook, UnavailableBook } from '../../utils/reader/ReconcileLibrary';
import styles from '../../styles/Reader.module.css';

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

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Not started" / "line N of M" / "in progress" (line count not cached yet — the book
 * hasn't been opened, just seen on a scan). `null` means genuinely never opened. */
function formatProgress(book: ShelfBook): string | null {
  if (!book.position) return 'Not started';
  if (book.lineCount > 0) {
    return `Line ${(book.position.line + 1).toLocaleString()} of ${book.lineCount.toLocaleString()}`;
  }
  return 'In progress';
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

      {isLoading ? (
        <div className={styles.centeredNotice}>
          <Loader size={18} className="animate-spin" />
          <span>Scanning the library…</span>
        </div>
      ) : books.length === 0 && !error ? (
        <div className={styles.centeredNotice}>
          <span>No .txt files in this folder.</span>
        </div>
      ) : (
        <ul className={styles.bookList}>
          {books.map((book) => {
            const isOpen = openFileName === book.fileName;
            return (
              <li key={book.fileName}>
                <button
                  className={`${styles.bookRow} ${isOpen ? styles.bookRowOpen : ''}`}
                  onClick={() => onOpen(book)}
                >
                  <BookOpen size={16} className={styles.bookIcon} />
                  <span className={styles.bookTitle}>{book.title}</span>
                  <span className={styles.bookProgress}>{formatProgress(book)}</span>
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
          {unavailableBooks.map((book) => (
            <div key={book.fingerprint} className={styles.unavailableRow}>
              <FileWarning size={16} className={styles.unavailableIcon} />
              <div className={styles.unavailableInfo}>
                <span className={styles.bookTitle}>{book.title}</span>
                <span className={styles.unavailablePath} title={book.lastKnownPath}>
                  Last seen at {book.lastKnownPath}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Bookshelf;
