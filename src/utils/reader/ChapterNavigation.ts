import type { ChapterHeader, ChapterPatternId } from '../../types/ReaderTypes';

/**
 * The chapter pattern a book's outline is built from: the reader's override when there is
 * one, else election's answer. `null` for neither — no outline, which is not an empty one.
 * The override never overwrites the elected pattern, so clearing it falls back to
 * election without re-running it.
 */
export function patternInEffect(
  manualPattern: ChapterPatternId | null,
  electedPattern: ChapterPatternId | null
): ChapterPatternId | null {
  return manualPattern ?? electedPattern;
}

/**
 * Index of the last header whose line is `<= line`, or `-1` when `line` precedes every
 * header (reading before the first detected chapter). `headers` must be sorted ascending
 * by line — `chapter_outline::elect`'s own output contract, never re-sorted here.
 */
export function currentChapterIndex(headers: ChapterHeader[], line: number): number {
  let lo = 0;
  let hi = headers.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (headers[mid].line <= line) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * The header a `[`/`]` step should jump to, or `null` at either end of the book (before
 * the first chapter for `-1`, or past the last one for `1`).
 *
 * `-1` follows the back-button convention a media player's previous-track button uses:
 * once you're actually inside a chapter — anywhere past its own header line — the first
 * press returns you to *that* chapter's start rather than skipping straight past it to
 * the one before, which is what made it feel error-prone deep into a long chapter. A
 * press already sitting exactly on a chapter's header line is the "already at the start"
 * case and goes one further back, same as pressing it twice.
 */
export function stepChapter(
  headers: ChapterHeader[],
  line: number,
  direction: -1 | 1
): ChapterHeader | null {
  const index = currentChapterIndex(headers, line);
  if (direction === 1) return headers[index + 1] ?? null;
  if (index >= 0 && line > headers[index].line) return headers[index];
  return headers[index - 1] ?? null;
}
