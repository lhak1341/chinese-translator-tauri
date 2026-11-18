import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CandidateFinderStore,
  type FinderBackground,
  type FinderRunDictionaries,
} from '../CandidateFinderStore';
import type { QuickAddView } from '../../dictionary/QuickAddTarget';
import type { Candidate, CandidateProgress, CandidateRunResult } from '../../../types/ReaderTypes';

const findCandidates = vi.fn();
const cancelCandidateRun = vi.fn();
const onCandidateProgress = vi.fn();
const unlisten = vi.fn();
let emitProgress: (progress: CandidateProgress) => void = () => {};

global.window.electronAPI = {
  findCandidates: (...args: unknown[]) => findCandidates(...args),
  cancelCandidateRun: (runId: string) => cancelCandidateRun(runId),
  onCandidateProgress: (handler: (progress: CandidateProgress) => void) =>
    onCandidateProgress(handler),
} as unknown as typeof window.electronAPI;

const NAMES: Candidate[] = [{ text: '滕青山', count: 32, lineCount: 31, alsoIn: [] }];
const RESULT: CandidateRunResult = { candidates: NAMES, weakFiltering: true };
const BACKGROUND: FinderBackground = {
  libraryPath: '/library',
  books: [{ fingerprint: 'other', fileName: 'other.txt', encodingLabel: 'GBK' }],
};

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

const DICTIONARIES: FinderRunDictionaries = {
  ok: true,
  view: VIEW,
  phrases: ['phrase'],
  activeKeys: ['active'],
  inactive: [{ id: 'properNouns-f_Other', keys: ['other'] }],
  isPatternCovered: () => false,
};

function makeStore() {
  return new CandidateFinderStore({
    fingerprint: 'fp',
    getDictionaries: async () => DICTIONARIES,
    getBackground: async () => BACKGROUND,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
      BACKGROUND.books
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

  it('a refused snapshot ends the run with its message and starts nothing', async () => {
    const store = new CandidateFinderStore({
      fingerprint: 'fp',
      getDictionaries: async () => ({ ok: false, message: "Can't run: Novel couldn't be read." }),
    });
    await store.run();

    expect(store.getSnapshot()).toEqual({
      status: 'error',
      message: "Can't run: Novel couldn't be read.",
    });
    expect(findCandidates).not.toHaveBeenCalled();
    expect(cancelCandidateRun).not.toHaveBeenCalled();

    // The refusal does not wedge the store: a later run goes through.
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
    const isPatternCovered = vi.fn((text: string) => text === '三星卡片');
    const store = new CandidateFinderStore({
      fingerprint: 'fp',
      getDictionaries: async () => ({ ...DICTIONARIES, isPatternCovered }),
      getBackground: async () => BACKGROUND,
    });
    await store.run();

    expect(store.getSnapshot()).toEqual({
      ...DONE,
      candidates: NAMES,
      weakFiltering: false,
    });
    expect(isPatternCovered).toHaveBeenCalledTimes(2);
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
    const store = new CandidateFinderStore({
      fingerprint: 'fp',
      getDictionaries: async () => ({ ...DICTIONARIES, view }),
      getBackground: async () => BACKGROUND,
    });
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
});
