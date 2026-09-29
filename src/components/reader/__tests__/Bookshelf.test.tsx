/**
 * The shelf's progress column reads the book-record cache, not a copy taken at scan time:
 * reading a book and pressing Back must show where the reader got to, without a rescan.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import Bookshelf from '../Bookshelf';
import {
  invalidateBookRecords,
  loadBookRecords,
  saveBookRecords,
} from '../../../utils/reader/BookRecordsBackend';
import { makeBookRecord } from '../../../utils/reader/__tests__/bookRecordFixture';
import type { ShelfBook, UnavailableBook } from '../../../utils/reader/ReconcileLibrary';
import type { BookRecords } from '../../../types/ReaderTypes';

const book: ShelfBook = {
  fileName: 'novel.txt',
  title: 'Novel',
  sizeBytes: 100,
  modifiedMs: 1000,
  fingerprint: 'fp1',
};

async function seedRecords(records: BookRecords): Promise<void> {
  window.electronAPI.loadBookRecords = vi.fn().mockResolvedValue({ success: true, data: records });
  await loadBookRecords();
}

function renderShelf(
  unavailableBooks: UnavailableBook[] = [],
  { books = [book], recordsUnavailable = false } = {}
) {
  return render(
    <Bookshelf
      books={books}
      unavailableBooks={unavailableBooks}
      libraryPath="/library"
      isUsingDefaultPath={false}
      isLoading={false}
      error={null}
      recordsUnavailable={recordsUnavailable}
      openFileName={null}
      onOpen={vi.fn()}
      onChooseFolder={vi.fn()}
      onUseDefaultFolder={vi.fn()}
      onRescan={vi.fn()}
    />
  );
}

beforeEach(() => {
  invalidateBookRecords();
  // The layout toggle persists its choice; a test that switches to cards must not leave
  // the next one starting there.
  localStorage.clear();
  global.window.electronAPI = {
    loadBookRecords: vi.fn().mockResolvedValue({ success: true, data: {} }),
    saveBookRecords: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.electronAPI;
});

describe('Bookshelf when the book records could not be read', () => {
  test('a book whose identity is unknown shows no progress, not "Not started"', async () => {
    await act(() => seedRecords({ fp1: makeBookRecord({ position: { line: 9, fraction: 0.5 } }) }));
    renderShelf([], { books: [{ ...book, fingerprint: null }], recordsUnavailable: true });

    expect(screen.queryByText('Not started')).toBeNull();
    expect(screen.queryByText('Not bound')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  test('says why, and points at Rescan', () => {
    renderShelf([], { books: [{ ...book, fingerprint: null }], recordsUnavailable: true });
    expect(screen.getByText(/Reading progress couldn't be loaded/)).toBeTruthy();
  });

  test('says nothing when the records were read', () => {
    renderShelf();
    expect(screen.queryByText(/Reading progress couldn't be loaded/)).toBeNull();
  });
});

describe('Bookshelf progress', () => {
  test('a book with no record, or no position, is not started', async () => {
    renderShelf();
    expect(screen.getByText('Not started')).toBeTruthy();

    await act(() => seedRecords({ fp1: makeBookRecord({ position: null }) }));
    expect(screen.getByText('Not started')).toBeTruthy();
  });

  test('a position with a known line count reads as line N of M', async () => {
    await seedRecords({ fp1: makeBookRecord({ position: { line: 10, fraction: 0 } }) });
    renderShelf();
    expect(screen.getByText('Line 11 of 500')).toBeTruthy();
  });

  test('a position without a line count yet reads as in progress', async () => {
    await seedRecords({
      fp1: makeBookRecord({ position: { line: 10, fraction: 0 }, lineCount: 0 }),
    });
    renderShelf();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  test('a record saved after the shelf mounted (Back from reading) updates the row', async () => {
    await seedRecords({ fp1: makeBookRecord({ position: { line: 10, fraction: 0 } }) });
    renderShelf();
    expect(screen.getByText('Line 11 of 500')).toBeTruthy();

    await act(() =>
      saveBookRecords({ fp1: makeBookRecord({ position: { line: 249, fraction: 0.5 } }) })
    );

    expect(screen.getByText('Line 250 of 500')).toBeTruthy();
  });
});

describe('Bookshelf binding', () => {
  test('a bound book names its fiction dictionary, without the prefix', async () => {
    await seedRecords({
      fp1: makeBookRecord({ binding: { fictionDictionary: 'properNouns-f_TapDo' } }),
    });
    renderShelf();
    expect(screen.getByText('TapDo')).toBeTruthy();
  });

  test('the card layout shows the binding too', async () => {
    await seedRecords({
      fp1: makeBookRecord({ binding: { fictionDictionary: 'properNouns-f_TapDo' } }),
    });
    renderShelf();
    fireEvent.click(screen.getByText('Cards'));
    expect(screen.getByText('TapDo')).toBeTruthy();
  });

  test('the answer "none" reads differently from never having answered', async () => {
    // `binding: null` is "never answered"; `{ fictionDictionary: null }` is the answer
    // "no fiction dictionary" (CONTEXT.md, "Dictionary Binding").
    await seedRecords({ fp1: makeBookRecord({ binding: { fictionDictionary: null } }) });
    const { unmount } = renderShelf();
    expect(screen.getByText('No fiction dictionary')).toBeTruthy();
    unmount();

    invalidateBookRecords();
    await seedRecords({ fp1: makeBookRecord({ binding: null }) });
    renderShelf();
    expect(screen.getByText('Not bound')).toBeTruthy();
    expect(screen.queryByText('No fiction dictionary')).toBeNull();
  });
});

describe('Bookshelf chapter count', () => {
  const outline = {
    pattern: 'chapter' as const,
    candidates: [
      { pattern: 'chapter' as const, hitCount: 1234, medianGap: 60, regularity: 0.95 },
      { pattern: 'volume' as const, hitCount: 12, medianGap: 6000, regularity: 0.9 },
    ],
  };

  test("an elected outline shows its pattern's chapter count", async () => {
    await seedRecords({ fp1: makeBookRecord({ chapterOutline: outline }) });
    renderShelf();
    expect(screen.getByText('1,234 chapters')).toBeTruthy();
  });

  test("a manual override counts the reader's chosen pattern, not election's", async () => {
    await seedRecords({
      fp1: makeBookRecord({ chapterOutline: outline, manualChapterPattern: 'volume' }),
    });
    renderShelf();
    expect(screen.getByText('12 chapters')).toBeTruthy();
  });

  test('a book never opened, or with no structure elected, shows no count', async () => {
    await seedRecords({ fp1: makeBookRecord({ chapterOutline: null }) });
    const { unmount } = renderShelf();
    expect(screen.queryByText(/chapters?$/)).toBeNull();
    unmount();

    invalidateBookRecords();
    await seedRecords({
      fp1: makeBookRecord({ chapterOutline: { pattern: null, candidates: outline.candidates } }),
    });
    renderShelf();
    expect(screen.queryByText(/chapters?$/)).toBeNull();
  });
});

describe('Bookshelf unavailable books', () => {
  test('an unavailable book shows its binding and chapter count too', async () => {
    await seedRecords({
      fp1: makeBookRecord({ position: null }),
      fp2: makeBookRecord({
        fingerprint: 'fp2',
        available: false,
        binding: { fictionDictionary: 'properNouns-f_KimDung' },
        chapterOutline: {
          pattern: 'hui',
          candidates: [{ pattern: 'hui', hitCount: 40, medianGap: 120, regularity: 0.9 }],
        },
      }),
    });
    renderShelf([{ fingerprint: 'fp2', title: 'Gone', lastKnownPath: 'gone.txt' }]);
    expect(screen.getByText('KimDung')).toBeTruthy();
    expect(screen.getByText('40 chapters')).toBeTruthy();
  });
});
