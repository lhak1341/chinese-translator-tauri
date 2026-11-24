import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CandidateFinderStore, type CandidateFinderInputs } from '../CandidateFinderStore';
import type { QuickAddView } from '../../dictionary/QuickAddTarget';
import type {
  BookRecords,
  Candidate,
  CandidateProgress,
  CandidateRunResult,
} from '../../../types/ReaderTypes';
import { installFakeConfigDisk } from '../../../test/fakeConfigDisk';
import { installFakeAppFile } from '../../../test/fakeAppFile';
import { invalidateBookRecords } from '../BookRecordsBackend';
import { makeBookRecord } from './bookRecordFixture';

const findCandidates = vi.fn();
const cancelCandidateRun = vi.fn();
const onCandidateProgress = vi.fn();
const unlisten = vi.fn();
let emitProgress: (progress: CandidateProgress) => void = () => {};

const NAMES: Candidate[] = [{ text: '滕青山', count: 32, lineCount: 31, alsoIn: [] }];
const RESULT: CandidateRunResult = { candidates: NAMES, weakFiltering: true };
const OTHER_BOOK = { fingerprint: 'other', fileName: 'other.txt', encodingLabel: 'GBK' };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const VIEW: QuickAddView = {
  defaultQuickAddDictionary: 'properNouns-f_Novel',
  activeProperNouns: ['properNouns-f_Novel'],
};
const DONE = { status: 'done' as const, view: VIEW };

/** The Dictionary Store as the run reads it: raw dictionaries, not a finder snapshot. */
let storeDictionaries: Record<string, object>;
let unreadDictionaryIds: string[];

function makeStore(overrides: Partial<CandidateFinderInputs> = {}) {
  return new CandidateFinderStore({
    fingerprint: 'fp',
    loadQuickAddView: async () => VIEW,
    readDictionaries: () => ({ dictionaries: storeDictionaries, unreadDictionaryIds }),
    ...overrides,
  });
}

let config: ReturnType<typeof installFakeConfigDisk>;
let records: ReturnType<typeof installFakeAppFile<BookRecords>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  storeDictionaries = {
    phrases: { phrase: {} },
    'properNouns-f_Novel': { active: {} },
    'properNouns-f_Other': { other: {} },
  };
  unreadDictionaryIds = [];
  global.window.electronAPI = {
    findCandidates: (...args: unknown[]) => findCandidates(...args),
    cancelCandidateRun: (runId: string) => cancelCandidateRun(runId),
    onCandidateProgress: (handler: (progress: CandidateProgress) => void) =>
      onCandidateProgress(handler),
  } as unknown as typeof window.electronAPI;
  config = installFakeConfigDisk({ libraryPath: '/library' });
  invalidateBookRecords();
  records = installFakeAppFile<BookRecords>(
    { load: 'loadBookRecords', save: 'saveBookRecords' },
    {
      fp: makeBookRecord({ fingerprint: 'fp', lastKnownPath: 'this.txt', available: true }),
      other: makeBookRecord({ fingerprint: 'other', lastKnownPath: 'other.txt', available: true }),
    }
  );
  cancelCandidateRun.mockResolvedValue(undefined);
  onCandidateProgress.mockImplementation(async (handler) => {
    emitProgress = handler;
    return unlisten;
  });
});

describe('CandidateFinderStore', () => {
  it('starts idle', () => {
    expect(makeStore().getSnapshot()).toEqual({ status: 'idle' });
  });

  it('runs on the open book with the dictionary snapshot and keeps the ranked list', async () => {
    findCandidates.mockResolvedValue(RESULT);
    const store = makeStore();
    await store.run();

    expect(findCandidates).toHaveBeenCalledWith(
      'fp',
      expect.any(String),
      ['phrase'],
      ['active'],
      [{ id: 'properNouns-f_Other', keys: ['other'] }],
      '/library',
      [OTHER_BOOK]
    );
    expect(store.getSnapshot()).toEqual({ ...DONE, candidates: NAMES, weakFiltering: true });
    expect(unlisten).toHaveBeenCalled();
  });

  it('shows the stage and percent of its own run while it runs', async () => {
    const pending = deferred<CandidateRunResult | null>();
    findCandidates.mockReturnValue(pending.promise);
    const store = makeStore();
    const running = store.run();
    await flush();
    const runId = findCandidates.mock.calls[0][1] as string;

    emitProgress({ runId: 'another-run', stage: 'scoring', percent: 90 });
    expect(store.getSnapshot()).toEqual({ status: 'running', stage: 'reading', percent: 0 });
    emitProgress({ runId, stage: 'counting', percent: 40 });
    expect(store.getSnapshot()).toEqual({ status: 'running', stage: 'counting', percent: 40 });

    pending.resolve(RESULT);
    await running;
  });

  it('a cancelled run returns to idle and its late result is ignored', async () => {
    const pending = deferred<CandidateRunResult | null>();
    findCandidates.mockReturnValue(pending.promise);
    const store = makeStore();
    const running = store.run();
    await flush();
    const runId = findCandidates.mock.calls[0][1] as string;

    store.cancel();
    expect(cancelCandidateRun).toHaveBeenCalledWith(runId);
    expect(store.getSnapshot()).toEqual({ status: 'idle' });

    pending.resolve(RESULT);
    await running;
    expect(store.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('a cancelled run finishing late leaves the next run listening', async () => {
    const first = deferred<CandidateRunResult | null>();
    const second = deferred<CandidateRunResult | null>();
    findCandidates.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const unlistenFirst = vi.fn();
    const unlistenSecond = vi.fn();
    onCandidateProgress
      .mockImplementationOnce(async () => unlistenFirst)
      .mockImplementationOnce(async () => unlistenSecond);
    const store = makeStore();

    const firstRun = store.run();
    await flush();
    store.cancel();
    const secondRun = store.run();
    await flush();
    first.resolve(null);
    await firstRun;

    expect(unlistenFirst).toHaveBeenCalledTimes(1);
    expect(unlistenSecond).not.toHaveBeenCalled();
    second.resolve(RESULT);
    await secondRun;
    expect(unlistenSecond).toHaveBeenCalledTimes(1);
  });

  it('never reuses a run id, across runs and across stores for the same book', async () => {
    findCandidates.mockResolvedValue(RESULT);
    const first = makeStore();
    await first.run();
    await first.run();
    // A reopened book: BookReader remounts and builds a new store for the same fingerprint.
    await makeStore().run();

    const runIds = findCandidates.mock.calls.map((call) => call[1]);
    expect(runIds).toHaveLength(3);
    expect(new Set(runIds).size).toBe(3);
  });

  it('a cancel before the command was invoked sends no cancel', async () => {
    const store = makeStore();
    const running = store.run();
    store.cancel();
    await running;
    expect(cancelCandidateRun).not.toHaveBeenCalled();
    expect(findCandidates).not.toHaveBeenCalled();
  });

  it('runs again after dispose then open, as StrictMode re-mounts the same store', async () => {
    findCandidates.mockResolvedValue(RESULT);
    const store = makeStore();
    store.dispose();
    store.open();
    await store.run();
    expect(store.getSnapshot()).toEqual({ ...DONE, candidates: NAMES, weakFiltering: true });
  });

  it('an unread active dictionary refuses the run, names it and starts nothing', async () => {
    delete storeDictionaries['properNouns-f_Novel'];
    unreadDictionaryIds = ['properNouns-f_Novel'];
    const store = makeStore();
    await store.run();

    expect(store.getSnapshot()).toEqual({
      status: 'error',
      message: "Can't run: f_Novel couldn't be read. Repair the file and Reload, then run again.",
    });
    expect(findCandidates).not.toHaveBeenCalled();
    expect(cancelCandidateRun).not.toHaveBeenCalled();

    // The refusal does not wedge the store: a later run goes through.
    storeDictionaries['properNouns-f_Novel'] = { active: {} };
    unreadDictionaryIds = [];
    findCandidates.mockResolvedValue(RESULT);
    const recovering = makeStore();
    await recovering.run();
    expect(recovering.getSnapshot()).toEqual({
      ...DONE,
      candidates: NAMES,
      weakFiltering: true,
    });
  });

  it('drops the survivors its dictionaries say a pattern covers when the run lands', async () => {
    const covered: Candidate = { text: '三星卡片', count: 40, lineCount: 40, alsoIn: [] };
    findCandidates.mockResolvedValue({ candidates: [covered, ...NAMES], weakFiltering: false });
    // `#星X` with X = 卡片, a key of the active proper-noun dictionary.
    storeDictionaries.patterns = { '#星X': {} };
    storeDictionaries['properNouns-f_Novel'] = { active: {}, 卡片: {} };
    const store = makeStore();
    await store.run();

    expect(store.getSnapshot()).toEqual({
      ...DONE,
      candidates: NAMES,
      weakFiltering: false,
    });
  });

  it('a null result (cancelled in Rust) is idle, not an empty list', async () => {
    findCandidates.mockResolvedValue(null);
    const store = makeStore();
    await store.run();
    expect(store.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('cancel keeps a finished list, so reopening the panel shows it at once', async () => {
    findCandidates.mockResolvedValue(RESULT);
    const store = makeStore();
    await store.run();
    store.cancel();

    expect(store.getSnapshot()).toEqual({ ...DONE, candidates: NAMES, weakFiltering: true });
    expect(cancelCandidateRun).not.toHaveBeenCalled();
  });

  it('dispose cancels a running run and drops a finished list', async () => {
    const pending = deferred<CandidateRunResult | null>();
    findCandidates.mockReturnValue(pending.promise);
    const store = makeStore();
    const running = store.run();
    await flush();
    store.dispose();
    pending.resolve(RESULT);
    await running;

    expect(cancelCandidateRun).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ status: 'idle' });

    findCandidates.mockResolvedValue(RESULT);
    const finished = makeStore();
    await finished.run();
    finished.dispose();
    expect(finished.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('a failed run shows its message and can be run again', async () => {
    findCandidates.mockRejectedValueOnce(new Error('A different book is open'));
    const store = makeStore();
    await store.run();
    expect(store.getSnapshot()).toEqual({ status: 'error', message: 'A different book is open' });

    findCandidates.mockResolvedValue({ candidates: [], weakFiltering: false });
    await store.run();
    expect(store.getSnapshot()).toEqual({ ...DONE, candidates: [], weakFiltering: false });
  });

  it('a second run call while one is running starts nothing', async () => {
    const pending = deferred<CandidateRunResult | null>();
    findCandidates.mockReturnValue(pending.promise);
    const store = makeStore();
    const first = store.run();
    await flush();
    await store.run();
    expect(findCandidates).toHaveBeenCalledTimes(1);
    pending.resolve([]);
    await first;
  });

  it('still runs when the progress listener cannot be set up', async () => {
    onCandidateProgress.mockRejectedValue(new Error('no events'));
    findCandidates.mockResolvedValue(RESULT);
    const store = makeStore();
    await store.run();
    expect(store.getSnapshot()).toEqual({ ...DONE, candidates: NAMES, weakFiltering: true });
  });

  it("the list carries the quick-add view its own run read, and only a finished run's", async () => {
    const rebound: QuickAddView = {
      defaultQuickAddDictionary: 'properNouns-f_Other',
      activeProperNouns: ['properNouns-f_Other'],
    };
    let view = VIEW;
    const store = makeStore({ loadQuickAddView: async () => view });
    findCandidates.mockResolvedValue(RESULT);
    await store.run();
    expect(store.getSnapshot()).toMatchObject({ status: 'done', view: VIEW });

    // A rebind, then a run the reader cancels: it read the new view, but its list never
    // landed, so nothing is shown that the new view could be paired with.
    view = rebound;
    const pending = deferred<CandidateRunResult | null>();
    findCandidates.mockReturnValue(pending.promise);
    const cancelled = store.run();
    await flush();
    store.cancel();
    pending.resolve(RESULT);
    await cancelled;
    expect(store.getSnapshot()).not.toMatchObject({ view: rebound });

    findCandidates.mockResolvedValue(RESULT);
    await store.run();
    expect(store.getSnapshot()).toMatchObject({ status: 'done', view: rebound });
  });
  describe('what a run reads', () => {
    it('a configuration that could not be read refuses the run and starts nothing', async () => {
      const store = makeStore({ loadQuickAddView: async () => null });
      await store.run();
      expect(store.getSnapshot()).toEqual({
        status: 'error',
        message: "Can't run: the configuration couldn't be read.",
      });
      expect(findCandidates).not.toHaveBeenCalled();
    });

    it('reads the Dictionary Store once the view is known, not before', async () => {
      const view = deferred<QuickAddView | null>();
      findCandidates.mockResolvedValue(RESULT);
      const store = makeStore({ loadQuickAddView: () => view.promise });
      const running = store.run();
      await flush();
      // An Add lands while the view loads: the run must send it.
      storeDictionaries = { ...storeDictionaries, 'properNouns-f_Novel': { active: {}, 新名: {} } };
      view.resolve(VIEW);
      await running;
      expect(findCandidates.mock.calls[0][3]).toEqual(['active', '新名']);
    });

    it('an unreadable config runs with no library folder', async () => {
      config.loadConfiguration.mockRejectedValue(new Error('EACCES'));
      findCandidates.mockResolvedValue(RESULT);
      await makeStore().run();
      expect(findCandidates.mock.calls[0][5]).toBeNull();
      expect(findCandidates.mock.calls[0][6]).toEqual([OTHER_BOOK]);
    });

    it('unreadable book records run with no background books', async () => {
      records.load.mockResolvedValue({ success: false, data: {} });
      findCandidates.mockResolvedValue(RESULT);
      await makeStore().run();
      expect(findCandidates.mock.calls[0][5]).toBe('/library');
      expect(findCandidates.mock.calls[0][6]).toEqual([]);
    });

    it('the open book is not its own background', async () => {
      findCandidates.mockResolvedValue(RESULT);
      await makeStore().run();
      const books = findCandidates.mock.calls[0][6] as { fingerprint: string }[];
      expect(books.map((book) => book.fingerprint)).toEqual(['other']);
    });
  });
});
