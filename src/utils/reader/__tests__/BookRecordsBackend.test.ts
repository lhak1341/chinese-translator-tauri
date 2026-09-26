import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  loadBookRecords,
  saveBookRecords,
  invalidateBookRecords,
  setReadingPosition,
  setChapterOutline,
  setManualChapterPattern,
  setBookBinding,
  recordBookOpened,
  withBookRecordsLock,
  subscribeBookRecords,
  getBookRecordsSnapshot,
} from '../BookRecordsBackend';
import { READER_ANSWER_FIELDS } from '../BookRecord';
import { makeBookRecord } from './bookRecordFixture';

beforeEach(() => {
  invalidateBookRecords();
  global.window.electronAPI = {
    loadBookRecords: vi.fn().mockResolvedValue({ success: true, data: {} }),
    saveBookRecords: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.electronAPI;
});

describe('loadBookRecords', () => {
  test('returns the persisted records on success', async () => {
    const record = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: record } });
    expect(await loadBookRecords()).toEqual({ records: { fp1: record }, droppedCount: 0 });
  });

  test('caches after the first successful load — does not call IPC again', async () => {
    const loadFn = vi.fn().mockResolvedValue({ success: true, data: {} });
    window.electronAPI.loadBookRecords = loadFn;

    await loadBookRecords();
    await loadBookRecords();

    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  test('drops a malformed record and reports it in droppedCount, keeping valid siblings', async () => {
    window.electronAPI.loadBookRecords = vi.fn().mockResolvedValue({
      success: true,
      data: { fp1: makeBookRecord(), '': makeBookRecord({ fingerprint: 'ignored' }) },
    });

    const { records, droppedCount } = await loadBookRecords();

    expect(Object.keys(records)).toEqual(['fp1']);
    expect(droppedCount).toBe(1);
  });
});

describe('saveBookRecords', () => {
  test('saves via IPC and updates the cache', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    const records = { fp1: makeBookRecord() };
    await saveBookRecords(records);

    expect(saveFn).toHaveBeenCalledWith(records);
    expect(await loadBookRecords()).toEqual({ records, droppedCount: 0 });
  });

  test('throws when the save fails', async () => {
    window.electronAPI.saveBookRecords = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'disk full' });
    await expect(saveBookRecords({})).rejects.toThrow('disk full');
  });
});

describe('record cache subscription', () => {
  test('load, save and invalidate each notify, and the snapshot follows the cache', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBookRecords(listener);
    expect(getBookRecordsSnapshot()).toEqual({});

    const record = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: record } });
    await loadBookRecords();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBookRecordsSnapshot()).toEqual({ fp1: record });

    const saved = { fp1: makeBookRecord({ position: { line: 5, fraction: 0 } }) };
    await saveBookRecords(saved);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getBookRecordsSnapshot()).toBe(saved);

    invalidateBookRecords();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(getBookRecordsSnapshot()).toEqual({});

    unsubscribe();
    await saveBookRecords(saved);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test('a failed save leaves the cache alone and notifies no one', async () => {
    await saveBookRecords({ fp1: makeBookRecord() });
    const before = getBookRecordsSnapshot();
    const listener = vi.fn();
    const unsubscribe = subscribeBookRecords(listener);
    window.electronAPI.saveBookRecords = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'disk full' });

    await expect(saveBookRecords({})).rejects.toThrow('disk full');

    expect(listener).not.toHaveBeenCalled();
    expect(getBookRecordsSnapshot()).toBe(before);
    unsubscribe();
  });

  test('the snapshot is stable between changes', () => {
    expect(getBookRecordsSnapshot()).toBe(getBookRecordsSnapshot());
  });
});

describe('setReadingPosition', () => {
  test('preserves every cached field while updating only the position', async () => {
    const existing = makeBookRecord({ position: null, title: 'Kept Title' });
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setReadingPosition('fp1', { line: 5, fraction: 0.5 });

    expect(saveFn).toHaveBeenCalledWith({
      fp1: { ...existing, position: { line: 5, fraction: 0.5 } },
    });
  });

  test('skips silently when no record exists yet for the fingerprint', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setReadingPosition('missing-fp', { line: 5, fraction: 0.5 });

    expect(saveFn).not.toHaveBeenCalled();
  });
});

describe('setChapterOutline', () => {
  test('persists a freshly-elected outline, preserving every other field', async () => {
    const existing = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    const outline = {
      pattern: 'chapter' as const,
      candidates: [{ pattern: 'chapter' as const, hitCount: 800, medianGap: 60, regularity: 1 }],
    };
    await setChapterOutline('fp1', outline);

    expect(saveFn).toHaveBeenCalledWith({ fp1: { ...existing, chapterOutline: outline } });
  });

  test('skips silently when no record exists yet for the fingerprint', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setChapterOutline('missing-fp', { pattern: null, candidates: [] });

    expect(saveFn).not.toHaveBeenCalled();
  });
});

describe('setManualChapterPattern', () => {
  test('persists an override, preserving every other field', async () => {
    const existing = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setManualChapterPattern('fp1', 'volume');

    expect(saveFn).toHaveBeenCalledWith({ fp1: { ...existing, manualChapterPattern: 'volume' } });
  });

  test('clearing the override persists null', async () => {
    const existing = makeBookRecord({ manualChapterPattern: 'volume' });
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setManualChapterPattern('fp1', null);

    expect(saveFn).toHaveBeenCalledWith({ fp1: { ...existing, manualChapterPattern: null } });
  });

  test('skips silently when no record exists yet for the fingerprint', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setManualChapterPattern('missing-fp', 'chapter');

    expect(saveFn).not.toHaveBeenCalled();
  });
});

describe('setBookBinding', () => {
  test('persists a bound fiction dictionary, preserving every other field', async () => {
    const existing = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setBookBinding('fp1', { fictionDictionary: 'properNouns-f_TapDo' });

    expect(saveFn).toHaveBeenCalledWith({
      fp1: { ...existing, binding: { fictionDictionary: 'properNouns-f_TapDo' } },
    });
  });

  test('persists "no fiction dictionary" as an answer, not as an absent binding', async () => {
    const existing = makeBookRecord();
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setBookBinding('fp1', { fictionDictionary: null });

    expect(saveFn).toHaveBeenCalledWith({
      fp1: { ...existing, binding: { fictionDictionary: null } },
    });
  });

  test('skips silently when no record exists yet for the fingerprint', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveBookRecords = saveFn;

    await setBookBinding('missing-fp', { fictionDictionary: null });

    expect(saveFn).not.toHaveBeenCalled();
  });
});

// One non-default value per reader answer. Typed against the field list, so an answer
// added to READER_ANSWER_FIELDS without a sample here fails the table below.
const ANSWER_SAMPLES = {
  position: { line: 77, fraction: 0.5 },
  manualChapterPattern: 'volume',
  binding: { fictionDictionary: 'properNouns-f_TapDo' },
} as const;

describe('recordBookOpened', () => {
  test.each(READER_ANSWER_FIELDS)(
    'a reopen never overwrites the reader answer %s',
    async (field) => {
      expect(ANSWER_SAMPLES).toHaveProperty(field);
      const existing = makeBookRecord({ [field]: ANSWER_SAMPLES[field] });
      window.electronAPI.loadBookRecords = vi
        .fn()
        .mockResolvedValue({ success: true, data: { fp1: existing } });

      const record = await recordBookOpened('fp1', {
        title: 'New Title',
        lastKnownPath: 'renamed.txt',
        lineCount: 600,
        encodingLabel: 'UTF-8',
        sizeBytes: 200,
        modifiedMs: 2000,
      });

      expect(record[field]).toEqual(ANSWER_SAMPLES[field]);
      expect(record.lineCount).toBe(600);
    }
  );

  test('creates a fresh record with position: null when none existed', async () => {
    const record = await recordBookOpened('fp1', {
      title: 'Novel',
      lastKnownPath: 'novel.txt',
      lineCount: 500,
      encodingLabel: 'GBK',
      sizeBytes: 100,
      modifiedMs: 1000,
    });

    expect(record).toEqual(makeBookRecord());
  });

  test('preserves an existing position while refreshing cached fields', async () => {
    const existing = makeBookRecord({ position: { line: 99, fraction: 0.1 }, title: 'Old Title' });
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });

    const record = await recordBookOpened('fp1', {
      title: 'New Title',
      lastKnownPath: 'novel.txt',
      lineCount: 500,
      encodingLabel: 'GBK',
      sizeBytes: 100,
      modifiedMs: 1001,
    });

    expect(record.position).toEqual({ line: 99, fraction: 0.1 });
    expect(record.title).toBe('New Title');
  });

  test('preserves an existing binding while refreshing cached fields', async () => {
    const existing = makeBookRecord({ binding: { fictionDictionary: null } });
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });

    const record = await recordBookOpened('fp1', {
      title: 'New Title',
      lastKnownPath: 'renamed.txt',
      lineCount: 500,
      encodingLabel: 'GBK',
      sizeBytes: 100,
      modifiedMs: 1001,
    });

    // The answer "no fiction dictionary" must survive a reopen, or the offer comes back.
    expect(record.binding).toEqual({ fictionDictionary: null });
  });

  test('preserves an existing chapter outline and manual override while refreshing cached fields', async () => {
    const outline = {
      pattern: 'chapter' as const,
      candidates: [{ pattern: 'chapter' as const, hitCount: 800, medianGap: 60, regularity: 1 }],
    };
    const existing = makeBookRecord({ chapterOutline: outline, manualChapterPattern: 'volume' });
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });

    const record = await recordBookOpened('fp1', {
      title: 'New Title',
      lastKnownPath: 'novel.txt',
      lineCount: 500,
      encodingLabel: 'GBK',
      sizeBytes: 100,
      modifiedMs: 1001,
    });

    expect(record.chapterOutline).toEqual(outline);
    expect(record.manualChapterPattern).toBe('volume');
  });
});

describe('write coalescing', () => {
  test("withBookRecordsLock serializes concurrent writers — the second sees the first's result", async () => {
    let stored: Record<string, unknown> = {};
    window.electronAPI.loadBookRecords = vi.fn(async () => ({ success: true, data: stored }));
    window.electronAPI.saveBookRecords = vi.fn(async (records: Record<string, unknown>) => {
      stored = records;
      return { success: true };
    });

    // Both "writers" start from an empty map concurrently. Without the lock, the second
    // read-modify-write would read the map before the first writer's save landed and
    // clobber it — one of the two keys would be lost.
    const [a, b] = await Promise.all([
      withBookRecordsLock(async () => {
        const { records } = await loadBookRecords();
        await saveBookRecords({ ...records, fp1: makeBookRecord({ fingerprint: 'fp1' }) });
      }),
      withBookRecordsLock(async () => {
        const { records } = await loadBookRecords();
        await saveBookRecords({ ...records, fp2: makeBookRecord({ fingerprint: 'fp2' }) });
      }),
    ]);
    void a;
    void b;

    expect(Object.keys(stored).sort()).toEqual(['fp1', 'fp2']);
  });
});
