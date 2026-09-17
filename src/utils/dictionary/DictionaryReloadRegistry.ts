/**
 * A one-slot registry for "the app's dictionary reload", the way
 * `PendingPositionFlush` is one for the open book's pending write.
 *
 * Reload is one action with one owner: `Translator.jsx` builds it (`useForceReload`) out
 * of state only it has — the in-flight translation to cancel, the scroll positions to
 * restore, the input to re-translate. The Reader needs to *trigger* that same action, not
 * a second implementation of it: a Reader-specific variant would mean two engine-teardown
 * paths that have to be kept in step, and the whole point of the shortcut extension is
 * that Cmd/Ctrl+R means the same thing on both tabs.
 *
 * A registry rather than a context because nothing re-renders on this: the Reader calls
 * it imperatively from a keydown, and the Translator is always mounted (every tab is), so
 * the slot is filled for the whole session after first paint.
 */
let reload: (() => Promise<void>) | null = null;

export function registerDictionaryReload(fn: (() => Promise<void>) | null): void {
  reload = fn;
}

/**
 * Runs the registered reload, or resolves immediately if nothing has registered one.
 *
 * The empty slot is not an error case worth reporting: it only happens before the
 * Translator's first render, which is before the Reader can have a book open to press
 * the key in.
 */
export function requestDictionaryReload(): Promise<void> {
  return reload ? reload() : Promise.resolve();
}
