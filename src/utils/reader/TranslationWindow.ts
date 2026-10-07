/**
 * The arithmetic behind windowed translation: bands, paragraph snapping and chunk planning.
 * Folding a translated chunk back into per-line strings is `ChunkLineFold.ts`.
 *
 * Pure by design — anchor plus geometry plus book metadata in, ranges plus chunk plan
 * out. No DOM, no engine, no React. The Window Filler (`WindowFiller.ts`) owns the
 * scheduling, the engine calls and the cache; everything it decides is computed here.
 */

/** A half-open range of raw file lines: `[start, end)`. */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * The three ranges, all in raw file lines.
 *
 * - `render` — viewport plus overscan; what is in the DOM.
 * - `fetch` — anchor ± {@link FETCH_VIEWPORTS} viewports; what gets translated now.
 * - `keep` — anchor ± {@link KEEP_VIEWPORTS} viewports; nothing is dropped inside it.
 *
 * The separate keep band is hysteresis, not redundancy: with a single threshold, a reader
 * crossing a boundary repeatedly would evict and re-request the same chunks every time.
 */
export interface TranslationBands {
  render: LineRange;
  fetch: LineRange;
  keep: LineRange;
}

export interface BandGeometry {
  /** The topmost line touching the viewport — the same anchor the reading position uses. */
  anchorLine: number;
  /** How many lines the viewport itself holds. */
  viewportLines: number;
  /** Lines rendered beyond the viewport in each direction. */
  overscanLines: number;
  lineCount: number;
}

/**
 * How far the measured viewport height must move, in lines, before the bands are
 * recomputed from it.
 *
 * Without it, a row growing by one line as its translation lands changes the visible count,
 * which changes the bands, which re-renders, which re-measures — a loop that never settles.
 */
export const VIEWPORT_LINES_HYSTERESIS = 2;

/** Viewports of translated slack on each side of the viewport. */
export const FETCH_VIEWPORTS = 2;

/** Viewports inside which nothing is evicted. Must stay well above {@link FETCH_VIEWPORTS}. */
export const KEEP_VIEWPORTS = 6;

/**
 * Characters aimed at per engine call.
 *
 * Measured cost is linear in character count with no fixed overhead, so splitting the
 * buffer into calls of this size is free — and every boundary between them is a point
 * where a fill can be abandoned because the reader scrolled away.
 */
export const CHUNK_TARGET_CHARS = 600;

/**
 * The hard ceiling for one engine call.
 *
 * Word-level highlighting silently drops candidates above roughly this many characters
 * *per call*: no error, no partial result, just a tail of the window with no highlighting.
 * No chunk may exceed it, which is why an over-long line is split mid-line rather than
 * sent whole.
 */
export const CHUNK_CEILING_CHARS = 1200;

/**
 * Where an over-long line may be cut. Sentence-final marks only — a cut here costs the
 * engine cross-sentence context it rarely uses, while cutting mid-clause would strand a
 * pattern match across two calls.
 */
const SENTENCE_BREAKS = new Set(['。', '！', '？', '；', '…', '!', '?', ';']);

/** Closing marks that belong with the sentence they end, so a cut moves past them. */
const TRAILING_MARKS = new Set(['」', '』', '”', '’', '"', "'", '）', ')', '》']);

/** One planned engine call: a line span, possibly starting or ending mid-line. */
export interface ChunkPlan {
  /** `startLine:startChar-endLine:endChar` — stable, and the cache key's own body. */
  key: string;
  startLine: number;
  /** Character offset into `startLine` where this chunk begins. */
  startChar: number;
  /** Inclusive — the last line this chunk covers. */
  endLine: number;
  /** Exclusive character offset into `endLine` where this chunk ends. */
  endChar: number;
  /** Characters the engine will see, newline separators included. */
  charCount: number;
}

/** A row as the virtualizer measures it: where it starts and how tall it turned out. */
export interface MeasuredRow {
  start: number;
  size: number;
}

/**
 * How many lines the viewport actually holds, counted from measured rows.
 *
 * Counted rather than derived from an estimated row height: rows wrap to wildly different
 * heights once Vietnamese replaces Chinese, so a height-derived count would be wrong by a
 * factor, and every band computed from it wrong with it.
 */
export function countVisibleLines(
  rows: readonly MeasuredRow[],
  scrollTop: number,
  clientHeight: number
): number {
  if (clientHeight <= 0) return 0;
  const bottom = scrollTop + clientHeight;
  let visible = 0;
  for (const row of rows) {
    if (row.start < bottom && row.start + row.size > scrollTop) visible += 1;
  }
  return visible;
}

/**
 * The viewport-line count to adopt: the new measurement only when it has moved far enough
 * to be a real resize rather than a row growing under the reader. See
 * {@link VIEWPORT_LINES_HYSTERESIS}.
 */
export function nextViewportLines(
  previous: number,
  measured: number,
  hysteresis: number = VIEWPORT_LINES_HYSTERESIS
): number {
  if (measured <= 0) return previous;
  return Math.abs(previous - measured) >= hysteresis ? measured : previous;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function clampRange(range: LineRange, lineCount: number): LineRange {
  const start = clamp(Math.floor(range.start), 0, lineCount);
  const end = clamp(Math.ceil(range.end), start, lineCount);
  return { start, end };
}

/**
 * Whether a line is one of the file's own paragraph breaks: only whitespace, as `trim()` reads
 * it (so a lone U+3000 paragraph indent and U+00A0 count). It is never translated, and the
 * Reader's panels render it at zero height and estimate it at zero too (`PanelRows`).
 *
 * `undefined` (a line whose page has not been fetched) is NOT blank here: its row keeps its
 * full estimated height, so the scrollbar does not shrink and then grow as pages land.
 * `isParagraphBreak` takes the other view of `undefined` for planning. The one definition of
 * "whitespace only" lives here, in the leaf module both `PanelRows` and the planner reach.
 */
export function isBlankLine(line: string | undefined): boolean {
  return line?.trim() === '';
}

/**
 * Where a paragraph ends, for planning. A blank line separates paragraphs, and a line that has
 * not been fetched (`undefined`) also ends one here — unlike `isBlankLine`, where it is not
 * blank — so a chunk is never planned over a prefix of a paragraph whose rest has not landed.
 */
function isParagraphBreak(line: string | undefined): boolean {
  return line === undefined || isBlankLine(line);
}

/**
 * The three bands around an anchor, each clipped to the book.
 *
 * Bands are nested by construction — `render ⊆ fetch ⊆ keep` — even when a large overscan
 * against a small viewport would otherwise push the render range outside the fetch band.
 * Nothing downstream re-checks that, so it is enforced here rather than assumed.
 */
export function computeBands(geometry: BandGeometry): TranslationBands {
  const { anchorLine, lineCount } = geometry;
  const viewportLines = Math.max(1, Math.floor(geometry.viewportLines));
  const overscanLines = Math.max(0, Math.floor(geometry.overscanLines));
  const anchor = clamp(Math.floor(anchorLine), 0, Math.max(0, lineCount - 1));

  const render = clampRange(
    { start: anchor - overscanLines, end: anchor + viewportLines + overscanLines },
    lineCount
  );
  const fetchReach = FETCH_VIEWPORTS * viewportLines;
  const fetch = clampRange(
    {
      start: Math.min(anchor - fetchReach, render.start),
      end: Math.max(anchor + viewportLines + fetchReach, render.end),
    },
    lineCount
  );
  const keepReach = KEEP_VIEWPORTS * viewportLines;
  const keep = clampRange(
    {
      start: Math.min(anchor - keepReach, fetch.start),
      end: Math.max(anchor + viewportLines + keepReach, fetch.end),
    },
    lineCount
  );

  return { render, fetch, keep };
}

/**
 * Widen a range until both ends sit on a paragraph edge.
 *
 * Required, not cosmetic: the consumed-token contract makes a partially-translated line
 * hazardous, so a translation window never starts or ends in the middle of a paragraph
 * that continues past it. A line that has not been fetched yet counts as an edge — the
 * planner cannot see past it, and the range is re-snapped once the page lands.
 */
export function snapRangeToParagraphs(
  range: LineRange,
  getLine: (index: number) => string | undefined,
  lineCount: number
): LineRange {
  const clamped = clampRange(range, lineCount);
  if (clamped.start >= clamped.end) return clamped;

  let { start, end } = clamped;
  while (start > 0 && !isParagraphBreak(getLine(start)) && !isParagraphBreak(getLine(start - 1))) {
    start -= 1;
  }
  while (
    end < lineCount &&
    !isParagraphBreak(getLine(end - 1)) &&
    !isParagraphBreak(getLine(end))
  ) {
    end += 1;
  }
  return { start, end };
}

function makeChunk(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
  charCount: number
): ChunkPlan {
  return {
    key: `${startLine}:${startChar}-${endLine}:${endChar}`,
    startLine,
    startChar,
    endLine,
    endChar,
    charCount,
  };
}

/**
 * Cut one over-long line into pieces no larger than the ceiling, preferring a
 * sentence-final mark at or after the target size.
 *
 * This is the one place a chunk boundary is allowed to fall inside a line. A paragraph of
 * several thousand characters is ordinary in these novels, and the alternative — one call
 * above the ceiling — loses highlighting for the whole tail of it with no error.
 */
export function splitLongLine(
  text: string,
  targetChars: number = CHUNK_TARGET_CHARS,
  ceilingChars: number = CHUNK_CEILING_CHARS
): Array<{ start: number; end: number }> {
  const target = Math.max(1, Math.min(targetChars, ceilingChars));
  const pieces: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (start < text.length) {
    if (text.length - start <= ceilingChars) {
      pieces.push({ start, end: text.length });
      break;
    }
    const searchFrom = start + target;
    const searchTo = Math.min(start + ceilingChars, text.length);
    let cut = -1;
    for (let i = searchFrom; i < searchTo; i += 1) {
      if (SENTENCE_BREAKS.has(text[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= start) {
      // A run this long with no sentence mark in it is not prose the engine can be
      // helped with — take the ceiling and move on rather than emitting an oversize call.
      cut = start + ceilingChars;
    } else {
      while (cut < searchTo && TRAILING_MARKS.has(text[cut])) cut += 1;
    }
    pieces.push({ start, end: cut });
    start = cut;
  }

  return pieces;
}

export interface ChunkPlanOptions {
  targetChars?: number;
  ceilingChars?: number;
}

/**
 * Whether a paragraph's own extent is known, rather than merely where the current range
 * happened to stop.
 *
 * A paragraph is complete when each side is a *known* boundary: the edge of the book, or a
 * line that has been fetched and is blank. An unfetched neighbour is not a boundary — the
 * paragraph may continue through it — and planning a chunk over the visible prefix would
 * mint a key that the full paragraph, once fetched, will never match.
 */
function isParagraphComplete(
  startLine: number,
  endLine: number,
  getLine: (index: number) => string | undefined,
  lineCount: number
): boolean {
  const boundaryBefore = startLine === 0 || isBlankLine(getLine(startLine - 1));
  const boundaryAfter = endLine >= lineCount - 1 || isBlankLine(getLine(endLine + 1));
  return boundaryBefore && boundaryAfter;
}

/** Pack one whole paragraph's lines into chunks, greedily, from its own first line. */
function planParagraph(
  startLine: number,
  endLine: number,
  getLine: (index: number) => string | undefined,
  targetChars: number,
  ceilingChars: number
): ChunkPlan[] {
  const chunks: ChunkPlan[] = [];
  let open: { startLine: number; endLine: number; endChar: number; charCount: number } | null =
    null;

  const flush = (): void => {
    if (!open) return;
    chunks.push(makeChunk(open.startLine, 0, open.endLine, open.endChar, open.charCount));
    open = null;
  };

  for (let line = startLine; line <= endLine; line += 1) {
    const text = getLine(line) ?? '';

    if (text.length > ceilingChars) {
      flush();
      for (const piece of splitLongLine(text, targetChars, ceilingChars)) {
        chunks.push(makeChunk(line, piece.start, line, piece.end, piece.end - piece.start));
      }
      continue;
    }

    // The newline separator is a character the engine sees too, so it counts.
    if (open && open.charCount + 1 + text.length > targetChars) flush();
    if (open) {
      open.charCount += 1 + text.length;
      open.endLine = line;
      open.endChar = text.length;
    } else {
      open = { startLine: line, endLine: line, endChar: text.length, charCount: text.length };
    }
  }
  flush();

  return chunks;
}

/**
 * The engine calls that cover a translation window.
 *
 * **A chunk never spans a paragraph, and packing restarts at every paragraph's own first
 * line.** That is what makes a chunk's key a pure function of the book's text rather than of
 * the range it was planned from: the snapped fetch band starts at a different paragraph every
 * time the anchor crosses one, and greedy packing carried across paragraph boundaries would
 * therefore give the same lines a different span — and so a different key — on almost every
 * scroll, re-translating text already in the cache and rendering it twice where the spans
 * overlapped. The cost of the rule is more, smaller calls where paragraphs are short, which
 * measured cost being linear in characters with no fixed overhead makes close to free.
 *
 * Within a paragraph, lines pack greedily up to the target size. The one boundary allowed
 * inside a line is {@link splitLongLine}'s, for a single line above the ceiling.
 *
 * A paragraph whose extent is not yet known — an unfetched line on either side — is skipped
 * entirely rather than planned over its visible part, and picked up once the page lands.
 * Blank lines are never sent: they carry no content, and their translation is the empty
 * string whatever the dictionaries say.
 */
export function planChunks(
  range: LineRange,
  getLine: (index: number) => string | undefined,
  lineCount: number,
  options: ChunkPlanOptions = {}
): ChunkPlan[] {
  const ceilingChars = Math.max(1, options.ceilingChars ?? CHUNK_CEILING_CHARS);
  const targetChars = Math.max(
    1,
    Math.min(options.targetChars ?? CHUNK_TARGET_CHARS, ceilingChars)
  );

  const chunks: ChunkPlan[] = [];
  let line = range.start;

  while (line < range.end) {
    if (isParagraphBreak(getLine(line))) {
      line += 1;
      continue;
    }
    let paragraphEnd = line;
    while (paragraphEnd + 1 < range.end && !isParagraphBreak(getLine(paragraphEnd + 1))) {
      paragraphEnd += 1;
    }
    if (isParagraphComplete(line, paragraphEnd, getLine, lineCount)) {
      chunks.push(...planParagraph(line, paragraphEnd, getLine, targetChars, ceilingChars));
    }
    line = paragraphEnd + 1;
  }

  return chunks;
}

/**
 * Chunks nearest the anchor first, so the region actually on screen is translated before
 * the slack around it. Stable for equal distances, so a re-plan after a page lands keeps
 * the order the previous plan had.
 */
export function orderChunksByDistance(chunks: ChunkPlan[], anchorLine: number): ChunkPlan[] {
  const distance = (chunk: ChunkPlan): number => {
    if (anchorLine < chunk.startLine) return chunk.startLine - anchorLine;
    if (anchorLine > chunk.endLine) return anchorLine - chunk.endLine;
    return 0;
  };
  return chunks
    .map((chunk, index) => ({ chunk, index, distance: distance(chunk) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.chunk);
}

/** The exact text one planned chunk sends to the engine. */
export function chunkText(
  chunk: ChunkPlan,
  getLine: (index: number) => string | undefined
): string {
  if (chunk.startLine === chunk.endLine) {
    return (getLine(chunk.startLine) ?? '').slice(chunk.startChar, chunk.endChar);
  }
  const parts: string[] = [(getLine(chunk.startLine) ?? '').slice(chunk.startChar)];
  for (let line = chunk.startLine + 1; line < chunk.endLine; line += 1) {
    parts.push(getLine(line) ?? '');
  }
  parts.push((getLine(chunk.endLine) ?? '').slice(0, chunk.endChar));
  return parts.join('\n');
}
