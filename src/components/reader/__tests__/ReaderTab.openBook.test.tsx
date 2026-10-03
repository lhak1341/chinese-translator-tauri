import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReaderTab from '../ReaderTab';
import type {
  EncodingChoiceTrigger,
  EncodingReport,
  LibraryBook,
  OpenBook,
} from '../../../types/ReaderTypes';

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
global.window.electronAPI = tauriAPI as unknown as typeof window.electronAPI;

const appConfig = vi.hoisted(() => ({
  loadAppConfig: vi.fn(),
  saveAppConfig: vi.fn(),
}));
vi.mock('../../../utils/appConfig', () => appConfig);

const bookRecordsBackend = vi.hoisted(() => {
  // A real serial queue, not a pass-through: the reopen path's ordering against a write
  // already queued is part of what this suite pins down. `queueWrite` stands in for any
  // backend write; `readSettledRecords` waits behind it, as the real one does.
  let queue: Promise<unknown> = Promise.resolve();
  const queueWrite = <T,>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  const loadBookRecords = vi.fn();
  return {
    loadBookRecords,
    recordBookOpened: vi.fn(),
    queueWrite,
    readSettledRecords: vi.fn(() => queueWrite(async () => (await loadBookRecords()).records)),
  };
});
vi.mock('../../../utils/reader/BookRecordsBackend', () => bookRecordsBackend);

const reconcile = vi.hoisted(() => ({
  reconcileLibraryScan: vi.fn(),
}));
// The real `scanShelf`, over the faked scan and reconcile.
vi.mock('../../../utils/reader/ReconcileLibrary', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/reader/ReconcileLibrary')>(
    '../../../utils/reader/ReconcileLibrary'
  );
  return {
    ...actual,
    scanShelf: (path: string | null) =>
      actual.scanShelf(path, {
        scanLibrary: (p) => tauriAPI.scanLibrary(p),
        reconcile: (books, p) => reconcile.reconcileLibraryScan(books, p),
      }),
  };
});

const { announceOpenBook, announceClosedBook } = vi.hoisted(() => ({
  announceOpenBook: vi.fn(),
  announceClosedBook: vi.fn(),
}));
vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => ({ announceOpenBook, announceClosedBook }),
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
  default: ({
    outcome,
    notice,
    continueBook,
    onOpen,
  }: {
    outcome: { kind: string; books?: LibraryBook[] } | null;
    notice: string | null;
    continueBook: LibraryBook | null;
    onOpen: (b: LibraryBook) => void;
  }) => (
    <div>
      <span>notice:{notice ?? 'none'}</span>
      <span>continue:{continueBook?.fileName ?? 'none'}</span>
      {(outcome?.books ?? []).map((b) => (
        <button key={b.fileName} onClick={() => onOpen(b)}>
          open:{b.fileName}
        </button>
      ))}
    </div>
  ),
}));
/** Every `BookReader` mount, in order: the book it mounted for and the engine it got. */
const readerMounts = vi.hoisted(() => [] as { fingerprint: string; engine: unknown }[]);
vi.mock('../BookReader', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({
      book,
      record,
      engine,
      onBack,
      shelf,
    }: {
      book: OpenBook;
      record: { position: unknown };
      engine: unknown;
      onBack: () => void;
      shelf: { switchBook: (fileName: string) => void; reopenWithEncoding: () => void };
    }) => {
      // Mount-only on purpose: a re-render with a new book must not look like a mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => void readerMounts.push({ fingerprint: book.fingerprint, engine }), []);
      return (
        <div>
          <span>reading:{book.fileName}</span>
          <span>position:{JSON.stringify(record.position)}</span>
          <button onClick={onBack}>back</button>
          <button onClick={() => shelf.switchBook('other.txt')}>switch:other.txt</button>
          <button onClick={shelf.reopenWithEncoding}>reopen-encoding</button>
        </div>
      );
    },
  };
});
vi.mock('../EncodingPrompt', () => ({
  default: ({
    trigger,
    report,
    onChoose,
    onBack,
  }: {
    trigger: EncodingChoiceTrigger;
    report: EncodingReport;
    onChoose: (label: string) => void;
    onBack: () => void;
  }) => (
    <div>
      <span>{trigger === 'chosen' ? 'choose-encoding' : 'needs-encoding'}</span>
      <span>current:{report.label}</span>
      <button onClick={() => onChoose('Big5')}>choose:Big5</button>
      <button onClick={onBack}>prompt-back</button>
    </div>
  ),
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
  readerMounts.length = 0;
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
    // Back gives up the book's authority over the fiction dictionaries; the reopen below
    // takes it back.
    expect(announceClosedBook).toHaveBeenCalledTimes(1);

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
    void bookRecordsBackend.queueWrite(
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
    // No book is on screen while the encoding is chosen, so the previous one lets go.
    expect(announceClosedBook).toHaveBeenCalledTimes(1);
  });

  it('a palette switch mounts a new reader for the new book, sharing one engine queue', async () => {
    const otherLibraryBook: LibraryBook = { ...libraryBook, fileName: 'other.txt', title: 'other' };
    const otherBook: OpenBook = { ...openedBook, fingerprint: 'fp-2', fileName: 'other.txt' };
    tauriAPI.scanLibrary.mockResolvedValue({
      libraryPath: '/lib',
      books: [libraryBook, otherLibraryBook],
    });
    reconcile.reconcileLibraryScan.mockResolvedValue({
      shelfBooks: [
        { ...libraryBook, fingerprint: 'fp-1' },
        { ...otherLibraryBook, fingerprint: 'fp-2' },
      ],
      unavailableBooks: [],
    });
    tauriAPI.openBook.mockImplementation(async (fileName: string) => ({
      status: 'opened',
      encoding,
      book: fileName === 'other.txt' ? otherBook : openedBook,
    }));
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: null,
      chapterOutline: null,
      manualChapterPattern: null,
      binding: null,
    });

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));
    fireEvent.click(await screen.findByText('switch:other.txt'));
    await screen.findByText('reading:other.txt');

    // Two mounts, not one mount re-rendered: the second book starts with nothing the
    // first left behind.
    expect(readerMounts.map((mount) => mount.fingerprint)).toEqual(['fp-1', 'fp-2']);
    // The queue outlives the reader, so a call still in flight from the first book is
    // ahead of the second book's calls on the same queue.
    expect(readerMounts[1].engine).toBe(readerMounts[0].engine);
  });

  it('reopening with another encoding asks, then decodes the same file with the choice', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    const record = {
      position: { line: 70, fraction: 0 },
      chapterOutline: null,
      manualChapterPattern: null,
      binding: { fictionDictionary: 'properNouns-f_Novel' },
    };
    bookRecordsBackend.recordBookOpened.mockResolvedValue(record);

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));
    fireEvent.click(await screen.findByText('reopen-encoding'));

    // The choice replaces the reader, as the low-confidence prompt does, and says what
    // the book is decoded with now.
    expect(await screen.findByText('choose-encoding')).toBeInTheDocument();
    expect(screen.getByText('current:UTF-8')).toBeInTheDocument();
    expect(screen.queryByText('reading:novel.txt')).not.toBeInTheDocument();

    tauriAPI.openBook.mockResolvedValue({
      status: 'opened',
      encoding: { ...encoding, label: 'Big5', overridden: true },
      book: openedBook,
    });
    fireEvent.click(screen.getByText('choose:Big5'));

    await screen.findByText('reading:novel.txt');
    expect(tauriAPI.openBook).toHaveBeenLastCalledWith('novel.txt', null, 'Big5');
    // Same bytes, same fingerprint: the record the reader comes back to is this book's own,
    // position and binding included.
    expect(bookRecordsBackend.recordBookOpened).toHaveBeenLastCalledWith(
      'fp-1',
      expect.objectContaining({ encodingLabel: 'Big5' })
    );
    expect(screen.getByText('position:{"line":70,"fraction":0}')).toBeInTheDocument();
    expect(readerMounts.map((mount) => mount.fingerprint)).toEqual(['fp-1', 'fp-1']);
  });

  it('Back from the encoding choice goes to the shelf, leaving the book as it was', async () => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: null,
      chapterOutline: null,
      manualChapterPattern: null,
      binding: null,
    });

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));
    fireEvent.click(await screen.findByText('reopen-encoding'));
    fireEvent.click(await screen.findByText('prompt-back'));

    expect(await screen.findByText('open:novel.txt')).toBeInTheDocument();
    expect(tauriAPI.openBook).toHaveBeenCalledTimes(1);
  });

  it('a thrown open error surfaces on the shelf rather than switching to reading', async () => {
    tauriAPI.openBook.mockRejectedValue(new Error('disk exploded'));

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));

    await waitFor(() => expect(screen.queryByText('reading:novel.txt')).not.toBeInTheDocument());
    expect(announceOpenBook).not.toHaveBeenCalled();
    // The open error shows on the shelf, and the scan's shelf stays beside it.
    await waitFor(() => expect(screen.getByText('notice:disk exploded')).toBeTruthy());
    expect(screen.getByText('open:novel.txt')).toBeTruthy();
  });
});

describe('ReaderTab remembers the last book across launches', () => {
  beforeEach(() => {
    tauriAPI.openBook.mockResolvedValue({ status: 'opened', encoding, book: openedBook });
    bookRecordsBackend.recordBookOpened.mockResolvedValue({
      position: null,
      chapterOutline: null,
      manualChapterPattern: null,
      binding: null,
    });
    appConfig.saveAppConfig.mockResolvedValue(undefined);
  });

  it('opening a book remembers it; Back keeps it as last but stops resuming', async () => {
    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));
    await screen.findByText('reading:novel.txt');
    expect(appConfig.saveAppConfig).toHaveBeenLastCalledWith({
      reader: { lastBook: 'fp-1', resumeOnLaunch: true },
    });

    fireEvent.click(screen.getByText('back'));
    expect(appConfig.saveAppConfig).toHaveBeenLastCalledWith({
      reader: { resumeOnLaunch: false },
    });
    // The shelf offers it back.
    expect(await screen.findByText('continue:novel.txt')).toBeInTheDocument();
  });

  it('a launch after quitting mid-book reopens it with no click', async () => {
    appConfig.loadAppConfig.mockResolvedValue({
      reader: { libraryPath: null, lastBook: 'fp-1', resumeOnLaunch: true },
    });

    render(<ReaderTab isActive={true} />);

    await screen.findByText('reading:novel.txt');
    expect(tauriAPI.openBook).toHaveBeenCalledTimes(1);
    expect(announceOpenBook).toHaveBeenCalledWith(
      { fingerprint: 'fp-1', fileName: 'novel.txt', title: 'novel' },
      null
    );
  });

  it('a launch after going Back to the shelf stays on the shelf, offering the book', async () => {
    appConfig.loadAppConfig.mockResolvedValue({
      reader: { libraryPath: null, lastBook: 'fp-1', resumeOnLaunch: false },
    });

    render(<ReaderTab isActive={true} />);

    expect(await screen.findByText('continue:novel.txt')).toBeInTheDocument();
    expect(tauriAPI.openBook).not.toHaveBeenCalled();
  });

  it('a last book no longer on the shelf is neither reopened nor offered', async () => {
    appConfig.loadAppConfig.mockResolvedValue({
      reader: { libraryPath: null, lastBook: 'fp-gone', resumeOnLaunch: true },
    });

    render(<ReaderTab isActive={true} />);

    await screen.findByText('open:novel.txt');
    await waitFor(() => expect(appConfig.loadAppConfig).toHaveBeenCalledTimes(2));
    expect(screen.getByText('continue:none')).toBeInTheDocument();
    expect(tauriAPI.openBook).not.toHaveBeenCalled();
  });

  it('a failed remember write does not stop the book opening', async () => {
    appConfig.saveAppConfig.mockRejectedValue(new Error("Couldn't read config.json"));

    render(<ReaderTab isActive={true} />);
    fireEvent.click(await screen.findByText('open:novel.txt'));

    expect(await screen.findByText('reading:novel.txt')).toBeInTheDocument();
  });
});
