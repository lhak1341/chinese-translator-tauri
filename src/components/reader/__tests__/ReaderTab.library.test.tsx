import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReaderTab from '../ReaderTab';
import type { LibraryBook } from '../../../types/ReaderTypes';
import type { ShelfBook, UnavailableBook } from '../../../utils/reader/ReconcileLibrary';

/**
 * `ReaderTab`'s library half — scanning, reconciling, and the library folder setting —
 * which had no coverage until the architecture review of 2026-09-29 (candidate #4
 * grilling). `ReaderTab.openBook.test.tsx` covers opening a book; this file drives the
 * shelf through a stub that prints exactly what `ReaderTab` handed it.
 */

const tauriAPI = vi.hoisted(() => ({ scanLibrary: vi.fn(), openBook: vi.fn() }));
vi.mock('../../../tauriAPI', () => ({ default: tauriAPI }));

const appConfig = vi.hoisted(() => ({ loadAppConfig: vi.fn(), saveAppConfig: vi.fn() }));
vi.mock('../../../utils/appConfig', () => appConfig);

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);

vi.mock('../../../utils/reader/BookRecordsBackend', () => ({
  readSettledRecords: vi.fn(),
  recordBookOpened: vi.fn(),
}));

// Only the reconciliation call is faked; the shelf order rule is the real one.
const reconcileLibraryScan = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/reader/ReconcileLibrary', async () => ({
  ...(await vi.importActual<typeof import('../../../utils/reader/ReconcileLibrary')>(
    '../../../utils/reader/ReconcileLibrary'
  )),
  reconcileLibraryScan,
}));

vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => ({ announceOpenBook: vi.fn(), announceClosedBook: vi.fn() }),
}));
vi.mock('../../../hooks/useReaderEngine', () => ({ useReaderEngine: () => ({}) }));
vi.mock('../BookReader', () => ({ default: () => null }));
vi.mock('../EncodingPrompt', () => ({ default: () => null }));

vi.mock('../Bookshelf', () => ({
  default: (props: {
    books: ShelfBook[];
    unavailableBooks: UnavailableBook[];
    libraryPath: string;
    isUsingDefaultPath: boolean;
    isLoading: boolean;
    error: string | null;
    recordsUnavailable: boolean;
    onChooseFolder: () => void;
    onUseDefaultFolder: () => void;
    onRescan: () => void;
  }) => (
    <div>
      <span>loading:{String(props.isLoading)}</span>
      <span>path:{props.libraryPath}</span>
      <span>default:{String(props.isUsingDefaultPath)}</span>
      <span>error:{props.error ?? 'none'}</span>
      <span>records-unavailable:{String(props.recordsUnavailable)}</span>
      <span>books:{props.books.map((b) => `${b.title}=${b.fingerprint ?? '?'}`).join(',')}</span>
      <span>missing:{props.unavailableBooks.length}</span>
      <button onClick={props.onChooseFolder}>choose-folder</button>
      <button onClick={props.onUseDefaultFolder}>use-default</button>
      <button onClick={props.onRescan}>rescan</button>
    </div>
  ),
}));

function file(title: string): LibraryBook {
  return { fileName: `${title}.txt`, title, sizeBytes: 1, modifiedMs: 1 };
}

const missingBook: UnavailableBook = {
  fingerprint: 'fp-gone',
  title: 'gone',
  lastKnownPath: 'gone.txt',
} as UnavailableBook;

async function shelfSettled(): Promise<void> {
  await waitFor(() => expect(screen.getByText('loading:false')).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  appConfig.loadAppConfig.mockResolvedValue({ reader: { libraryPath: '/saved' } });
  appConfig.saveAppConfig.mockResolvedValue(undefined);
  tauriAPI.scanLibrary.mockImplementation(async (path: string | null) => ({
    libraryPath: path ?? '/default',
    books: [file('b'), file('a')],
  }));
  reconcileLibraryScan.mockImplementation(async (books: LibraryBook[]) => ({
    shelfBooks: books.map((b) => ({ ...b, fingerprint: `fp-${b.title}` })),
    unavailableBooks: [missingBook],
  }));
});

describe('ReaderTab library — scanning', () => {
  it('scans the configured folder on mount and shows the reconciled shelf', async () => {
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    expect(tauriAPI.scanLibrary).toHaveBeenCalledWith('/saved');
    expect(screen.getByText('path:/saved')).toBeTruthy();
    expect(screen.getByText('books:b=fp-b,a=fp-a')).toBeTruthy();
    expect(screen.getByText('missing:1')).toBeTruthy();
    expect(screen.getByText('records-unavailable:false')).toBeTruthy();
  });

  it('a config that fails to load scans the default folder', async () => {
    appConfig.loadAppConfig.mockRejectedValue(new Error('unreadable'));
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    expect(tauriAPI.scanLibrary).toHaveBeenCalledWith(null);
    expect(screen.getByText('default:true')).toBeTruthy();
  });

  it('a failed scan empties the shelf and says why', async () => {
    tauriAPI.scanLibrary.mockRejectedValue(new Error('folder gone'));
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    expect(screen.getByText('error:folder gone')).toBeTruthy();
    expect(screen.getByText('books:')).toBeTruthy();
    expect(screen.getByText('missing:0')).toBeTruthy();
  });

  it('a failed reconcile shows the scan with identities unknown, sorted, and no missing list', async () => {
    render(<ReaderTab isActive={true} />);
    await shelfSettled();
    expect(screen.getByText('missing:1')).toBeTruthy();

    reconcileLibraryScan.mockRejectedValue(new Error("Couldn't read books.json"));
    fireEvent.click(screen.getByText('rescan'));

    await waitFor(() => expect(screen.getByText('records-unavailable:true')).toBeTruthy());
    expect(screen.getByText('books:a=?,b=?')).toBeTruthy();
    // The previous scan's missing list must not survive a scan that read no records.
    expect(screen.getByText('missing:0')).toBeTruthy();
    expect(screen.getByText('error:none')).toBeTruthy();
  });

  it('a rescan that reconciles clears the notice', async () => {
    reconcileLibraryScan.mockRejectedValueOnce(new Error("Couldn't read books.json"));
    render(<ReaderTab isActive={true} />);
    await waitFor(() => expect(screen.getByText('records-unavailable:true')).toBeTruthy());

    fireEvent.click(screen.getByText('rescan'));

    await waitFor(() => expect(screen.getByText('records-unavailable:false')).toBeTruthy());
    expect(screen.getByText('books:b=fp-b,a=fp-a')).toBeTruthy();
  });
});

describe('ReaderTab library — the folder setting', () => {
  it('choosing a folder saves it, then scans it', async () => {
    dialog.open.mockResolvedValue('/chosen');
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    fireEvent.click(screen.getByText('choose-folder'));

    await waitFor(() => expect(tauriAPI.scanLibrary).toHaveBeenLastCalledWith('/chosen'));
    expect(appConfig.saveAppConfig).toHaveBeenCalledWith({ reader: { libraryPath: '/chosen' } });
    expect(appConfig.saveAppConfig.mock.invocationCallOrder[0]).toBeLessThan(
      tauriAPI.scanLibrary.mock.invocationCallOrder[1]
    );
    await waitFor(() => expect(screen.getByText('default:false')).toBeTruthy());
  });

  it('cancelling the dialog changes nothing', async () => {
    dialog.open.mockResolvedValue(null);
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    fireEvent.click(screen.getByText('choose-folder'));
    await waitFor(() => expect(dialog.open).toHaveBeenCalled());

    expect(appConfig.saveAppConfig).not.toHaveBeenCalled();
    expect(tauriAPI.scanLibrary).toHaveBeenCalledTimes(1);
  });

  it('a folder that cannot be saved is not scanned, and the shelf says why', async () => {
    dialog.open.mockResolvedValue('/chosen');
    appConfig.saveAppConfig.mockRejectedValue(
      new Error("Couldn't read config.json; not saving over it")
    );
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    fireEvent.click(screen.getByText('choose-folder'));

    await waitFor(() =>
      expect(screen.getByText("error:Couldn't read config.json; not saving over it")).toBeTruthy()
    );
    expect(tauriAPI.scanLibrary).toHaveBeenCalledTimes(1);
  });

  it('using the default folder saves null and scans the default, even if the save fails', async () => {
    appConfig.saveAppConfig.mockRejectedValue(new Error('disk full'));
    render(<ReaderTab isActive={true} />);
    await shelfSettled();

    fireEvent.click(screen.getByText('use-default'));

    await waitFor(() => expect(tauriAPI.scanLibrary).toHaveBeenLastCalledWith(null));
    expect(appConfig.saveAppConfig).toHaveBeenCalledWith({ reader: { libraryPath: null } });
    await waitFor(() => expect(screen.getByText('default:true')).toBeTruthy());
  });
});
