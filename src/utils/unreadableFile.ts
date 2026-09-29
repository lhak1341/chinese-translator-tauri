/**
 * The two ways one of the app's JSON files (`books.json`, `config.json`,
 * `transform-rules.json`, `appearance.json`) can fail to load, and what each loader does
 * about them (architecture review 2026-09-29, candidate #4 grilling; CONTEXT.md
 * "Unreadable app files").
 *
 * - **Unreadable content** (invalid JSON, over the size limit): Rust renames the file to
 *   `<name>.corrupt-<ms>.json` beside it and loads the defaults, reporting the new name in
 *   the response's `quarantined`. The data is kept for recovery and nothing can be saved
 *   over it, since it is no longer at that path. `reportQuarantine` tells the user once.
 * - **A failed read** (a permission or I/O error): the response is `success: false`. The
 *   loader caches nothing, and the file's save refuses until a later load succeeds —
 *   otherwise the next read-modify-write would replace the file with defaults.
 */
import toast from './toast';
import { logger } from './logger';

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
