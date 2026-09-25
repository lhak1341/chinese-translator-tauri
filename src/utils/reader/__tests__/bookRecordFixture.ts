import type { BookRecord } from '../../../types/ReaderTypes';
import { emptyBookRecord } from '../BookRecord';

/**
 * A realistic, opened-and-scanned book record for tests. Built on `emptyBookRecord`, so a
 * field added to `BookRecord` reaches every fixture at once — test files are excluded
 * from `tsc`, and three hand-written fixtures had already drifted from the type.
 */
export function makeBookRecord(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    ...emptyBookRecord('fp1'),
    title: 'Novel',
    lastKnownPath: 'novel.txt',
    lineCount: 500,
    encodingLabel: 'GBK',
    sizeBytes: 100,
    modifiedMs: 1000,
    ...overrides,
  };
}
