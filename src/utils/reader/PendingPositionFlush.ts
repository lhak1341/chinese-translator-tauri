/**
 * A one-slot registry for "the currently-open book's pending position write, if any."
 *
 * Only one book can be open at a time (the Reader is a single-book cache, see
 * `book_commands.rs`), so a single slot is enough. `App.jsx`'s window-close-requested
 * handler reads this to flush the debounced write before the app actually exits — the
 * handler has no other way to reach into whatever `useReadingAnchor` instance happens
 * to be mounted right now.
 */
let pendingFlush: (() => Promise<void>) | null = null;

export function registerPendingPositionFlush(flush: (() => Promise<void>) | null): void {
  pendingFlush = flush;
}

export function flushPendingPosition(): Promise<void> {
  return pendingFlush ? pendingFlush() : Promise.resolve();
}
