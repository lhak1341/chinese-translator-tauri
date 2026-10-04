import { describe, expect, test, beforeEach, vi } from 'vitest';
import { planReconciliation, reconcileLibraryScan } from '../ReconcileLibrary';
import { invalidateBookRecords } from '../BookRecordsBackend';
import type { BookFingerprint, BookRecords, LibraryBook } from '../../../types/ReaderTypes';
import { READER_ANSWER_FIELDS } from '../BookRecord';
import { makeBookRecord } from './bookRecordFixture';
import { installFakeAppFile } from '../../../test/fakeAppFile';

function makeFile(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    fileName: 'novel.txt',
    title: 'Novel',
    sizeBytes: 100,
    modifiedMs: 1000,
    ...overrides,
  };
}

/** Which files the plan sends to fingerprinting. */
const needing = (files: LibraryBook[], records: BookRecords) =>
  planReconciliation(records, files).needFingerprint;

/** Plan and resolve over one read — the common case, where nothing wrote in between. */
const reconcile = (
  records: BookRecords,
  files: LibraryBook[],
  fingerprints: ReadonlyMap<string, BookFingerprint>
) => planReconciliation(records, files).resolve(records, fingerprints);

describe('planReconciliation — which files need a fingerprint', () => {
  test('a file matching an available record at the same path (size+mtime) needs nothing', () => {
    const file = makeFile();
    const records: BookRecords = { fp1: makeBookRecord() };
    expect(needing([file], records)).toEqual([]);
  });

  test('a resized or re-mtimed file needs a fresh fingerprint', () => {
    const records: BookRecords = { fp1: makeBookRecord() };
    expect(needing([makeFile({ sizeBytes: 999 })], records)).toHaveLength(1);
    expect(needing([makeFile({ modifiedMs: 999 })], records)).toHaveLength(1);
  });

  test('a brand-new file (no record at its path) needs a fingerprint', () => {
    expect(needing([makeFile({ fileName: 'other.txt' })], {})).toHaveLength(1);
  });

  test("a file at a previously-unavailable record's path still needs a fingerprint", () => {
    const records: BookRecords = { fp1: makeBookRecord({ available: false }) };
    expect(needing([makeFile()], records)).toHaveLength(1);
  });
});

// One non-default value per reader answer. Typed against the field list, so an answer
// added to READER_ANSWER_FIELDS without a sample here fails the table below.
const ANSWER_SAMPLES = {
  position: { line: 77, fraction: 0.5 },
  manualChapterPattern: 'volume',
  binding: { fictionDictionary: 'properNouns-f_TapDo' },
} as const;

describe('planReconciliation — resolve', () => {
  describe('a relink (moved or renamed file) keeps everything its fingerprint owns', () => {
    const movedFile = makeFile({ fileName: 'new-name.txt', title: 'New Name' });
    const fingerprints = new Map<string, BookFingerprint>([
      ['new-name.txt', { fingerprint: 'fp1', sizeBytes: 100 }],
    ]);

    test.each(READER_ANSWER_FIELDS)('the reader answer %s', (field) => {
      expect(ANSWER_SAMPLES).toHaveProperty(field);
      const existing = makeBookRecord({
        lastKnownPath: 'old-name.txt',
        [field]: ANSWER_SAMPLES[field],
      });

      const result = reconcile({ fp1: existing }, [movedFile], fingerprints);

      expect(result.records.fp1[field]).toEqual(ANSWER_SAMPLES[field]);
      expect(result.records.fp1.lastKnownPath).toBe('new-name.txt');
    });

    test('the content observations a scan cannot make: outline, line count, encoding', () => {
      const outline = {
        pattern: 'chapter' as const,
        candidates: [{ pattern: 'chapter' as const, hitCount: 800, medianGap: 60, regularity: 1 }],
      };
      const existing = makeBookRecord({ lastKnownPath: 'old-name.txt', chapterOutline: outline });

      const result = reconcile({ fp1: existing }, [movedFile], fingerprints);

      expect(result.records.fp1.chapterOutline).toEqual(outline);
      expect(result.records.fp1.lineCount).toBe(500);
      expect(result.records.fp1.encodingLabel).toBe('GBK');
      expect(result.records.fp1.title).toBe('New Name');
    });
  });

  test('round-trip: an unchanged file keeps its record exactly, with no fingerprint lookup needed', () => {
    const existing = makeBookRecord({ position: { line: 10, fraction: 0.3 } });
    const result = reconcile({ fp1: existing }, [makeFile()], new Map());

    expect(result.records.fp1).toEqual(existing);
    expect(result.shelfBooks).toEqual([{ ...makeFile(), fingerprint: 'fp1' }]);
    expect(result.unavailableBooks).toEqual([]);
  });

  test('a moved/renamed file relinks to its existing record by fingerprint, preserving position', () => {
    const existing = makeBookRecord({
      lastKnownPath: 'old-name.txt',
      position: { line: 77, fraction: 0.5 },
      binding: { fictionDictionary: 'properNouns-f_TapDo' },
    });
    const movedFile = makeFile({ fileName: 'new-name.txt', title: 'New Name' });
    const fingerprints = new Map<string, BookFingerprint>([
      ['new-name.txt', { fingerprint: 'fp1', sizeBytes: 100 }],
    ]);

    const result = reconcile({ fp1: existing }, [movedFile], fingerprints);

    expect(result.records.fp1.lastKnownPath).toBe('new-name.txt');
    expect(result.records.fp1.position).toEqual({ line: 77, fraction: 0.5 });
    // The binding is a reader answer too — surviving a rename is the whole
    // reason records are keyed by fingerprint rather than by path.
    expect(result.records.fp1.binding).toEqual({ fictionDictionary: 'properNouns-f_TapDo' });
    expect(result.records.fp1.title).toBe('New Name');
    expect(result.unavailableBooks).toEqual([]);
  });

  test('a fingerprint matching no record creates a fresh one with position: null', () => {
    const fingerprints = new Map<string, BookFingerprint>([
      ['novel.txt', { fingerprint: 'brand-new', sizeBytes: 100 }],
    ]);
    const result = reconcile({}, [makeFile()], fingerprints);

    expect(result.records['brand-new']).toMatchObject({
      fingerprint: 'brand-new',
      position: null,
      title: 'Novel',
      lastKnownPath: 'novel.txt',
      available: true,
    });
  });

  test('a previously-available record matched by nothing this scan becomes unavailable, kept not deleted', () => {
    const existing = makeBookRecord({ position: { line: 1, fraction: 0 } });
    const result = reconcile({ fp1: existing }, [], new Map());

    expect(result.records.fp1.available).toBe(false);
    expect(result.records.fp1.position).toEqual({ line: 1, fraction: 0 });
    expect(result.unavailableBooks).toEqual([
      {
        fingerprint: 'fp1',
        title: 'Novel',
        lastKnownPath: 'novel.txt',
      },
    ]);
  });

  test('an already-unavailable record that reappears (matched by fingerprint) is re-linked and marked available again', () => {
    const existing = makeBookRecord({
      available: false,
      lastKnownPath: 'old-drive/novel.txt',
      position: { line: 3, fraction: 0 },
    });
    const fingerprints = new Map<string, BookFingerprint>([
      ['novel.txt', { fingerprint: 'fp1', sizeBytes: 100 }],
    ]);

    const result = reconcile({ fp1: existing }, [makeFile()], fingerprints);

    expect(result.records.fp1.available).toBe(true);
    expect(result.records.fp1.lastKnownPath).toBe('novel.txt');
    expect(result.records.fp1.position).toEqual({ line: 3, fraction: 0 });
    expect(result.unavailableBooks).toEqual([]);
  });

  test('a file that needed a fingerprint but did not get one is left off the shelf, not fabricated', () => {
    const result = reconcile({}, [makeFile()], new Map());
    expect(result.shelfBooks).toEqual([]);
    expect(result.records).toEqual({});
  });

  test('a changed file with no fingerprint leaves the record at its path available, not missing', () => {
    const existing = makeBookRecord();
    const result = reconcile({ fp1: existing }, [makeFile({ modifiedMs: 2000 })], new Map());
    expect(result.shelfBooks).toEqual([]);
    expect(result.records.fp1).toEqual(existing);
    expect(result.unavailableBooks).toEqual([]);
  });

  test('resolve reads the fresh records: a position saved between the two reads survives', () => {
    const plan = planReconciliation({ fp1: makeBookRecord() }, [makeFile()]);
    const saved = makeBookRecord({ position: { line: 42, fraction: 0.25 } });

    const result = plan.resolve({ fp1: saved }, new Map());

    expect(result.records.fp1.position).toEqual({ line: 42, fraction: 0.25 });
    expect(result.shelfBooks).toEqual([{ ...makeFile(), fingerprint: 'fp1' }]);
  });

  test('a trusted file whose record vanished between the reads is off the shelf, not fabricated', () => {
    const plan = planReconciliation({ fp1: makeBookRecord() }, [makeFile()]);
    const result = plan.resolve({}, new Map());
    expect(result.shelfBooks).toEqual([]);
    expect(result.records).toEqual({});
  });
});

describe('reconcileLibraryScan', () => {
  beforeEach(() => {
    invalidateBookRecords();
    global.window.electronAPI = {} as unknown as typeof window.electronAPI;
    installFakeAppFile({ load: 'loadBookRecords', save: 'saveBookRecords' }, {});
  });

  test('rescanning an unchanged library recomputes no fingerprints', async () => {
    const existing = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const fingerprintFn = vi.fn();

    const result = await reconcileLibraryScan([makeFile()], null, fingerprintFn);

    expect(fingerprintFn).not.toHaveBeenCalled();
    expect(result.shelfBooks).toEqual([{ ...makeFile(), fingerprint: 'fp1' }]);
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

  test('a changed file whose fingerprint fails is off the shelf this pass, its record still available', async () => {
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: makeBookRecord() } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;
    const fingerprintFn = vi.fn(async () => {
      throw new Error('read error');
    });

    const result = await reconcileLibraryScan(
      [makeFile({ modifiedMs: 2000 })],
      null,
      fingerprintFn
    );

    expect(fingerprintFn).toHaveBeenCalledTimes(1);
    expect(result.shelfBooks).toEqual([]);
    // Still on disk: not "missing", and not persisted as unavailable.
    expect(result.unavailableBooks).toEqual([]);
    const [savedRecords] = saveFn.mock.calls[0] as [BookRecords];
    expect(savedRecords.fp1.available).toBe(true);
  });

  test('shelfBooks sorts A-Z by title, locale-aware, regardless of scan order', async () => {
    const files = [
      makeFile({ fileName: 'zebra.txt', title: 'Zebra' }),
      makeFile({ fileName: 'apple.txt', title: 'apple' }),
      makeFile({ fileName: 'eclair.txt', title: 'Éclair' }),
    ];
    const fingerprintFn = vi.fn(async (fileName: string) => ({
      fingerprint: `fp-${fileName}`,
      sizeBytes: 100,
    }));

    const result = await reconcileLibraryScan(files, null, fingerprintFn);

    // Plain byte order would put 'Zebra' (capital Z) before 'apple' (lowercase a) and
    // 'Éclair' (composed é) after both — none of that is true A-Z for a human reader.
    expect(result.shelfBooks.map((b) => b.title)).toEqual(['apple', 'Éclair', 'Zebra']);
  });
});
