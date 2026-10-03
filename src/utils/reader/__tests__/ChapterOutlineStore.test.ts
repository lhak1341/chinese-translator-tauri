import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChapterOutlineStore, type ChapterOutlineInputs } from '../ChapterOutlineStore';
import type {
  ChapterHeader,
  ChapterOutline,
  ChapterOutlineSummary,
} from '../../../types/ReaderTypes';

const detectChapterOutline = vi.fn();
const chapterHeadersForPattern = vi.fn();
const setChapterOutline = vi.fn();
const setManualChapterPattern = vi.fn();

vi.mock('../../../tauriAPI', () => ({
  default: {
    detectChapterOutline: (fingerprint: string) => detectChapterOutline(fingerprint),
    chapterHeadersForPattern: (fingerprint: string, pattern: string) =>
      chapterHeadersForPattern(fingerprint, pattern),
  },
}));

vi.mock('../BookRecordsBackend', () => ({
  setChapterOutline: (fingerprint: string, outline: unknown) =>
    setChapterOutline(fingerprint, outline),
  setManualChapterPattern: (fingerprint: string, pattern: string | null) =>
    setManualChapterPattern(fingerprint, pattern),
}));

const FULL_ELECTION: ChapterOutline = {
  candidates: [
    { pattern: 'chapter', hitCount: 800, medianGap: 60, regularity: 1 },
    { pattern: 'volume', hitCount: 10, medianGap: 6000, regularity: 1 },
  ],
  elected: 'chapter',
  headers: [
    { line: 0, title: 'Chapter 1' },
    { line: 60, title: 'Chapter 2' },
  ],
};

const CACHED: ChapterOutlineSummary = {
  pattern: 'chapter',
  candidates: FULL_ELECTION.candidates,
};

const VOLUME_HEADERS: ChapterHeader[] = [{ line: 5, title: 'Volume 1' }];

/** One macrotask turn: lets every already-resolved promise chain run to its end. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function opened(overrides: Partial<ChapterOutlineInputs> = {}) {
  const store = new ChapterOutlineStore({
    fingerprint: 'fp1',
    cachedOutline: null,
    cachedManualPattern: null,
    ...overrides,
  });
  store.open();
  return store;
}

beforeEach(() => {
  detectChapterOutline.mockReset();
  chapterHeadersForPattern.mockReset();
  setChapterOutline.mockReset();
  setManualChapterPattern.mockReset();
  setChapterOutline.mockResolvedValue(undefined);
  setManualChapterPattern.mockResolvedValue(undefined);
});

describe('ChapterOutlineStore', () => {
  it('runs full election on a fingerprint with no cached outline, reusing the winner headers', async () => {
    detectChapterOutline.mockResolvedValue(FULL_ELECTION);
    const store = opened();
    expect(store.getSnapshot().isLoading).toBe(true);

    await flush();

    const snapshot = store.getSnapshot();
    expect(detectChapterOutline).toHaveBeenCalledWith('fp1');
    expect(chapterHeadersForPattern).not.toHaveBeenCalled();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.headers).toEqual(FULL_ELECTION.headers);
    expect(snapshot.candidates).toEqual(FULL_ELECTION.candidates);
    expect(snapshot.activePattern).toBe('chapter');
    expect(snapshot.isOverridden).toBe(false);
    expect(setChapterOutline).toHaveBeenCalledWith('fp1', {
      pattern: 'chapter',
      candidates: FULL_ELECTION.candidates,
    });
  });

  it('fetches headers for a persisted override instead of the freshly-elected pattern', async () => {
    detectChapterOutline.mockResolvedValue(FULL_ELECTION);
    chapterHeadersForPattern.mockResolvedValue(VOLUME_HEADERS);
    const store = opened({ cachedManualPattern: 'volume' });

    await flush();

    expect(chapterHeadersForPattern).toHaveBeenCalledWith('fp1', 'volume');
    expect(store.getSnapshot().headers).toEqual(VOLUME_HEADERS);
    expect(store.getSnapshot().activePattern).toBe('volume');
    expect(store.getSnapshot().isOverridden).toBe(true);
    expect(store.getSnapshot().isLoading).toBe(false);
  });

  it('skips election when a cached outline exists, fetching only its headers', async () => {
    chapterHeadersForPattern.mockResolvedValue(FULL_ELECTION.headers);
    const store = opened({ cachedOutline: CACHED });
    // The cached candidates are there before any fetch lands.
    expect(store.getSnapshot().candidates).toEqual(FULL_ELECTION.candidates);

    await flush();

    expect(detectChapterOutline).not.toHaveBeenCalled();
    expect(chapterHeadersForPattern).toHaveBeenCalledWith('fp1', 'chapter');
    expect(store.getSnapshot().headers).toEqual(FULL_ELECTION.headers);
    expect(store.getSnapshot().isLoading).toBe(false);
  });

  it('reports no headers and no active pattern when a cached outline elected nothing', async () => {
    const store = opened({ cachedOutline: { pattern: null, candidates: CACHED.candidates } });

    await flush();

    expect(chapterHeadersForPattern).not.toHaveBeenCalled();
    expect(store.getSnapshot().headers).toEqual([]);
    expect(store.getSnapshot().activePattern).toBeNull();
    expect(store.getSnapshot().isLoading).toBe(false);
  });

  it('setOverride switches the active pattern, fetches its headers, and persists the choice', async () => {
    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);
    const store = opened({ cachedOutline: CACHED });
    await flush();

    chapterHeadersForPattern.mockResolvedValueOnce(VOLUME_HEADERS);
    store.setOverride('volume');
    expect(store.getSnapshot().isLoading).toBe(true);
    await flush();

    const snapshot = store.getSnapshot();
    expect(chapterHeadersForPattern).toHaveBeenLastCalledWith('fp1', 'volume');
    expect(snapshot.headers).toEqual(VOLUME_HEADERS);
    expect(snapshot.activePattern).toBe('volume');
    expect(snapshot.isOverridden).toBe(true);
    expect(snapshot.isLoading).toBe(false);
    expect(setManualChapterPattern).toHaveBeenCalledWith('fp1', 'volume');
  });

  it('setOverride(null) reverts to the elected pattern', async () => {
    chapterHeadersForPattern.mockResolvedValueOnce(VOLUME_HEADERS);
    const store = opened({ cachedOutline: CACHED, cachedManualPattern: 'volume' });
    await flush();
    expect(store.getSnapshot().isOverridden).toBe(true);

    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);
    store.setOverride(null);
    await flush();

    expect(chapterHeadersForPattern).toHaveBeenLastCalledWith('fp1', 'chapter');
    expect(store.getSnapshot().activePattern).toBe('chapter');
    expect(store.getSnapshot().isOverridden).toBe(false);
    expect(setManualChapterPattern).toHaveBeenCalledWith('fp1', null);
  });

  it('a slower mount-fetch resolving after a faster override-fetch does not clobber the override', async () => {
    const mountFetch = deferred<ChapterHeader[]>();
    chapterHeadersForPattern.mockImplementationOnce(() => mountFetch.promise);
    const store = opened({ cachedOutline: CACHED });

    chapterHeadersForPattern.mockResolvedValueOnce(VOLUME_HEADERS);
    store.setOverride('volume');
    await flush();
    expect(store.getSnapshot().headers).toEqual(VOLUME_HEADERS);

    mountFetch.resolve(FULL_ELECTION.headers);
    await flush();

    expect(store.getSnapshot().activePattern).toBe('volume');
    expect(store.getSnapshot().headers).toEqual(VOLUME_HEADERS);
    expect(store.getSnapshot().isLoading).toBe(false);
  });

  it('surfaces a failed election as an error rather than throwing', async () => {
    detectChapterOutline.mockRejectedValue(new Error('boom'));
    const store = opened();

    await flush();

    expect(store.getSnapshot().error).toBe('boom');
    expect(store.getSnapshot().headers).toEqual([]);
    expect(store.getSnapshot().isLoading).toBe(false);
  });

  it('notifies subscribers on every change and stops after unsubscribe', async () => {
    chapterHeadersForPattern.mockResolvedValue(FULL_ELECTION.headers);
    const store = new ChapterOutlineStore({
      fingerprint: 'fp1',
      cachedOutline: CACHED,
      cachedManualPattern: null,
    });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();

    store.open();
    await flush();
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).not.toBe(before);

    unsubscribe();
    listener.mockClear();
    store.setOverride('volume');
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('an override persisted in the order it was chosen', () => {
  it('writes each pick when it is made, even when the first pick resolves last', async () => {
    const slow = deferred<ChapterHeader[]>();
    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);
    const store = opened({ cachedOutline: CACHED });
    await flush();

    chapterHeadersForPattern.mockImplementationOnce(() => slow.promise);
    chapterHeadersForPattern.mockResolvedValueOnce(VOLUME_HEADERS);
    store.setOverride('volume');
    store.setOverride('chapter');

    // Both writes are already issued, in call order, before either fetch has resolved.
    expect(setManualChapterPattern.mock.calls).toEqual([
      ['fp1', 'volume'],
      ['fp1', 'chapter'],
    ]);

    slow.resolve([{ line: 9, title: 'stale' }]);
    await flush();
    expect(store.getSnapshot().activePattern).toBe('chapter');
    expect(store.getSnapshot().headers).toEqual(VOLUME_HEADERS);
  });

  it('keeps going when persisting fails', async () => {
    chapterHeadersForPattern.mockResolvedValueOnce(FULL_ELECTION.headers);
    const store = opened({ cachedOutline: CACHED });
    await flush();

    setManualChapterPattern.mockRejectedValueOnce(new Error('disk'));
    chapterHeadersForPattern.mockResolvedValueOnce(VOLUME_HEADERS);
    store.setOverride('volume');
    await flush();

    expect(store.getSnapshot().headers).toEqual(VOLUME_HEADERS);
    expect(store.getSnapshot().error).toBeNull();
  });
});

describe('an override set while the first election is still running', () => {
  it('going back to Auto does not cost the election its candidates, elected pattern or headers', async () => {
    const election = deferred<ChapterOutline>();
    detectChapterOutline.mockImplementationOnce(() => election.promise);
    const store = opened({ cachedManualPattern: 'volume' });

    store.setOverride(null);
    await flush();
    expect(store.getSnapshot().isOverridden).toBe(false);
    election.resolve(FULL_ELECTION);
    await flush();

    const snapshot = store.getSnapshot();
    expect(snapshot.candidates).toEqual(FULL_ELECTION.candidates);
    expect(snapshot.activePattern).toBe('chapter');
    expect(snapshot.headers).toEqual(FULL_ELECTION.headers);
    expect(snapshot.isLoading).toBe(false);
  });

  it('a chosen pattern keeps its own headers when the election lands, and the election still lands', async () => {
    const election = deferred<ChapterOutline>();
    detectChapterOutline.mockImplementationOnce(() => election.promise);
    chapterHeadersForPattern.mockResolvedValue(VOLUME_HEADERS);
    const store = opened();

    store.setOverride('volume');
    await flush();
    expect(store.getSnapshot().headers).toEqual(VOLUME_HEADERS);
    // Still waiting on election, so the override's own fetch must not end loading.
    expect(store.getSnapshot().isLoading).toBe(true);

    election.resolve(FULL_ELECTION);
    await flush();

    const snapshot = store.getSnapshot();
    expect(snapshot.candidates).toEqual(FULL_ELECTION.candidates);
    expect(snapshot.activePattern).toBe('volume');
    expect(snapshot.isOverridden).toBe(true);
    expect(snapshot.headers).toEqual(VOLUME_HEADERS);
    expect(snapshot.isLoading).toBe(false);
  });
});

describe('close', () => {
  it('drops an election that lands afterwards: nothing applied, nothing cached', async () => {
    const election = deferred<ChapterOutline>();
    detectChapterOutline.mockImplementationOnce(() => election.promise);
    const store = opened();
    const before = store.getSnapshot();

    store.close();
    election.resolve(FULL_ELECTION);
    await flush();

    expect(store.getSnapshot()).toBe(before);
    expect(setChapterOutline).not.toHaveBeenCalled();
  });

  it('drops a headers fetch that lands afterwards, and ignores a later override', async () => {
    const fetch = deferred<ChapterHeader[]>();
    chapterHeadersForPattern.mockImplementationOnce(() => fetch.promise);
    const store = opened({ cachedOutline: CACHED });
    const before = store.getSnapshot();

    store.close();
    fetch.resolve(FULL_ELECTION.headers);
    store.setOverride('volume');
    await flush();

    expect(store.getSnapshot()).toBe(before);
    expect(setManualChapterPattern).not.toHaveBeenCalled();
  });

  it('a reopen (remount) lifts the close without running the book a second time', async () => {
    chapterHeadersForPattern.mockResolvedValue(FULL_ELECTION.headers);
    const store = opened({ cachedOutline: CACHED });
    store.close();
    store.open();
    await flush();

    expect(chapterHeadersForPattern).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().headers).toEqual(FULL_ELECTION.headers);
  });
});
