import type {
  BookBinding,
  BookRecord,
  BookRecords,
  ChapterOutlineSummary,
  ChapterPatternId,
  ReadingPosition,
} from '../../types/ReaderTypes';
import { validateApiResult } from '../configValidation';
import { validateBookRecord } from './BookRecordValidation';
import { refreshBookRecord, type BookObservations, type ReaderAnswerField } from './BookRecord';
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
 * The one read-modify-write behind every per-field setter below. A record must already
 * exist — `open_book` and library-scan reconciliation both create one before the reader
 * can produce anything to write, so a missing record means a caller bug, not a
 * recoverable state; it's logged and skipped rather than fabricating a record with no
 * observations to speak of.
 */
function updateBookRecord(
  caller: string,
  fingerprint: string,
  patch: Partial<Pick<BookRecord, ReaderAnswerField | 'chapterOutline'>>
): Promise<void> {
  return withBookRecordsLock(async () => {
    const { records } = await loadBookRecords();
    const existing = records[fingerprint];
    if (!existing) {
      logger.warn(`${caller}: no record for ${fingerprint}, skipping`);
      return;
    }
    const updated: BookRecord = { ...existing, ...patch };
    await saveBookRecords({ ...records, [fingerprint]: updated });
  });
}

/**
 * Persist a reading position for one book, preserving everything else on its record.
 */
export function setReadingPosition(fingerprint: string, position: ReadingPosition): Promise<void> {
  return updateBookRecord('setReadingPosition', fingerprint, { position });
}

/**
 * Persist a freshly-elected chapter outline. Called once per fingerprint — right after
 * `detect_chapter_outline` runs on a book whose record didn't already carry one — so a
 * later open of the same, unchanged file skips election and goes straight to
 * `chapter_headers_for_pattern`.
 */
export function setChapterOutline(
  fingerprint: string,
  outline: ChapterOutlineSummary
): Promise<void> {
  return updateBookRecord('setChapterOutline', fingerprint, { chapterOutline: outline });
}

/**
 * Persist the user's manual pattern override, or clear it (`null`) to go back to trusting
 * election. Distinct from `setChapterOutline`: this never touches the detector's own
 * answer, so switching back to "auto" doesn't lose it.
 */
export function setManualChapterPattern(
  fingerprint: string,
  pattern: ChapterPatternId | null
): Promise<void> {
  return updateBookRecord('setManualChapterPattern', fingerprint, {
    manualChapterPattern: pattern,
  });
}

/**
 * Persist this book's answer to the binding question. Written immediately rather than
 * debounced like `position`: a binding change is rare, deliberate, and is followed by an
 * engine reinitialization the reader can see, so the write must already be on disk if the
 * app dies during it.
 *
 * Pass `{ fictionDictionary: null }` for the answer "no fiction dictionary" — never plain
 * `null`, which is the *unanswered* state and would re-offer the dialog on the next open.
 */
export function setBookBinding(fingerprint: string, binding: BookBinding): Promise<void> {
  return updateBookRecord('setBookBinding', fingerprint, { binding });
}

/** What `open_book` observes: the file, and its decoded content. */
export type OpenedBookObservations = Pick<
  BookObservations,
  'title' | 'lastKnownPath' | 'lineCount' | 'encodingLabel' | 'sizeBytes' | 'modifiedMs'
>;

/**
 * Refresh (or create) a record from a just-completed `open_book` — the reader's answers,
 * and the outline election observed, are kept from any existing record (see
 * `refreshBookRecord`). Defensive
 * against library-scan reconciliation having missed this book for some reason (e.g. it
 * was opened before the shelf's own scan finished): `open_book` always knows its own
 * fingerprint, title, line count and encoding, so it can materialize a record on its own.
 */
export function recordBookOpened(
  fingerprint: string,
  observed: OpenedBookObservations
): Promise<BookRecord> {
  return withBookRecordsLock(async () => {
    const { records } = await loadBookRecords();
    const updated = refreshBookRecord(records[fingerprint], fingerprint, {
      ...observed,
      available: true,
    });
    await saveBookRecords({ ...records, [fingerprint]: updated });
    return updated;
  });
}
