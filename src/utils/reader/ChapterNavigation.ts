import type { ChapterHeader } from '../../types/ReaderTypes';

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

/** The header a `[`/`]` step should jump to, or `null` at either end of the book (before
 * the first chapter for `-1`, or past the last one for `1`). */
export function stepChapter(
  headers: ChapterHeader[],
  line: number,
  direction: -1 | 1
): ChapterHeader | null {
  const target = currentChapterIndex(headers, line) + direction;
  return headers[target] ?? null;
}
