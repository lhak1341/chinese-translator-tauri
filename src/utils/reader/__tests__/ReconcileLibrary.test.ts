import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  applyReconciliation,
  filesNeedingFingerprint,
  reconcileLibraryScan,
} from '../ReconcileLibrary';
import { invalidateBookRecords } from '../BookRecordsBackend';
import type {
  BookFingerprint,
  BookRecord,
  BookRecords,
  LibraryBook,
} from '../../../types/ReaderTypes';

function makeFile(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    fileName: 'novel.txt',
    title: 'Novel',
    sizeBytes: 100,
    modifiedMs: 1000,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    fingerprint: 'fp1',
    position: null,
    binding: null,
    title: 'Novel',
    lastKnownPath: 'novel.txt',
    lineCount: 500,
    encodingLabel: 'GBK',
    sizeBytes: 100,
    modifiedMs: 1000,
    available: true,
    ...overrides,
  };
}

describe('filesNeedingFingerprint', () => {
  test('a file matching an available record at the same path (size+mtime) needs nothing', () => {
    const file = makeFile();
    const records: BookRecords = { fp1: makeRecord() };
    expect(filesNeedingFingerprint([file], records)).toEqual([]);
  });

  test('a resized or re-mtimed file needs a fresh fingerprint', () => {
    const records: BookRecords = { fp1: makeRecord() };
    expect(filesNeedingFingerprint([makeFile({ sizeBytes: 999 })], records)).toHaveLength(1);
    expect(filesNeedingFingerprint([makeFile({ modifiedMs: 999 })], records)).toHaveLength(1);
  });

  test('a brand-new file (no record at its path) needs a fingerprint', () => {
    expect(filesNeedingFingerprint([makeFile({ fileName: 'other.txt' })], {})).toHaveLength(1);
  });

  test("a file at a previously-unavailable record's path still needs a fingerprint", () => {
    const records: BookRecords = { fp1: makeRecord({ available: false }) };
    expect(filesNeedingFingerprint([makeFile()], records)).toHaveLength(1);
  });
});

describe('applyReconciliation', () => {
  test('round-trip: an unchanged file keeps its record exactly, with no fingerprint lookup needed', () => {
    const existing = makeRecord({ position: { line: 10, fraction: 0.3 } });
    const result = applyReconciliation({ fp1: existing }, [makeFile()], new Map());

    expect(result.records.fp1).toEqual(existing);
    expect(result.shelfBooks).toEqual([
      { ...makeFile(), fingerprint: 'fp1', position: existing.position, lineCount: 500 },
    ]);
    expect(result.unavailableBooks).toEqual([]);
  });

  test('a moved/renamed file relinks to its existing record by fingerprint, preserving position', () => {
    const existing = makeRecord({
      lastKnownPath: 'old-name.txt',
      position: { line: 77, fraction: 0.5 },
      binding: { fictionDictionary: 'properNouns-f_TapDo' },
    });
    const movedFile = makeFile({ fileName: 'new-name.txt', title: 'New Name' });
    const fingerprints = new Map<string, BookFingerprint>([
      ['new-name.txt', { fingerprint: 'fp1', sizeBytes: 100 }],
    ]);

    const result = applyReconciliation({ fp1: existing }, [movedFile], fingerprints);

    expect(result.records.fp1.lastKnownPath).toBe('new-name.txt');
    expect(result.records.fp1.position).toEqual({ line: 77, fraction: 0.5 });
    // The binding is the other authoritative half — surviving a rename is the whole
    // reason records are keyed by fingerprint rather than by path.
    expect(result.records.fp1.binding).toEqual({ fictionDictionary: 'properNouns-f_TapDo' });
    expect(result.records.fp1.title).toBe('New Name');
    expect(result.unavailableBooks).toEqual([]);
  });

  test('a fingerprint matching no record creates a fresh one with position: null', () => {
    const fingerprints = new Map<string, BookFingerprint>([
      ['novel.txt', { fingerprint: 'brand-new', sizeBytes: 100 }],
    ]);
    const result = applyReconciliation({}, [makeFile()], fingerprints);

    expect(result.records['brand-new']).toMatchObject({
      fingerprint: 'brand-new',
      position: null,
      title: 'Novel',
      lastKnownPath: 'novel.txt',
      available: true,
    });
  });

  test('a previously-available record matched by nothing this scan becomes unavailable, kept not deleted', () => {
    const existing = makeRecord({ position: { line: 1, fraction: 0 } });
    const result = applyReconciliation({ fp1: existing }, [], new Map());

    expect(result.records.fp1.available).toBe(false);
    expect(result.records.fp1.position).toEqual({ line: 1, fraction: 0 });
    expect(result.unavailableBooks).toEqual([
      {
        fingerprint: 'fp1',
        title: 'Novel',
        lastKnownPath: 'novel.txt',
        position: { line: 1, fraction: 0 },
      },
    ]);
  });

  test('an already-unavailable record that reappears (matched by fingerprint) is re-linked and marked available again', () => {
    const existing = makeRecord({
      available: false,
      lastKnownPath: 'old-drive/novel.txt',
      position: { line: 3, fraction: 0 },
    });
    const fingerprints = new Map<string, BookFingerprint>([
      ['novel.txt', { fingerprint: 'fp1', sizeBytes: 100 }],
    ]);

    const result = applyReconciliation({ fp1: existing }, [makeFile()], fingerprints);

    expect(result.records.fp1.available).toBe(true);
    expect(result.records.fp1.lastKnownPath).toBe('novel.txt');
    expect(result.records.fp1.position).toEqual({ line: 3, fraction: 0 });
    expect(result.unavailableBooks).toEqual([]);
  });

  test('a file that needed a fingerprint but did not get one is left off the shelf, not fabricated', () => {
    const result = applyReconciliation({}, [makeFile()], new Map());
    expect(result.shelfBooks).toEqual([]);
    expect(result.records).toEqual({});
  });
});

describe('reconcileLibraryScan', () => {
  beforeEach(() => {
    invalidateBookRecords();
    global.window.electronAPI = {
      loadBookRecords: vi.fn().mockResolvedValue({ success: true, data: {} }),
      saveBookRecords: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as typeof window.electronAPI;
  });

  test('rescanning an unchanged library recomputes no fingerprints', async () => {
    const existing = makeRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const fingerprintFn = vi.fn();

    const result = await reconcileLibraryScan([makeFile()], null, fingerprintFn);

    expect(fingerprintFn).not.toHaveBeenCalled();
    expect(result.shelfBooks).toEqual([
      { ...makeFile(), fingerprint: 'fp1', position: null, lineCount: 500 },
    ]);
  });

  test('persists the reconciled records via saveBookRecords', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;
    const fingerprintFn = vi.fn().mockResolvedValue({ fingerprint: 'fp1', sizeBytes: 100 });

    await reconcileLibraryScan([makeFile()], null, fingerprintFn);

    expect(saveFn).toHaveBeenCalledTimes(1);
    const [savedRecords] = saveFn.mock.calls[0] as [BookRecords];
    expect(savedRecords.fp1).toMatchObject({ fingerprint: 'fp1', lastKnownPath: 'novel.txt' });
  });

  test('a fingerprint lookup failure for one file does not abort reconciling the rest', async () => {
    const okFile = makeFile({ fileName: 'ok.txt' });
    const badFile = makeFile({ fileName: 'bad.txt' });
    const fingerprintFn = vi.fn(async (fileName: string) => {
      if (fileName === 'bad.txt') throw new Error('read error');
      return { fingerprint: 'fp-ok', sizeBytes: 100 };
    });

    const result = await reconcileLibraryScan([okFile, badFile], null, fingerprintFn);

    expect(result.shelfBooks.map((b) => b.fileName)).toEqual(['ok.txt']);
  });
});
