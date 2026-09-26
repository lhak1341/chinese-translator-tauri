/**
 * The shelf's progress column reads the book-record cache, not a copy taken at scan time:
 * reading a book and pressing Back must show where the reader got to, without a rescan.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import Bookshelf from '../Bookshelf';
import {
  invalidateBookRecords,
  loadBookRecords,
  saveBookRecords,
} from '../../../utils/reader/BookRecordsBackend';
import { makeBookRecord } from '../../../utils/reader/__tests__/bookRecordFixture';
import type { ShelfBook } from '../../../utils/reader/ReconcileLibrary';
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

function renderShelf() {
  return render(
    <Bookshelf
      books={[book]}
      unavailableBooks={[]}
      libraryPath="/library"
      isUsingDefaultPath={false}
      isLoading={false}
      error={null}
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
  global.window.electronAPI = {
    loadBookRecords: vi.fn().mockResolvedValue({ success: true, data: {} }),
    saveBookRecords: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.electronAPI;
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
