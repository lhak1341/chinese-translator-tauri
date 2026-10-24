/**
 * `scanShelf`'s three outcomes, with the scan and the reconcile faked. Moved here from the
 * tab-level `ReaderTab.library.test.tsx` (architecture review 2026-09-29, candidate #5
 * grilling), which could only reach them by rendering the whole Reader tab.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { scanShelf, type ScanShelfDeps, type UnavailableBook } from '../ReconcileLibrary';
import type { LibraryBook } from '../../../types/ReaderTypes';

vi.mock('../../logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function file(title: string): LibraryBook {
  return { fileName: `${title}.txt`, title, sizeBytes: 1, modifiedMs: 1 };
}

const missingBook: UnavailableBook = {
  fingerprint: 'fp-gone',
  title: 'gone',
  lastKnownPath: 'gone.txt',
};

let deps: ScanShelfDeps & {
  scanLibrary: ReturnType<typeof vi.fn>;
  reconcile: ReturnType<typeof vi.fn>;
  pruneBookIndex: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  deps = {
    scanLibrary: vi.fn(async (path: string | null) => ({
      libraryPath: path ?? '/default',
      books: [file('b'), file('a')],
    })),
    reconcile: vi.fn(async (books: LibraryBook[]) => ({
      shelfBooks: books.map((b) => ({ ...b, fingerprint: `fp-${b.title}` })),
      unavailableBooks: [missingBook],
    })),
    pruneBookIndex: vi.fn(async () => 0),
  };
});

describe('scanShelf', () => {
  test('a reconciled scan is loaded: every book with its identity, and the missing list', async () => {
    expect(await scanShelf('/saved', deps)).toEqual({
      kind: 'loaded',
      libraryPath: '/saved',
      books: [
        { ...file('b'), fingerprint: 'fp-b' },
        { ...file('a'), fingerprint: 'fp-a' },
      ],
      unavailableBooks: [missingBook],
    });
    expect(deps.reconcile).toHaveBeenCalledWith([file('b'), file('a')], '/saved');
  });

  test('a scan that cannot be reconciled shows its books, identities unknown, in shelf order', async () => {
    deps.reconcile.mockRejectedValue(new Error("Couldn't read books.json"));

    const outcome = await scanShelf(null, deps);

    // No record was read, so no book can be called missing, and none has a fingerprint.
    expect(outcome).toEqual({
      kind: 'recordsUnknown',
      libraryPath: '/default',
      books: [file('a'), file('b')],
    });
  });

  test('a failed scan says why, and reconciles nothing', async () => {
    deps.scanLibrary.mockRejectedValue(new Error('folder gone'));

    expect(await scanShelf('/saved', deps)).toEqual({ kind: 'scanFailed', error: 'folder gone' });
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  test('every scan reconciles, so a rescan after a failed one is loaded again', async () => {
    deps.reconcile.mockRejectedValueOnce(new Error("Couldn't read books.json"));
    expect((await scanShelf('/saved', deps)).kind).toBe('recordsUnknown');
    expect((await scanShelf('/saved', deps)).kind).toBe('loaded');
  });

  test('a reconciled scan prunes the book index; an unreconciled or failed one does not', async () => {
    await scanShelf('/saved', deps);
    expect(deps.pruneBookIndex).toHaveBeenCalledTimes(1);

    deps.pruneBookIndex.mockClear();
    deps.reconcile.mockRejectedValueOnce(new Error("Couldn't read books.json"));
    await scanShelf('/saved', deps);
    deps.scanLibrary.mockRejectedValueOnce(new Error('folder gone'));
    await scanShelf('/saved', deps);
    expect(deps.pruneBookIndex).not.toHaveBeenCalled();
  });

  test('a failed prune does not change the outcome', async () => {
    deps.pruneBookIndex.mockRejectedValue(new Error('disk'));
    expect((await scanShelf('/saved', deps)).kind).toBe('loaded');
  });
});
