import type { BookRecord, BookRecords, ReadingPosition } from '../../types/ReaderTypes';
import { validateApiResult } from '../configValidation';
import { validateBookRecord } from './BookRecordValidation';
import { logger } from '../logger';

let cache: BookRecords | null = null;

// Serializes every write to books.json — a scan's reconciliation write and a debounced
// position flush can land close together, and a read-modify-write done without a lock
// would let the second clobber the first's result with a stale in-memory copy.
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` once every write ahead of it in the queue has settled. `fn` is expected to
 * `loadBookRecords()` (safe to call repeatedly — cached) and `saveBookRecords()` itself,
 * so it always reads the freshest state before deciding what to write.
 */
export function withBookRecordsLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface LoadBookRecordsResult {
  records: BookRecords;
  droppedCount: number;
}

export async function loadBookRecords(): Promise<LoadBookRecordsResult> {
  if (cache) return { records: cache, droppedCount: 0 };
  const rawResult = await window.electronAPI.loadBookRecords();
  const result = validateApiResult<Record<string, unknown>>(rawResult, 'loadBookRecords');
  const rawMap = result.success && result.data ? result.data : {};

  const records: BookRecords = {};
  let droppedCount = 0;
  for (const [fingerprint, raw] of Object.entries(rawMap)) {
    const record = validateBookRecord(fingerprint, raw);
    if (record) {
      records[fingerprint] = record;
    } else {
      droppedCount++;
    }
  }
  if (droppedCount > 0) {
    logger.warn(`loadBookRecords: dropped ${droppedCount} invalid record(s)`);
  }

  cache = records;
  return { records, droppedCount };
}

/** Call only from inside `withBookRecordsLock` — an unguarded save can race a concurrent
 * read-modify-write and silently lose one side's changes. */
export async function saveBookRecords(records: BookRecords): Promise<void> {
  const result = await window.electronAPI.saveBookRecords(records);
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to save book records');
  }
  cache = records;
}

export function invalidateBookRecords(): void {
  cache = null;
}

/**
 * Persist a reading position for one book, preserving every cached field already on its
 * record. A record must already exist — `open_book` and library-scan reconciliation both
 * create one before the reader can produce a position to write, so a missing record here
 * means a caller bug, not a recoverable state; it's logged and skipped rather than
 * fabricating a record with no cached fields to speak of.
 */
export function setReadingPosition(fingerprint: string, position: ReadingPosition): Promise<void> {
  return withBookRecordsLock(async () => {
    const { records } = await loadBookRecords();
    const existing = records[fingerprint];
    if (!existing) {
      logger.warn(`setReadingPosition: no record for ${fingerprint}, skipping`);
      return;
    }
    const updated: BookRecord = { ...existing, position };
    await saveBookRecords({ ...records, [fingerprint]: updated });
  });
}

export interface OpenedBookCachedFields {
  title: string;
  lastKnownPath: string;
  lineCount: number;
  encodingLabel: string;
  sizeBytes: number;
  modifiedMs: number;
}

/**
 * Refresh (or create) a record's cached half from a just-completed `open_book` —
 * `position` is preserved from any existing record, never overwritten here. Defensive
 * against library-scan reconciliation having missed this book for some reason (e.g. it
 * was opened before the shelf's own scan finished): `open_book` always knows its own
 * fingerprint, title, line count and encoding, so it can materialize a record on its own.
 */
export function recordBookOpened(
  fingerprint: string,
  fields: OpenedBookCachedFields
): Promise<BookRecord> {
  return withBookRecordsLock(async () => {
    const { records } = await loadBookRecords();
    const existing = records[fingerprint];
    const updated: BookRecord = {
      fingerprint,
      position: existing?.position ?? null,
      available: true,
      ...fields,
    };
    await saveBookRecords({ ...records, [fingerprint]: updated });
    return updated;
  });
}
