import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReaderTab from '../ReaderTab';
import type { LibraryBook, OpenBook, EncodingReport } from '../../../types/ReaderTypes';

/**
 * Characterization suite for `ReaderTab`'s `openBook` — first-ever coverage of this
 * component (architecture review candidate #6 grilling, 2026-09-19). The split into two
 * named functions the review originally proposed was rejected (deletion test: the branch
 * has to live behind one caller-facing entry point regardless — see ADR-044); what these
 * tests pin down instead is the actual behavioral contract of that one function's two
 * branches: reopen (skips the decode round trip, re-reads the record) vs fresh-open
 * (decodes via `tauriAPI.openBook`, then records it) — plus the dedup guard and the two
 * failure paths (`needsEncoding`, a thrown error).
 */

const tauriAPI = vi.hoisted(() => ({
  scanLibrary: vi.fn(),
  openBook: vi.fn(),
}));
vi.mock('../../../tauriAPI', () => ({ default: tauriAPI }));

const appConfig = vi.hoisted(() => ({
  loadAppConfig: vi.fn(),
  saveAppConfig: vi.fn(),
}));
vi.mock('../../../utils/appConfig', () => appConfig);

const bookRecordsBackend = vi.hoisted(() => {
  // A real serial queue, not a pass-through: the reopen path's ordering against a write
  // already queued is part of what this suite pins down.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    loadBookRecords: vi.fn(),
    recordBookOpened: vi.fn(),
    withBookRecordsLock: <T,>(fn: () => Promise<T>): Promise<T> => {
      const result = queue.then(fn, fn);
      queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
});
vi.mock('../../../utils/reader/BookRecordsBackend', () => bookRecordsBackend);

const reconcile = vi.hoisted(() => ({
  reconcileLibraryScan: vi.fn(),
}));
vi.mock('../../../utils/reader/ReconcileLibrary', () => reconcile);

const announceOpenBook = vi.hoisted(() => vi.fn());
vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => ({ announceOpenBook }),
}));

// The real hook needs `EngineProvider`; the queue itself is `createReaderEngine`'s to test.
const readerEngine = vi.hoisted(() => ({
  translateChunk: vi.fn(),
  translateGloss: vi.fn(),
  translateOutlineBatch: vi.fn(),
}));
vi.mock('../../../hooks/useReaderEngine', () => ({ useReaderEngine: () => readerEngine }));

// Stubs stand in for the three heavy children: real Bookshelf/BookReader/EncodingPrompt
// pull in virtualizers and engine context this suite has no reason to set up. Each exposes
// just enough to drive `openBook`'s branches and observe what state it produced.
vi.mock('../Bookshelf', () => ({
  default: ({ books, onOpen }: { books: LibraryBook[]; onOpen: (b: LibraryBook) => void }) => (
    <div>
      {books.map((b) => (
        <button key={b.fileName} onClick={() => onOpen(b)}>
          open:{b.fileName}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../BookReader', () => ({
  default: ({
    book,
    record,
    onBack,
  }: {
    book: OpenBook;
    record: { position: unknown };
    onBack: () => void;
  }) => (
    <div>
      <span>reading:{book.fileName}</span>
      <span>position:{JSON.stringify(record.position)}</span>
      <button onClick={onBack}>back</button>
    </div>
  ),
}));
vi.mock('../EncodingPrompt', () => ({
  default: () => <div>needs-encoding</div>,
}));

const libraryBook: LibraryBook = {
  fileName: 'novel.txt',
  title: 'novel',
  sizeBytes: 100,
  modifiedMs: 0,
};

const encoding: EncodingReport = {
  label: 'UTF-8',
  detectedLabel: 'UTF-8',
  confidence: 'high',
  strictlyClean: true,
  overridden: false,
  reason: null,
  candidates: [],
};

const openedBook: OpenBook = {
  fingerprint: 'fp-1',
  fileName: 'novel.txt',
  title: 'novel',
  lineCount: 100,
  sizeBytes: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  appConfig.loadAppConfig.mockResolvedValue({ reader: { libraryPath: null } });
  tauriAPI.scanLibrary.mockResolvedValue({ libraryPath: '/lib', books: [libraryBook] });
  reconcile.reconcileLibraryScan.mockResolvedValue({
    shelfBooks: [{ ...libraryBook, fingerprint: 'fp-1' }],
    unavailableBooks: [],
  });
});

describe('ReaderTab openBook', () => {
  it('fresh-open: decodes via tauriAPI, records it, announces the new identity, and starts reading', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: { line: 5, fraction: 0 },
      chapterOutline: null,
      manualChapterPattern: null,
      binding: { fictionDictionary: 'properNouns-f_Novel' },
    });

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));

    await screen.findByText('reading:novel.txt');
    expect(tauriAPI.openBook).toHaveBeenCalledWith('novel.txt', null, null);
    expect(bookRecordsBackend.recordBookOpened).toHaveBeenCalledWith(
      'fp-1',
      expect.objectContaining({ title: 'novel', lineCount: 100 })
    );
    expect(announceOpenBook).toHaveBeenCalledWith(
      { fingerprint: 'fp-1', fileName: 'novel.txt', title: 'novel' },
      { fictionDictionary: 'properNouns-f_Novel' }
    );
    expect(screen.getByText('position:{"line":5,"fraction":0}')).toBeInTheDocument();
  });

  it('reopen: skips the decode round trip and re-reads the record instead', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: null,
      chapterOutline: null,
      manualChapterPattern: null,
      binding: null,
    });

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));
    await screen.findByText('reading:novel.txt');
    fireEvent.click(screen.getByText('back'));

    bookRecordsBackend.loadBookRecords.mockResolvedValue({
      records: {
        'fp-1': {
          position: { line: 42, fraction: 0.5 },
          chapterOutline: null,
          manualChapterPattern: null,
          binding: { fictionDictionary: 'properNouns-f_Novel' },
        },
      },
      droppedCount: 0,
    });
    fireEvent.click(await screen.findByText('open:novel.txt'));

    await waitFor(() =>
      expect(screen.getByText('position:{"line":42,"fraction":0.5}')).toBeInTheDocument()
    );
    // The decode round trip never runs a second time — the whole point of the reopen path.
    expect(tauriAPI.openBook).toHaveBeenCalledTimes(1);
    expect(bookRecordsBackend.loadBookRecords).toHaveBeenCalledTimes(1);
    expect(announceOpenBook).toHaveBeenCalledTimes(2);
    expect(announceOpenBook).toHaveBeenLastCalledWith(
      { fingerprint: 'fp-1', fileName: 'novel.txt', title: 'novel' },
      { fictionDictionary: 'properNouns-f_Novel' }
    );
  });

  it('reopen waits for a position write queued before it (Back flushes as the reader unmounts)', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: null,
      chapterOutline: null,
      manualChapterPattern: null,
      binding: null,
    });
    let records: Record<string, { position: unknown; binding: null }> = {
      'fp-1': { position: { line: 1, fraction: 0 }, binding: null },
    };
    bookRecordsBackend.loadBookRecords.mockImplementation(async () => ({
      records,
      droppedCount: 0,
    }));

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));
    await screen.findByText('reading:novel.txt');
    fireEvent.click(screen.getByText('back'));

    // The final position write, still in flight when the reader clicks the book again.
    let landWrite: () => void = () => {};
    void bookRecordsBackend.withBookRecordsLock(
      () =>
        new Promise<void>((resolve) => {
          landWrite = () => {
            records = { 'fp-1': { position: { line: 900, fraction: 0.25 }, binding: null } };
            resolve();
          };
        })
    );
    fireEvent.click(await screen.findByText('open:novel.txt'));
    landWrite();

    await waitFor(() =>
      expect(screen.getByText('position:{"line":900,"fraction":0.25}')).toBeInTheDocument()
    );
  });

  it('a failed record write still opens the book, knowing nothing about it', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    bookRecordsBackend.recordBookOpened.mockRejectedValue(new Error('disk full'));

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));

    await screen.findByText('reading:novel.txt');
    expect(screen.getByText('position:null')).toBeInTheDocument();
    // "Never answered", so the new book takes authority over the previous one's binding.
    expect(announceOpenBook).toHaveBeenCalledWith(
      { fingerprint: 'fp-1', fileName: 'novel.txt', title: 'novel' },
      null
    );
  });

  it('a double click on a not-yet-open book only opens it once', async () => {
    let resolveOpen: (r: {
      status: string;
      encoding: EncodingReport;
      book: OpenBook;
    }) => void = () => {};
    tauriAPI.openBook.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve;
      })
    );
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: null,
      chapterOutline: null,
      manualChapterPattern: null,
      binding: null,
    });

    render(<ReaderTab isActive={true} />);
    const button = await screen.findByText('open:novel.txt');
    fireEvent.click(button);
    fireEvent.click(button);

    resolveOpen({ status: 'opened', encoding, book: openedBook });
    await screen.findByText('reading:novel.txt');

    expect(tauriAPI.openBook).toHaveBeenCalledTimes(1);
  });

  it('needsEncoding shows the encoding prompt instead of the reader', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'needsEncoding', encoding });

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));

    await screen.findByText('needs-encoding');
    expect(bookRecordsBackend.recordBookOpened).not.toHaveBeenCalled();
    expect(announceOpenBook).not.toHaveBeenCalled();
  });

  it('a thrown open error surfaces on the shelf rather than switching to reading', async () => {
    tauriAPI.openBook.mockRejectedValue(new Error('disk exploded'));

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));

    await waitFor(() => expect(screen.queryByText('reading:novel.txt')).not.toBeInTheDocument());
    expect(announceOpenBook).not.toHaveBeenCalled();
  });
});
