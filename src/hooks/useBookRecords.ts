import { useSyncExternalStore } from 'react';
import type { BookRecords } from '../types/ReaderTypes';
import { getBookRecordsSnapshot, subscribeBookRecords } from '../utils/reader/BookRecordsBackend';

/**
 * Every book record, re-rendering on each change to the record cache. Mount it only where
 * the records are on screen: a position write lands about once a second while reading,
 * so a subscriber above the reading view would re-render it on every one.
 */
export function useBookRecords(): BookRecords {
  return useSyncExternalStore(subscribeBookRecords, getBookRecordsSnapshot);
}
