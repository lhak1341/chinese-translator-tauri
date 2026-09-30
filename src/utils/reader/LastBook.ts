/**
 * The book the reader was last in, found on the shelf again.
 *
 * `config.json`'s `reader.lastBook` names it by fingerprint, not file name, so a book
 * renamed or moved inside the library between sessions is still found. Only a `loaded`
 * shelf knows fingerprints: after a `recordsUnknown` scan nothing can be matched, and the
 * reader lands on the shelf instead of in a guessed book.
 */

import type { ShelfBook, ShelfOutcome } from './ReconcileLibrary';

export function findLastBook(
  outcome: ShelfOutcome | null,
  lastBook: string | null
): ShelfBook | null {
  if (!lastBook || outcome?.kind !== 'loaded') return null;
  return outcome.books.find((book) => book.fingerprint === lastBook) ?? null;
}
