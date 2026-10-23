/**
 * An **App File** (GLOSSARY.md "App file"): one of the JSON files the app keeps beside the
 * dictionaries — `config.json`, `appearance.json`, `transform-rules.json`, `books.json` — read
 * once, cached, and written only by read-modify-write under one lock per file. Each file's own
 * module supplies the IPC calls and a parser; this module owns everything the four have in
 * common, which until 2026-09-29 each hand-copied and let drift (architecture review
 * candidate #2 grilling).
 *
 * The two ways a file can fail to load, and what happens (the "Unreadable app files" rules):
 *
 * - **Unreadable content** (invalid JSON, over the size limit): Rust renames the file to
 *   `<name>.corrupt-<ms>.json` beside it and loads the defaults, reporting the new name in
 *   the response's `quarantined`. The data is kept for recovery and nothing can be saved
 *   over it, since it is no longer at that path. The user is told once.
 * - **A failed read** (a permission or I/O error): the response is `success: false`. Nothing
 *   is cached, and every `transform` refuses until a later load succeeds — otherwise the next
 *   read-modify-write would replace the file with defaults. With `onUnreadable: 'defaults'`
 *   the read hands back defaults so the app can start; with `'throw'` it throws.
 */
import toast from './toast';
import { logger } from './logger';
import { validateApiResult } from './configValidation';

/** Tell the user a file was set aside, if the load result says so. */
export function reportQuarantine(result: unknown, what: string): void {
  const quarantined =
    result && typeof result === 'object'
      ? (result as { quarantined?: unknown }).quarantined
      : undefined;
  if (typeof quarantined !== 'string') return;
  logger.error(`${what} could not be read and was moved to ${quarantined}`);
  toast.warning(
    `${what} could not be read, so it was set aside as ${quarantined} and started fresh.`
  );
}

/** The error a save throws while its file has not loaded. */
export function unreadFileError(fileName: string): Error {
  return new Error(`Couldn't read ${fileName}; not saving over it`);
}

export interface AppFileSpec<T> {
  /** The file's name on disk, as the user would recognize it: `'config.json'`. */
  fileName: string;
  /** How the quarantine toast names the file: `'Settings (config.json)'`. */
  what: string;
  /** The raw IPC load, e.g. `window.electronAPI.loadConfiguration()`. Called lazily. */
  load: () => Promise<unknown>;
  /** The raw IPC save of a whole value. */
  save: (value: T) => Promise<unknown>;
  /** The loaded `data` (possibly `undefined`) as a value, plus how many invalid items were
   * dropped on the way. Never throws: a bad field falls back, a bad item is dropped. */
  parse: (data: unknown) => { value: T; dropped: number };
  /** What a failed read does: hand back `defaults()` so the app still runs (settings), or
   * throw (files whose callers handle the error). Saves refuse either way. */
  onUnreadable: 'defaults' | 'throw';
  /** Required with `onUnreadable: 'defaults'`. */
  defaults?: () => T;
  /** The save error when the IPC reports failure without a message. */
  saveError: string;
}

export interface AppFileRead<T> {
  value: T;
  /** Invalid items dropped by this load — 0 when served from the cache. */
  dropped: number;
}

export interface AppFile<T> {
  /** The cached value, loading it first if needed. */
  read: () => Promise<AppFileRead<T>>;
  /** `read`, but after every write queued ahead of it has settled. */
  readSettled: () => Promise<AppFileRead<T>>;
  /**
   * The one write. Once every write queued ahead of it has settled, `fn` gets the freshest
   * value and returns the next one plus a result for the caller; returning the value it was
   * given means "no change", and nothing is saved. Refuses while the file is unread.
   */
  transform: <R>(fn: (current: T) => { value: T; result: R }) => Promise<R>;
  /**
   * For a write that happens outside this module — a Rust command writing the file itself.
   * Runs `fn` on the same lock, and drops the cache when it succeeds so the next read sees
   * what it wrote.
   */
  writeExternally: <R extends { success: boolean }>(fn: () => Promise<R>) => Promise<R>;
  /** Forget the cache and any failed read; the next read goes to disk. Notifies. */
  invalidate: () => void;
  /** Called on every change to the cache: a load, a save, an invalidate. */
  subscribe: (listener: () => void) => () => void;
  /** The cached value, or `null` before the first load. Replaced, never mutated. */
  snapshot: () => T | null;
}

export function createAppFile<T>(spec: AppFileSpec<T>): AppFile<T> {
  if (spec.onUnreadable === 'defaults' && !spec.defaults) {
    throw new Error(`${spec.fileName}: onUnreadable 'defaults' needs defaults()`);
  }

  let cache: T | null = null;
  /** True from a failed read until a load succeeds. */
  let unread = false;
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();

  /** Bumped by every write-through and invalidation — not by a load caching its own result —
   * so a load that started before one can tell its result is stale. */
  let epoch = 0;

  function setCache(next: T | null, isLoad = false): void {
    if (!isLoad) epoch++;
    cache = next;
    listeners.forEach((listener) => listener());
  }

  function withLock<R>(fn: () => Promise<R>): Promise<R> {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function read(): Promise<AppFileRead<T>> {
    if (cache !== null) return { value: cache, dropped: 0 };
    const startedAt = epoch;
    const raw = await spec.load();
    // A save, external write or invalidate landed while this load was in flight: what it
    // read may predate it, and caching it would resurrect the old file. Read again.
    if (epoch !== startedAt) return read();
    const result = validateApiResult<unknown>(raw, `load ${spec.fileName}`);
    if (!result.success) {
      // Cached nowhere: the next read tries the file again.
      unread = true;
      if (spec.onUnreadable === 'throw') throw unreadFileError(spec.fileName);
      logger.error(`Could not read ${spec.fileName}; running on defaults:`, result.error);
      return { value: (spec.defaults as () => T)(), dropped: 0 };
    }
    unread = false;
    reportQuarantine(raw, spec.what);
    const { value, dropped } = spec.parse(result.data);
    if (dropped > 0) logger.warn(`${spec.fileName}: dropped ${dropped} invalid item(s)`);
    setCache(value, true);
    return { value, dropped };
  }

  async function save(value: T): Promise<void> {
    const result = (await spec.save(value)) as { success?: boolean; error?: string } | null;
    if (!result?.success) throw new Error(result?.error || spec.saveError);
    setCache(value);
  }

  return {
    read,
    readSettled: () => withLock(read),
    transform: (fn) =>
      withLock(async () => {
        const { value: current } = await read();
        if (unread) throw unreadFileError(spec.fileName);
        const { value: next, result } = fn(current);
        if (next !== current) await save(next);
        return result;
      }),
    writeExternally: (fn) =>
      withLock(async () => {
        const result = await fn();
        if (result.success) {
          unread = false;
          setCache(null);
        }
        return result;
      }),
    invalidate: () => {
      unread = false;
      setCache(null);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => cache,
  };
}
