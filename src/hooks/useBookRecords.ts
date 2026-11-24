import type { BookRecords } from '../types/ReaderTypes';
import type { AppFileState } from '../utils/appFile';
import { bookRecordsFile } from '../utils/reader/BookRecordsBackend';
import { useAppFile } from './useAppFile';

const NO_RECORDS: BookRecords = Object.freeze({}) as BookRecords;

/** Every record, or an empty map while none are loaded — stable between changes. */
const allRecords = (state: AppFileState<BookRecords>): BookRecords => state.value ?? NO_RECORDS;

/**
 * Every book record, re-rendering on each change to the record cache; starts a load if
 * none is cached (`useAppFile`). Mount it only where the records are on screen: a position
 * write lands about once a second while reading, so a subscriber above the reading view
 * would re-render it on every one.
 */
export function useBookRecords(): BookRecords {
  return useAppFile(bookRecordsFile, allRecords);
}
