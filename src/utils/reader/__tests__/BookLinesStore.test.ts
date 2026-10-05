import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookLinesStore, LINES_PER_PAGE, PAGE_KEEP_RADIUS } from '../BookLinesStore';

const readBookLines = vi.fn();

global.window.electronAPI = {
  readBookLines: (fingerprint: string, start: number, end: number) =>
    readBookLines(fingerprint, start, end),
} as unknown as typeof window.electronAPI;

/** A page whose every line names its own file line number, so misfiling is visible. */
function pageFor(
  start: number,
  end: number
): { start: number; lines: string[]; lineCount: number } {
  const lines: string[] = [];
  for (let index = start; index < end; index += 1) {
    // Every third line is blank, the way a novel's are — they must keep their slots.
    lines.push(index % 3 === 0 ? '' : `line ${index}`);
  }
  return { start, lines, lineCount: 100_000 };
}

const LINE_COUNT = 75_000;

/** One macrotask turn: lets every mocked read that resolved immediately settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeStore(lineCount = LINE_COUNT) {
  const store = new BookLinesStore({ fingerprint: 'fp-1', lineCount });
  const listener = vi.fn();
  store.subscribe(listener);
  return { store, listener };
}

/** A read the test settles by hand, keyed by its start line. */
function deferReads() {
  const pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  readBookLines.mockImplementation(
    (_fingerprint: string, start: number, end: number) =>
      new Promise((resolve, reject) => {
        pending.set(start, { resolve: () => resolve(pageFor(start, end)), reject });
      })
  );
  return pending;
}

beforeEach(() => {
  readBookLines.mockReset();
  readBookLines.mockImplementation(async (_fingerprint: string, start: number, end: number) =>
    pageFor(start, end)
  );
});

describe('BookLinesStore pages', () => {
  it('fetches whole pages covering the requested range, once each', async () => {
    const { store } = makeStore();

    store.requestRange(600, 620);
    await flush();

    // One page covers the range, and asking again does not re-fetch it.
    expect(store.getLine(601)).toBe('line 601');
    expect(readBookLines).toHaveBeenCalledTimes(1);
    expect(readBookLines).toHaveBeenCalledWith('fp-1', LINES_PER_PAGE, LINES_PER_PAGE * 2);
    store.requestRange(600, 620);
    expect(readBookLines).toHaveBeenCalledTimes(1);
  });

  it('does not fetch a page already in flight', () => {
    deferReads();
    const { store } = makeStore();

    store.requestRange(0, 10);
    store.requestRange(0, 10);

    expect(readBookLines).toHaveBeenCalledTimes(1);
  });

  it('keeps blank lines addressable as empty strings', async () => {
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();

    // Line 3 is blank in the fixture: an empty string, not a missing line. If blanks were
    // dropped, line 4's text would have slid into this slot.
    expect(store.getLine(3)).toBe('');
    expect(store.getLine(4)).toBe('line 4');
  });

  it('reports a line it has not fetched as undefined rather than blank', () => {
    const { store } = makeStore();
    expect(store.getLine(40_000)).toBeUndefined();
  });

  it('drops pages the reader has scrolled far away from', async () => {
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();

    // Jump well beyond the keep radius. Reading a whole novel must not end with the whole
    // novel resident in the frontend.
    const farLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS + 20);
    store.requestRange(farLine, farLine + 10);
    await flush();

    expect(store.getLine(farLine + 2)).toBe(`line ${farLine + 2}`);
    expect(store.getLine(1)).toBeUndefined();
  });

  it('keeps pages within the radius so ordinary scrolling never re-fetches', async () => {
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();
    readBookLines.mockClear();

    store.requestRange(LINES_PER_PAGE * PAGE_KEEP_RADIUS, LINES_PER_PAGE * PAGE_KEEP_RADIUS + 10);
    await flush();
    store.requestRange(0, 10);

    expect(store.getLine(1)).toBe('line 1');
    expect(readBookLines).toHaveBeenCalledTimes(1);
  });

  it('clamps the last page to the book and never reads past its end', async () => {
    const shortBook = 750;
    const { store } = makeStore(shortBook);

    store.requestRange(0, 1_000);
    await flush();

    expect(readBookLines).toHaveBeenCalledTimes(2);
    expect(readBookLines).toHaveBeenLastCalledWith('fp-1', LINES_PER_PAGE, shortBook);
  });

  it('does not fetch for an empty book', () => {
    const { store } = makeStore(0);
    store.requestRange(0, 100);
    expect(readBookLines).not.toHaveBeenCalled();
  });
});

describe('BookLinesStore snapshot', () => {
  it('bumps linesVersion and notifies once per landed page', async () => {
    const { store, listener } = makeStore();

    store.requestRange(0, LINES_PER_PAGE + 10);
    await flush();

    expect(store.getSnapshot().linesVersion).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps one snapshot object until something changes', async () => {
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();
    const before = store.getSnapshot();

    store.requestRange(0, 10);

    expect(store.getSnapshot()).toBe(before);
  });

  it('does not bump linesVersion when pages are evicted', async () => {
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();
    const version = store.getSnapshot().linesVersion;

    const farLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS + 20);
    deferReads();
    store.requestRange(farLine, farLine + 10);

    expect(store.getLine(1)).toBeUndefined();
    expect(store.getSnapshot().linesVersion).toBe(version);
  });
});

describe('BookLinesStore errors', () => {
  it('surfaces a failed read instead of leaving the rows silently blank', async () => {
    readBookLines.mockRejectedValueOnce(new Error('No book is open'));
    const { store } = makeStore();

    store.requestRange(0, 10);
    await flush();

    expect(store.getSnapshot().error).toBe('No book is open');
  });

  it('keeps the error while the failed page is still blank, even as another page lands', async () => {
    readBookLines.mockRejectedValueOnce(new Error('page 0 failed'));
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();

    // Page 1 loads fine; page 0 is still blank, so the banner stays.
    store.requestRange(LINES_PER_PAGE, LINES_PER_PAGE + 10);
    await flush();

    expect(store.getLine(LINES_PER_PAGE + 2)).toBe(`line ${LINES_PER_PAGE + 2}`);
    expect(store.getLine(1)).toBeUndefined();
    expect(store.getSnapshot().error).toBe('page 0 failed');
  });

  it('clears the error when the failed page lands on a retry', async () => {
    readBookLines.mockRejectedValueOnce(new Error('page 0 failed'));
    const { store } = makeStore();
    store.requestRange(0, 10);
    await flush();

    store.requestRange(0, 10);
    await flush();

    expect(store.getLine(1)).toBe('line 1');
    expect(store.getSnapshot().error).toBeNull();
  });

  it('clears the error when the reader scrolls out of the failed page’s reach', async () => {
    readBookLines.mockRejectedValueOnce(new Error('page 0 failed'));
    const { store, listener } = makeStore();
    store.requestRange(0, 10);
    await flush();
    listener.mockClear();

    const farLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS + 20);
    deferReads();
    store.requestRange(farLine, farLine + 10);

    expect(store.getSnapshot().error).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores a failure for a page the reader has already left', async () => {
    const pending = deferReads();
    const { store } = makeStore();
    store.requestRange(0, 10);

    const farLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS + 20);
    store.requestRange(farLine, farLine + 10);
    pending.get(0)?.reject(new Error('late failure'));
    await flush();

    expect(store.getSnapshot().error).toBeNull();
  });
});

describe('BookLinesStore late results', () => {
  it('drops a page that lands after the reader scrolled away, without a notification', async () => {
    const pending = deferReads();
    const { store, listener } = makeStore();
    store.requestRange(0, 10);

    const farLine = LINES_PER_PAGE * (PAGE_KEEP_RADIUS + 20);
    store.requestRange(farLine, farLine + 10);
    pending.get(0)?.resolve();
    await flush();

    expect(store.getLine(1)).toBeUndefined();
    expect(store.getSnapshot().linesVersion).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops every result that lands after close()', async () => {
    const pending = deferReads();
    const { store, listener } = makeStore();
    store.requestRange(0, 10);

    store.close();
    pending.get(0)?.resolve();
    await flush();

    expect(store.getLine(1)).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not fetch while closed, and open() lifts the close', async () => {
    const { store } = makeStore();
    store.close();
    store.requestRange(0, 10);
    expect(readBookLines).not.toHaveBeenCalled();

    store.open();
    store.open();
    store.requestRange(0, 10);
    await flush();

    expect(store.getLine(1)).toBe('line 1');
  });
});
