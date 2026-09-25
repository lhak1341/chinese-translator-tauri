import type { BookRecord } from '../../types/ReaderTypes';

/**
 * The fields that are the reader's own answers — where they were, which outline structure
 * they chose, which fiction dictionary the book uses. Nothing can regenerate these, so no
 * refresh from a scan or an open ever writes them; only their own setters in
 * `BookRecordsBackend.ts` do. Every other field is an observation (see `BookObservations`).
 */
export const READER_ANSWER_FIELDS = [
  'position',
  'manualChapterPattern',
  'binding',
] as const satisfies readonly (keyof BookRecord)[];

export type ReaderAnswerField = (typeof READER_ANSWER_FIELDS)[number];

/**
 * Everything about a book that some source can observe again: the library scan sees the
 * file (`title`, `lastKnownPath`, `sizeBytes`, `modifiedMs`, `available`), `open_book` sees
 * the file and its decoded content (`lineCount`, `encodingLabel`), election sees its
 * structure (`chapterOutline`). A refresh overwrites exactly the observations its source
 * made and keeps the rest.
 */
export type BookObservations = Omit<BookRecord, 'fingerprint' | ReaderAnswerField>;

/**
 * A record that knows nothing yet: never opened, never answered, nothing observed. The one
 * source of defaults — a fresh record starts here, and `validateBookRecord` repairs a
 * malformed field to its value here.
 */
export function emptyBookRecord(fingerprint: string): BookRecord {
  return {
    fingerprint,
    position: null,
    manualChapterPattern: null,
    binding: null,
    title: '',
    lastKnownPath: '',
    lineCount: 0,
    encodingLabel: '',
    sizeBytes: 0,
    modifiedMs: 0,
    available: true,
    chapterOutline: null,
  };
}

/**
 * The record after a source observed `observed` about the book with this fingerprint:
 * defaults, then everything `existing` already knew, then the new observations. The
 * reader's answers are re-applied from `existing` last, so an `observed` object wider
 * than its type (structural typing allows it) still cannot overwrite one.
 *
 * `existing` must be this fingerprint's record, or `undefined` for a book never seen.
 */
export function refreshBookRecord(
  existing: BookRecord | undefined,
  fingerprint: string,
  observed: Partial<BookObservations>
): BookRecord {
  const base = emptyBookRecord(fingerprint);
  const answers: Pick<BookRecord, ReaderAnswerField> = {
    position: (existing ?? base).position,
    manualChapterPattern: (existing ?? base).manualChapterPattern,
    binding: (existing ?? base).binding,
  };
  return { ...base, ...existing, ...observed, ...answers, fingerprint };
}
