import type {
  BookFingerprint,
  BookRecord,
  BookRecords,
  LibraryBook,
  ReadingPosition,
} from '../../types/ReaderTypes';
import tauriAPI from '../../tauriAPI';
import { logger } from '../logger';
import { loadBookRecords, saveBookRecords, withBookRecordsLock } from './BookRecordsBackend';

/** A scanned file plus the identity/progress a book record contributes to it. */
export interface ShelfBook extends LibraryBook {
  fingerprint: string;
  position: ReadingPosition | null;
  /** Cached from the last `open_book`; `0` for a book that's been scanned but never
   * actually opened, since the true line count isn't known until decode. */
  lineCount: number;
}

/** A previously-known book whose file this scan could not find, anywhere under the
 * library root, by path or by fingerprint. Its record is kept, not deleted. */
export interface UnavailableBook {
  fingerprint: string;
  title: string;
  lastKnownPath: string;
  position: ReadingPosition | null;
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

/**
 * Which scanned files need a fresh fingerprint: anything without an `available` record
 * at that exact path, or whose size/modified-time no longer matches that record's cached
 * copy of them. Everything else is trusted unchanged — this is what makes rescanning an
 * unchanged library recompute no fingerprints.
 */
export function filesNeedingFingerprint(
  scanBooks: LibraryBook[],
  records: BookRecords
): LibraryBook[] {
  const byPath = new Map<string, BookRecord>();
  for (const record of Object.values(records)) {
    if (record.available) byPath.set(record.lastKnownPath, record);
  }
  return scanBooks.filter((file) => {
    const existing = byPath.get(file.fileName);
    return !(
      existing &&
      existing.sizeBytes === file.sizeBytes &&
      existing.modifiedMs === file.modifiedMs
    );
  });
}

/**
 * Pure reconciliation step: given the current records, the files this scan found, and
 * fresh fingerprints for exactly the files that needed one (see `filesNeedingFingerprint`),
 * produce the next records map plus the shelf/unavailable views over it.
 *
 * A file whose fingerprint matches an existing record — at the same path or a different
 * one — relinks to it (a rename/move preserves the record, `position` included, since
 * only the cached fields are overwritten). A fingerprint matching no record creates a new
 * one with `position: null` ("never opened"). A previously-available record that matches
 * no file in this scan, by path or by fingerprint, is marked unavailable and kept.
 */
export function applyReconciliation(
  records: BookRecords,
  scanBooks: LibraryBook[],
  fingerprints: ReadonlyMap<string, BookFingerprint>
): { records: BookRecords } & ReconcileResult {
  const next: BookRecords = { ...records };
  const byPath = new Map<string, BookRecord>();
  for (const record of Object.values(records)) {
    if (record.available) byPath.set(record.lastKnownPath, record);
  }

  const shelfBooks: ShelfBook[] = [];
  const matched = new Set<string>();

  for (const file of scanBooks) {
    const existing = byPath.get(file.fileName);
    const unchanged =
      existing && existing.sizeBytes === file.sizeBytes && existing.modifiedMs === file.modifiedMs;

    let record: BookRecord;
    if (unchanged && existing) {
      record = existing;
    } else {
      const fresh = fingerprints.get(file.fileName);
      if (!fresh) {
        // Fingerprinting this file failed (see reconcileLibraryScan) — leave it off the
        // shelf this pass rather than fabricate a record; the next scan retries it.
        continue;
      }
      const byFingerprint = next[fresh.fingerprint];
      record = {
        fingerprint: fresh.fingerprint,
        position: byFingerprint?.position ?? null,
        manualChapterPattern: byFingerprint?.manualChapterPattern ?? null,
        title: file.title,
        lastKnownPath: file.fileName,
        lineCount: byFingerprint?.lineCount ?? 0,
        encodingLabel: byFingerprint?.encodingLabel ?? '',
        sizeBytes: fresh.sizeBytes,
        modifiedMs: file.modifiedMs,
        available: true,
        chapterOutline: byFingerprint?.chapterOutline ?? null,
      };
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
    shelfBooks.push({
      ...file,
      fingerprint: owning.fingerprint,
      position: owning.position,
      lineCount: owning.lineCount,
    });
  }

  const unavailableBooks: UnavailableBook[] = [];
  for (const record of Object.values(next)) {
    if (matched.has(record.fingerprint)) continue;
    if (record.available) {
      next[record.fingerprint] = { ...record, available: false };
    }
    const current = next[record.fingerprint];
    unavailableBooks.push({
      fingerprint: current.fingerprint,
      title: current.title,
      lastKnownPath: current.lastKnownPath,
      position: current.position,
    });
  }
  unavailableBooks.sort((a, b) => a.title.localeCompare(b.title));

  return { records: next, shelfBooks, unavailableBooks };
}

/**
 * Reconcile a fresh `scan_library` result against the persisted book records, fetching
 * fingerprints only for the files that need one, and persist the result.
 *
 * Fingerprinting runs outside the write lock (it's pure IPC, no shared state); applying
 * the result and saving runs inside it, re-reading records at that point so a concurrent
 * write (e.g. a position flush from the book that's open right now) is never lost.
 */
export async function reconcileLibraryScan(
  scanBooks: LibraryBook[],
  libraryPath: string | null,
  fingerprintFn: FingerprintFn = defaultFingerprintFn
): Promise<ReconcileResult> {
  const { records } = await loadBookRecords();
  const toFingerprint = filesNeedingFingerprint(scanBooks, records);

  const fingerprints = new Map<string, BookFingerprint>();
  await Promise.all(
    toFingerprint.map(async (file) => {
      try {
        fingerprints.set(file.fileName, await fingerprintFn(file.fileName, libraryPath));
      } catch (cause) {
        logger.error(`Failed to fingerprint ${file.fileName}:`, cause);
      }
    })
  );

  return withBookRecordsLock(async () => {
    const { records: freshRecords } = await loadBookRecords();
    const applied = applyReconciliation(freshRecords, scanBooks, fingerprints);
    await saveBookRecords(applied.records);
    return { shelfBooks: applied.shelfBooks, unavailableBooks: applied.unavailableBooks };
  });
}
