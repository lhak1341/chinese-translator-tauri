import { createAppFile, type AppFileReadable } from '../appFile';
import type {
  BookBinding,
  BookRecord,
  BookRecords,
  ChapterOutlineSummary,
  ChapterPatternId,
  ReadingPosition,
} from '../../types/ReaderTypes';
import { validateBookRecord } from './BookRecordValidation';
import { refreshBookRecord, type BookObservations, type ReaderAnswerField } from './BookRecord';
import { logger } from '../logger';

/** Each record validated; one that fails is dropped and counted. */
function parseRecords(data: unknown): { value: BookRecords; dropped: number } {
  const rawMap = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const value: BookRecords = {};
  let dropped = 0;
  for (const [fingerprint, raw] of Object.entries(rawMap)) {
    const record = validateBookRecord(fingerprint, raw);
    if (record) {
      value[fingerprint] = record;
    } else {
      dropped++;
    }
  }
  return { value, dropped };
}

/**
 * `books.json` (GLOSSARY.md "App file"). A failed read throws and caches nothing, so no
 * read-modify-write can save an empty map over the file. Every write — a scan's
 * reconciliation and a debounced position flush can land close together — runs under the
 * file's lock, so none can clobber another with a stale copy.
 */
const booksFile = createAppFile<BookRecords>({
  fileName: 'books.json',
  what: 'Reading progress (books.json)',
  load: () => window.electronAPI.loadBookRecords(),
  save: (records) => window.electronAPI.saveBookRecords(records),
  parse: parseRecords,
  onUnreadable: 'throw',
  saveError: 'Failed to save book records',
});

/**
 * The record cache is observable: every change to it — the first load, a save, an
 * invalidate — notifies subscribers, so a view reading progress off it (the shelf) is
 * current without re-reading, whichever write landed last and in whatever order.
 */
const EMPTY_RECORDS: BookRecords = Object.freeze({}) as BookRecords;

export function subscribeBookRecords(listener: () => void): () => void {
  return booksFile.subscribe(listener);
}

/** The cached records, or an empty map before the first load. Stable between changes —
 * the cache is replaced, never mutated — as `useSyncExternalStore` requires. */
export function getBookRecordsSnapshot(): BookRecords {
  return booksFile.snapshot() ?? EMPTY_RECORDS;
}

/** `books.json` as a view reads it, through `useAppFile` (`useBookRecords`, the Candidate
 * finder's dismissals). Select only what is on screen: a position write lands about once a
 * second while reading. */
export const bookRecordsFile: AppFileReadable<BookRecords> = booksFile.readable;

export interface LoadBookRecordsResult {
  records: BookRecords;
  droppedCount: number;
}

export async function loadBookRecords(): Promise<LoadBookRecordsResult> {
  const { value, dropped } = await booksFile.read();
  return { records: value, droppedCount: dropped };
}

export function invalidateBookRecords(): void {
  booksFile.invalidate();
}

/**
 * The one read-modify-write of books.json. Once every write queued ahead of it has settled,
 * `fn` gets the freshest records and returns the next ones plus a result for the caller;
 * returning the same `records` object it was given means "no change", and nothing is
 * saved. Every writer — the per-field setters, `recordBookOpened`, a rename, library
 * reconciliation — goes through here, so none can read stale records or save outside the
 * queue.
 */
export function transformRecords<T>(
  fn: (records: BookRecords) => { records: BookRecords; result: T }
): Promise<T> {
  return booksFile.transform((current) => {
    const { records, result } = fn(current);
    return { value: records, result };
  });
}

/**
 * The records once every write already queued has landed — for a read that must see a
 * write started before it (Back queues the final position flush; a fast reopen must not
 * restore the position from before it). `loadBookRecords` is the snapshot as it is now.
 */
export async function readSettledRecords(): Promise<BookRecords> {
  return (await booksFile.readSettled()).value;
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
  return transformRecords((records) => {
    const existing = records[fingerprint];
    if (!existing) {
      logger.warn(`${caller}: no record for ${fingerprint}, skipping`);
      return { records, result: undefined };
    }
    const updated: BookRecord = { ...existing, ...patch };
    return { records: { ...records, [fingerprint]: updated }, result: undefined };
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

/**
 * One write per dismiss or restore of a Candidate finder name. The list stays sorted and
 * unique, as `validateBookRecord` would repair it; a name already in (or already out of) the
 * list changes nothing, so nothing is saved.
 */
function changeDismissed(
  caller: string,
  fingerprint: string,
  change: (dismissed: string[]) => string[] | null
): Promise<void> {
  return transformRecords((records) => {
    const existing = records[fingerprint];
    if (!existing) {
      logger.warn(`${caller}: no record for ${fingerprint}, skipping`);
      return { records, result: undefined };
    }
    const next = change(existing.dismissedCandidates);
    if (next === null) return { records, result: undefined };
    return {
      records: { ...records, [fingerprint]: { ...existing, dismissedCandidates: next } },
      result: undefined,
    };
  });
}

/** Stop offering `texts` in this book's Candidate finder, across re-runs and restarts: one write
 * for the lot, none when all are already dismissed. */
export function dismissCandidates(fingerprint: string, texts: readonly string[]): Promise<void> {
  return changeDismissed('dismissCandidates', fingerprint, (dismissed) => {
    const fresh = [...new Set(texts)].filter((text) => !dismissed.includes(text));
    return fresh.length === 0 ? null : [...dismissed, ...fresh].sort();
  });
}

/** Stop offering `text` in this book's Candidate finder, across re-runs and restarts. */
export function dismissCandidate(fingerprint: string, text: string): Promise<void> {
  return dismissCandidates(fingerprint, [text]);
}

/** Offer a dismissed name again. */
export function restoreCandidate(fingerprint: string, text: string): Promise<void> {
  return changeDismissed('restoreCandidate', fingerprint, (dismissed) =>
    dismissed.includes(text) ? dismissed.filter((name) => name !== text) : null
  );
}

/**
 * Carry a fiction dictionary's rename into every book bound to it. The rename itself is
 * Rust's (file, paired patterns file, config); book records are TS-owned, so this runs
 * after it, under the same lock as every other records write.
 *
 * One of two writes to a reader's answer that the reader did not make (`unbindDictionary`
 * is the other), and it is not a refresh: it keeps the answer the reader gave, under the
 * dictionary's new name.
 */
export function renameBoundDictionary(oldId: string, newId: string): Promise<void> {
  return replaceBoundDictionary(oldId, newId);
}

/**
 * Answer "no fiction dictionary" for every book bound to one that stopped being fiction —
 * promoted to generic, where every book reads it without a binding. Like a rename, a write
 * to the reader's answer the reader did not make; unlike one, it cannot keep the answer,
 * since a book binds only to fiction.
 */
export function unbindDictionary(dictionaryId: string): Promise<void> {
  return replaceBoundDictionary(dictionaryId, null);
}

function replaceBoundDictionary(oldId: string, next: string | null): Promise<void> {
  return transformRecords((records) => {
    let changed = false;
    const updated: BookRecords = {};
    for (const [fingerprint, record] of Object.entries(records)) {
      if (record.binding?.fictionDictionary === oldId) {
        updated[fingerprint] = { ...record, binding: { fictionDictionary: next } };
        changed = true;
      } else {
        updated[fingerprint] = record;
      }
    }
    return { records: changed ? updated : records, result: undefined };
  });
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
  return transformRecords((records) => {
    const updated = refreshBookRecord(records[fingerprint], fingerprint, {
      ...observed,
      available: true,
    });
    return { records: { ...records, [fingerprint]: updated }, result: updated };
  });
}
