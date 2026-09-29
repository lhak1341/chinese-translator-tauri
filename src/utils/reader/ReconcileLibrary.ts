import type {
  BookFingerprint,
  BookRecord,
  BookRecords,
  LibraryBook,
} from '../../types/ReaderTypes';
import tauriAPI from '../../tauriAPI';
import { logger } from '../logger';
import { loadBookRecords, saveBookRecords, withBookRecordsLock } from './BookRecordsBackend';
import { refreshBookRecord } from './BookRecord';

/** A scanned file plus its identity. Progress is deliberately not copied here: the shelf
 * reads it off the live record cache (`useBookRecords`), so it cannot go stale. */
export interface ShelfBook extends LibraryBook {
  /** `null` when reconciliation failed, so which record this file is is unknown — the shelf
   * then shows no progress for it rather than "Not started". */
  fingerprint: string | null;
}

/** The shelf's order: locale-aware A-Z by title — see `planReconciliation`. */
export function byShelfTitle(a: LibraryBook, b: LibraryBook): number {
  return a.title.localeCompare(b.title);
}

/** A previously-known book whose file this scan could not find, anywhere under the
 * library root, by path or by fingerprint. Its record is kept, not deleted. */
export interface UnavailableBook {
  fingerprint: string;
  title: string;
  lastKnownPath: string;
}

export interface ReconcileResult {
  shelfBooks: ShelfBook[];
  unavailableBooks: UnavailableBook[];
}

export type FingerprintFn = (
  fileName: string,
  libraryPath: string | null
) => Promise<BookFingerprint>;

const defaultFingerprintFn: FingerprintFn = (fileName, libraryPath) =>
  tauriAPI.fingerprintBook(fileName, libraryPath);

/** What one scan will do, decided once from the records as first read. */
export interface ReconciliationPlan {
  /** The scanned files whose identity must be fetched: every file without an `available`
   * record at that exact path, or whose size/modified-time no longer matches it. Everything
   * else is trusted unchanged — this is what makes rescanning an unchanged library recompute
   * no fingerprints. */
  needFingerprint: LibraryBook[];
  /**
   * The next records map plus the shelf/unavailable views over it, given the records as
   * re-read under the write lock and fresh fingerprints for (some of) `needFingerprint`.
   * Trusted files are found in `freshRecords` by the fingerprint the plan remembered — never
   * re-decided — so a write between the two reads (a position flush from the open book) is
   * kept.
   *
   * A file whose fingerprint matches an existing record — at the same path or a different
   * one — relinks to it: a rename/move overwrites only what the scan observed about the
   * file, keeping the reader's answers and the content observations (line count, encoding,
   * outline) that a scan cannot make — see `refreshBookRecord`. A fingerprint matching no
   * record creates a new one with `position: null` ("never opened"). A previously-available
   * record that matches no file in this scan, by path or by fingerprint, is marked
   * unavailable and kept.
   *
   * A file whose fingerprint failed, or a trusted file whose record vanished between the
   * reads, is left off the shelf this pass rather than given a fabricated record; the next
   * scan retries it. The record at its path stays as it was — still available, not listed as
   * missing: the book is on disk, only its identity went unread.
   */
  resolve(
    freshRecords: BookRecords,
    fingerprints: ReadonlyMap<string, BookFingerprint>
  ): { records: BookRecords } & ReconcileResult;
}

export function planReconciliation(
  records: BookRecords,
  scanBooks: LibraryBook[]
): ReconciliationPlan {
  const byPath = new Map<string, BookRecord>();
  for (const record of Object.values(records)) {
    if (record.available) byPath.set(record.lastKnownPath, record);
  }

  /** Scanned path → the fingerprint of its unchanged record. */
  const trusted = new Map<string, string>();
  /** Scanned path → the fingerprint of the available record there, for a changed file:
   * the record a failed fingerprint must leave alone. */
  const heldAtPath = new Map<string, string>();
  const needFingerprint: LibraryBook[] = [];
  for (const file of scanBooks) {
    const existing = byPath.get(file.fileName);
    if (
      existing &&
      existing.sizeBytes === file.sizeBytes &&
      existing.modifiedMs === file.modifiedMs
    ) {
      trusted.set(file.fileName, existing.fingerprint);
    } else {
      needFingerprint.push(file);
      if (existing) heldAtPath.set(file.fileName, existing.fingerprint);
    }
  }

  const resolve: ReconciliationPlan['resolve'] = (freshRecords, fingerprints) => {
    const next: BookRecords = { ...freshRecords };
    const shelfBooks: ShelfBook[] = [];
    const matched = new Set<string>();
    /** Records a file on disk still stands behind, though it is off the shelf this pass. */
    const held = new Set<string>();

    for (const file of scanBooks) {
      let record: BookRecord;
      const trustedFingerprint = trusted.get(file.fileName);
      if (trustedFingerprint !== undefined) {
        const current = freshRecords[trustedFingerprint];
        if (!current) continue;
        record = current;
      } else {
        const fresh = fingerprints.get(file.fileName);
        if (!fresh) {
          const atPath = heldAtPath.get(file.fileName);
          if (atPath !== undefined) held.add(atPath);
          continue;
        }
        record = refreshBookRecord(next[fresh.fingerprint], fresh.fingerprint, {
          title: file.title,
          lastKnownPath: file.fileName,
          sizeBytes: fresh.sizeBytes,
          modifiedMs: file.modifiedMs,
          available: true,
        });
      }
      // Two scanned files can fingerprint identically (byte-for-byte duplicate content,
      // e.g. the same book copied under two names) — the first one seen this pass owns the
      // record; later duplicates still get a shelf entry (sharing its position/lineCount)
      // but must not overwrite `lastKnownPath`/etc back and forth between them.
      if (!matched.has(record.fingerprint)) {
        next[record.fingerprint] = record;
        matched.add(record.fingerprint);
      }
      const owning = next[record.fingerprint];
      shelfBooks.push({ ...file, fingerprint: owning.fingerprint });
    }

    // Locale-aware, so both shelf lists sort the same true A-Z a reader expects — Rust's own
    // pre-sort in `scan_library_impl` (`book_commands.rs`) is plain `String::cmp`, byte order,
    // which puts every capital letter before every lowercase one and doesn't fold diacritics.
    // This sort is authoritative; the Rust one is redundant but harmless left as a stable
    // starting order.
    shelfBooks.sort(byShelfTitle);

    const unavailableBooks: UnavailableBook[] = [];
    for (const record of Object.values(next)) {
      if (matched.has(record.fingerprint) || held.has(record.fingerprint)) continue;
      if (record.available) {
        next[record.fingerprint] = { ...record, available: false };
      }
      const current = next[record.fingerprint];
      unavailableBooks.push({
        fingerprint: current.fingerprint,
        title: current.title,
        lastKnownPath: current.lastKnownPath,
      });
    }
    unavailableBooks.sort((a, b) => a.title.localeCompare(b.title));

    return { records: next, shelfBooks, unavailableBooks };
  };

  return { needFingerprint, resolve };
}

/**
 * Reconcile a fresh `scan_library` result against the persisted book records, fetching
 * fingerprints only for the files that need one, and persist the result.
 *
 * Fingerprinting runs outside the write lock (it's pure IPC, no shared state); resolving
 * the plan and saving runs inside it, against records re-read at that point so a concurrent
 * write (e.g. a position flush from the book that's open right now) is never lost. Which
 * files are unchanged is decided once, by the plan, from the first read.
 */
export async function reconcileLibraryScan(
  scanBooks: LibraryBook[],
  libraryPath: string | null,
  fingerprintFn: FingerprintFn = defaultFingerprintFn
): Promise<ReconcileResult> {
  const { records } = await loadBookRecords();
  const plan = planReconciliation(records, scanBooks);

  const fingerprints = new Map<string, BookFingerprint>();
  await Promise.all(
    plan.needFingerprint.map(async (file) => {
      try {
        fingerprints.set(file.fileName, await fingerprintFn(file.fileName, libraryPath));
      } catch (cause) {
        logger.error(`Failed to fingerprint ${file.fileName}:`, cause);
      }
    })
  );

  return withBookRecordsLock(async () => {
    const { records: freshRecords } = await loadBookRecords();
    const applied = plan.resolve(freshRecords, fingerprints);
    await saveBookRecords(applied.records);
    return { shelfBooks: applied.shelfBooks, unavailableBooks: applied.unavailableBooks };
  });
}
