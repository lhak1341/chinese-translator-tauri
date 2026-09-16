import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  loadBookRecords,
  saveBookRecords,
  invalidateBookRecords,
  setReadingPosition,
  recordBookOpened,
  withBookRecordsLock,
} from '../BookRecordsBackend';
import type { BookRecord } from '../../../types/ReaderTypes';

function makeRecord(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    fingerprint: 'fp1',
    position: null,
    title: 'Novel',
    lastKnownPath: 'novel.txt',
    lineCount: 1000,
    encodingLabel: 'GBK',
    sizeBytes: 12345,
    modifiedMs: 1700000000000,
    available: true,
    ...overrides,
  };
}

beforeEach(() => {
  invalidateBookRecords();
  global.window.electronAPI = {
    loadBookRecords: vi.fn().mockResolvedValue({ success: true, data: {} }),
    saveBookRecords: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.electronAPI;
});

describe('loadBookRecords', () => {
  test('returns the persisted records on success', async () => {
    const record = makeRecord();
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
      data: { fp1: makeRecord(), '': makeRecord({ fingerprint: 'ignored' }) },
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

    const records = { fp1: makeRecord() };
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

describe('setReadingPosition', () => {
  test('preserves every cached field while updating only the position', async () => {
    const existing = makeRecord({ position: null, title: 'Kept Title' });
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

describe('recordBookOpened', () => {
  test('creates a fresh record with position: null when none existed', async () => {
    const record = await recordBookOpened('fp1', {
      title: 'Novel',
      lastKnownPath: 'novel.txt',
      lineCount: 1000,
      encodingLabel: 'GBK',
      sizeBytes: 12345,
      modifiedMs: 1700000000000,
    });

    expect(record).toEqual(makeRecord());
  });

  test('preserves an existing position while refreshing cached fields', async () => {
    const existing = makeRecord({ position: { line: 99, fraction: 0.1 }, title: 'Old Title' });
    window.electronAPI.loadBookRecords = vi
      .fn()
      .mockResolvedValue({ success: true, data: { fp1: existing } });

    const record = await recordBookOpened('fp1', {
      title: 'New Title',
      lastKnownPath: 'novel.txt',
      lineCount: 1000,
      encodingLabel: 'GBK',
      sizeBytes: 12345,
      modifiedMs: 1700000000001,
    });

    expect(record.position).toEqual({ line: 99, fraction: 0.1 });
    expect(record.title).toBe('New Title');
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
        await saveBookRecords({ ...records, fp1: makeRecord({ fingerprint: 'fp1' }) });
      }),
      withBookRecordsLock(async () => {
        const { records } = await loadBookRecords();
        await saveBookRecords({ ...records, fp2: makeRecord({ fingerprint: 'fp2' }) });
      }),
    ]);
    void a;
    void b;

    expect(Object.keys(stored).sort()).toEqual(['fp1', 'fp2']);
  });
});
