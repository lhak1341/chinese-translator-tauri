/**
 * **Chunk line fold**: translated chunks folded back into the raw file lines they came from.
 *
 * A chunk is one engine call over a span of lines; the Reader's panels render one row per
 * file line. This module owns the one rule that connects them — how a chunk's text divides
 * between its lines, and how the chunks of a line (a long line is split across several, see
 * `splitLongLine`) are put back in book order — so the plain line string
 * ({@link assembleTranslatedLines}), the landed pieces each line is made of
 * ({@link linePieces}) and the clickable runs cut in `LineSegments.ts` are all views of one
 * division. `LineSegments.ts` reads {@link chunkLineRanges} directly rather than re-deriving
 * it, which is what keeps a row's runs equal to its plain text.
 *
 * Pure — no engine, no DOM, no React. Window planning is `TranslationWindow.ts`.
 */

import type { ChunkPlan } from './TranslationWindow';

/** A chunk that has come back from the engine, as the cache and the panel see it. */
export interface TranslatedChunk {
  chunk: ChunkPlan;
  translatedText: string;
}

/** Where one raw file line's share of a chunk's text begins and ends, in that text. */
export interface ChunkLineRange {
  /** Raw file line. */
  line: number;
  /** Half-open `[start, end)` into the chunk's own text. */
  start: number;
  end: number;
}

/**
 * One landed chunk's share of one line: the source it covers and the length of what it
 * became. `to: null` runs to the end of the line.
 */
export interface LinePiece {
  from: number;
  to: number | null;
  length: number;
}

/**
 * Cut a chunk's text into one range per raw file line it covers.
 *
 * The engine preserves the newlines it is given, so a chunk's output splits back into the
 * lines it came from. Two ways it can fail to, both handled here rather than at each call
 * site, because the panel's clickable segments and the plain assembled line must agree
 * character for character or a row's text changes as highlighting turns on:
 *
 * - **More parts than lines** — the engine added a newline. The surplus is folded into the
 *   chunk's last line, whose range runs to the end of the text, rather than shifting every
 *   line after it: a one-line shift would mis-attribute every remaining line of the chunk.
 *   The newlines inside that range are rendered as spaces (see {@link rangeText}), which is
 *   what keeps one file line on one row.
 * - **Fewer parts than lines** — the engine collapsed one. The lines left over get an empty
 *   range at the end of the text.
 */
export function chunkLineRanges(chunk: ChunkPlan, text: string): ChunkLineRange[] {
  const span = chunk.endLine - chunk.startLine + 1;
  const starts: number[] = [0];
  const ends: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') continue;
    ends.push(i);
    starts.push(i + 1);
  }
  ends.push(text.length);

  const ranges: ChunkLineRange[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const line = chunk.startLine + offset;
    if (offset >= starts.length) {
      ranges.push({ line, start: text.length, end: text.length });
      continue;
    }
    const isFoldedTail = offset === span - 1;
    ranges.push({
      line,
      start: starts[offset],
      end: isFoldedTail ? text.length : ends[offset],
    });
  }
  return ranges;
}

/**
 * One range's text, with any newline inside it rendered as a space.
 *
 * Only the folded tail of an over-split chunk can contain one (see
 * {@link chunkLineRanges}), and a raw newline there would break one file line across two
 * rendered rows in a panel whose rows are the file's own lines.
 */
export function rangeText(text: string, range: ChunkLineRange): string {
  return text.slice(range.start, range.end).replace(/\n/g, ' ');
}

const linePieceCache = new WeakMap<ChunkPlan, Map<string, Map<number, string>>>();

/**
 * One chunk's text, divided into the file lines it covers — memoized on the chunk.
 *
 * A fold re-runs from scratch every time any chunk lands, over every chunk still resident,
 * so this exact division is recomputed for up to a couple of hundred unchanged chunks per
 * arriving one. A chunk's division depends on nothing but its own plan and its own text,
 * both of which are fixed for the life of the cache entry, so it never needs recomputing
 * at all.
 *
 * Keyed by plan *and* text because one plan is folded twice — once for the full
 * translation and once for the character-only gloss — with different text each time.
 */
export function chunkLinePieces(chunk: ChunkPlan, text: string): Map<number, string> {
  let byText = linePieceCache.get(chunk);
  if (byText === undefined) {
    byText = new Map();
    linePieceCache.set(chunk, byText);
  }
  const hit = byText.get(text);
  if (hit !== undefined) return hit;

  const pieces = new Map<number, string>();
  for (const range of chunkLineRanges(chunk, text)) {
    const piece = rangeText(text, range);
    const existing = pieces.get(range.line);
    pieces.set(range.line, existing === undefined ? piece : existing + piece);
  }
  byText.set(text, pieces);
  return pieces;
}

/**
 * Fold translated chunks back into one Vietnamese string per raw file line.
 *
 * How a chunk's text divides between its lines is {@link chunkLineRanges}' business, and
 * deliberately shared with the clickable segments the same chunk produces: a line's
 * segments must concatenate to exactly the string this returns, or a row's text would
 * change the moment highlighting had something to render.
 *
 * A line split across chunks (see `splitLongLine`) is rebuilt by concatenation, which is
 * why entries are applied in line order regardless of the order they arrived in.
 */
export function assembleTranslatedLines(entries: Iterable<TranslatedChunk>): Map<number, string> {
  const lines = new Map<number, string>();
  for (const { chunk, translatedText } of orderChunksByLine(entries)) {
    for (const [line, piece] of chunkLinePieces(chunk, translatedText)) {
      const existing = lines.get(line);
      lines.set(line, existing === undefined ? piece : existing + piece);
    }
  }
  return lines;
}

/**
 * Which source characters of each line a chunk covers, and how long its piece of each line
 * came back — the same division {@link assembleTranslatedLines} concatenates.
 */
export function linePieces(entries: readonly TranslatedChunk[]): Map<number, LinePiece[]> {
  const byLine = new Map<number, LinePiece[]>();
  for (const { chunk, translatedText } of orderChunksByLine(entries)) {
    for (const [line, piece] of chunkLinePieces(chunk, translatedText)) {
      const pieces = byLine.get(line) ?? [];
      pieces.push({
        from: line === chunk.startLine ? chunk.startChar : 0,
        to: line === chunk.endLine ? chunk.endChar : null,
        length: piece.length,
      });
      byLine.set(line, pieces);
    }
  }
  return byLine;
}

/**
 * Chunks in the order their text appears in the book, whatever order they arrived in.
 *
 * Nearest-the-anchor-first filling means a line split across chunks can be handed back
 * tail first, and concatenating in arrival order would reverse it.
 */
export function orderChunksByLine<T extends { chunk: ChunkPlan }>(entries: Iterable<T>): T[] {
  return [...entries].sort(
    (a, b) => a.chunk.startLine - b.chunk.startLine || a.chunk.startChar - b.chunk.startChar
  );
}
