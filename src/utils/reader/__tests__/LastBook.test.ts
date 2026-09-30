import { describe, test, expect } from 'vitest';
import { findLastBook } from '../LastBook';
import type { ShelfBook, ShelfOutcome } from '../ReconcileLibrary';

const book: ShelfBook = {
  fileName: 'renamed.txt',
  title: 'Novel',
  sizeBytes: 100,
  modifiedMs: 0,
  fingerprint: 'fp1',
};
const loaded: ShelfOutcome = {
  kind: 'loaded',
  libraryPath: '/lib',
  books: [book],
  unavailableBooks: [],
};

describe('findLastBook', () => {
  test('finds the book by fingerprint, whatever its file is called now', () => {
    expect(findLastBook(loaded, 'fp1')).toBe(book);
  });

  test('a book no longer on the shelf is not found', () => {
    expect(findLastBook(loaded, 'fp-gone')).toBeNull();
  });

  test('nothing is found before a scan, without a last book, or when identity is unknown', () => {
    expect(findLastBook(null, 'fp1')).toBeNull();
    expect(findLastBook(loaded, null)).toBeNull();
    expect(
      findLastBook({ kind: 'recordsUnknown', libraryPath: '/lib', books: [book] }, 'fp1')
    ).toBeNull();
  });
});
