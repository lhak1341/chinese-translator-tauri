/**
 * Chunk-wide highlighting payload, cut into the rows a Reader panel actually renders.
 *
 * The Translator highlights one translation at a time, whole: its panels render a single
 * engine call's output, so a segment's offset into that output is an offset into what is
 * on screen. The Reader renders a 75,000-line book as rows of raw file lines, filled by
 * many engine calls of ~600 characters each, so the same segments arrive measured against
 * text no single row contains. This module is that conversion, and nothing else: chunk
 * geometry in, one segment list per file line out.
 *
 * Pure — no engine, no DOM, no React.
 *
 * **Unit indices are chunk-scoped.** `unitIndex` numbers a chunk's own semantic arrays, so
 * unit 4 of one chunk and unit 4 of the next are unrelated. Every segment therefore carries
 * the key of the chunk it came from, and highlighting compares the pair — a bare index
 * would light up a word in every other chunk on screen.
 */

import type { ChunkLineRange, ChunkPlan } from './TranslationWindow';
import { chunkLineRanges, orderChunksByLine, rangeText } from './TranslationWindow';

/**
 * A segment as its producer measured it: a half-open range over the chunk's text.
 *
 * Both producers fit this shape — `matchWordSegments` for the Vietnamese (via the engine's
 * `prebuiltSegments`) and `precomputeOriginalSegments` for the Chinese — and both tile
 * their text end to end, semantic runs and the plain text between them alike.
 */
export interface PositionedSegment {
  start: number;
  end: number;
  /**
   * Index into the chunk's semantic arrays. Absent on the runs between units — the
   * Vietnamese producer leaves the field off its `spacing` and `remaining` segments rather
   * than setting a sentinel — so it is read as -1 wherever it is missing.
   */
  unitIndex?: number;
  isClickable: boolean;
  originalText?: string;
  translatedText?: string;
  source?: string;
}

/** One run of text inside one rendered row. */
export interface ReaderSegment {
  text: string;
  /** Index into `chunkKey`'s semantic arrays; -1 for text no unit produced. */
  unitIndex: number;
  /**
   * Which chunk's arrays `unitIndex` belongs to. Empty for plain text, which is never
   * clickable and so never compared against a highlight.
   */
  chunkKey: string;
  /** Offset of this run within its rendered row — the React key, and what fills gaps. */
  lineStart: number;
  /** The Chinese this unit matched, for the hover title. */
  originalText?: string;
  /** The Vietnamese it became, for the hover title. */
  translatedText?: string;
  /** Which phase or dictionary produced it, for the hover title. */
  source?: string;
}

/** One line as a panel renders it. */
export interface PanelRow {
  /** The text to show. `undefined` is a line whose page has not been fetched yet. */
  text: string | undefined;
  /**
   * Whether this is stand-in content — the Chinese source in a panel that will eventually
   * show Vietnamese. Styled dimmer, but in the same element, so the row's height barely
   * changes when the real text lands.
   */
  isPending: boolean;
  /** Language of `text` as rendered, which changes while a row is pending. */
  lang: 'zh' | 'vi';
  /**
   * A blank line in the source file, which renders at zero height.
   *
   * Line breaks between paragraphs are not uniform across a library — one file runs its
   * paragraphs adjacent, the next separates them by one blank line, the one after by two —
   * and every row already carries the paragraph gap as its own bottom padding. Rendering a
   * blank line as a real row would add that file's own spacing on top of the setting's, so
   * the same Paragraph Spacing would read differently from book to book. Collapsed to
   * nothing, every file spaces its paragraphs by the setting alone.
   *
   * Decided from the *original* Chinese line, never from this panel's own text, so all
   * three panels collapse the same rows and stay aligned. An unfetched line is not blank —
   * it keeps its full height, so its row does not jump when its page lands.
   */
  isBlank: boolean;
  /**
   * The row cut into clickable runs, when something has translated it. Absent while the row
   * is still Chinese stand-in text, and on a row no chunk covers.
   *
   * The runs concatenate to exactly `text`, so a row does not reflow when highlighting
   * arrives — it is the same characters, in spans rather than one text node.
   */
  segments?: readonly ReaderSegment[];
}

/** A cached chunk's highlighting payload, as this module needs to see it. */
export interface SegmentedChunk {
  chunk: ChunkPlan;
  /** Exactly what went to the engine — `chunkText(chunk, getLine)`. */
  sourceText: string;
  /** Exactly what came back. */
  translatedText: string;
  /** The Vietnamese segments, measured against `translatedText`. */
  translatedSegments: readonly PositionedSegment[];
  /** The Chinese segments, measured against `sourceText`. */
  originalSegments: readonly PositionedSegment[];
  /** The character-only gloss, or `null` while its second pass is still running. */
  characterOnlyText?: string | null;
  /** The gloss's segments, measured against `characterOnlyText`. */
  characterOnlySegments?: readonly PositionedSegment[] | null;
}

/**
 * Cut one chunk's segments into its lines.
 *
 * Text always comes from re-slicing `text`, never from a segment's own stored string: a
 * line's segments must concatenate to exactly the string the plain-text assembler builds
 * for that line, or turning highlighting on would change what the row says. (The Vietnamese
 * producer tidies spaces around quotation marks inside its own segment text, which is
 * exactly the kind of difference that would show.)
 */
function sliceChunk(
  chunkKey: string,
  text: string,
  ranges: readonly ChunkLineRange[],
  segments: readonly PositionedSegment[],
  lineStartFor: (range: ChunkLineRange, index: number) => number
): Map<number, ReaderSegment[]> {
  const byLine = new Map<number, ReaderSegment[]>();

  ranges.forEach((range, index) => {
    const base = lineStartFor(range, index);
    const out: ReaderSegment[] = [];
    let consumed = 0;

    for (const segment of segments) {
      if (segment.end <= range.start) continue;
      if (segment.start >= range.end) break;
      const from = Math.max(segment.start, range.start);
      const to = Math.min(segment.end, range.end);
      // A newline inside the folded tail of an over-split chunk renders as a space, the
      // same substitution `rangeText` makes, so segments and assembled line stay equal.
      const piece = text.slice(from, to).replace(/\n/g, ' ');
      if (piece.length === 0) continue;
      out.push({
        text: piece,
        unitIndex: segment.isClickable ? (segment.unitIndex ?? -1) : -1,
        chunkKey: segment.isClickable ? chunkKey : '',
        lineStart: base + consumed,
        originalText: segment.originalText,
        translatedText: segment.translatedText,
        source: segment.source,
      });
      consumed += piece.length;
    }

    if (out.length > 0) byLine.set(range.line, out);
  });

  return byLine;
}

/**
 * Close any hole in a producer's coverage of its own text with plain, unclickable range.
 *
 * Every producer here is *meant* to tile its text end to end, and the panel relies on that:
 * a row's runs must concatenate to exactly the assembled line. One of them can drop a
 * character — the gloss segmenter advances past a unit it cannot find in the text rather
 * than emitting it — and the result would be a row one character shorter than the plain
 * text it replaces, which reads as a rendering glitch nowhere near this file. Sealing here
 * makes the invariant structural instead of a property of three separate producers.
 */
function sealCoverage(
  textLength: number,
  segments: readonly PositionedSegment[]
): readonly PositionedSegment[] {
  let cursor = 0;
  let holes = false;
  for (const segment of segments) {
    if (segment.start > cursor) holes = true;
    cursor = Math.max(cursor, segment.end);
  }
  if (!holes && cursor >= textLength) return segments;

  const sealed: PositionedSegment[] = [];
  cursor = 0;
  for (const segment of segments) {
    if (segment.start > cursor)
      sealed.push({ start: cursor, end: segment.start, isClickable: false });
    sealed.push(segment);
    cursor = Math.max(cursor, segment.end);
  }
  if (cursor < textLength) sealed.push({ start: cursor, end: textLength, isClickable: false });
  return sealed;
}

/**
 * `sliceChunk`, memoized on the segment array it was given.
 *
 * Every fold here re-slices every resident chunk, and a fold runs each time any one chunk
 * lands — so a band of two hundred chunks re-cut all two hundred, three times over (the
 * Vietnamese, the Chinese and the gloss), for each chunk that arrived. That is the
 * quadratic in the middle of a dictionary reload: the refill replaces the whole fetch
 * band, so the cost is paid once per replaced chunk.
 *
 * A slice depends only on the chunk's text, its line ranges, its producer's segments, and
 * the base offsets — all fixed for the life of a cache entry except the bases, which is
 * what `basesAreZero` is about below. The producer's segment array is the key because it
 * is the one input that is both stable across folds and distinct per chunk and per role:
 * the same chunk's Vietnamese, Chinese and gloss arrive as three different arrays.
 *
 * The text is compared as well as keyed on, because a chunk's gloss lands *after* its
 * translation and replaces the entry: a stale pairing must miss rather than be served.
 */
const sliceCache = new WeakMap<
  readonly PositionedSegment[],
  { text: string; sliced: Map<number, ReaderSegment[]> }
>();

function sliceChunkCached(
  chunkKey: string,
  text: string,
  ranges: readonly ChunkLineRange[],
  segments: readonly PositionedSegment[],
  lineStartFor: (range: ChunkLineRange, index: number) => number
): Map<number, ReaderSegment[]> {
  const hit = sliceCache.get(segments);
  if (hit !== undefined && hit.text === text) return hit.sliced;
  const sliced = sliceChunk(
    chunkKey,
    text,
    ranges,
    sealCoverage(text.length, segments),
    lineStartFor
  );
  sliceCache.set(segments, { text, sliced });
  return sliced;
}

/**
 * Append `addition`'s runs after whatever `target` already holds for that line.
 *
 * Never mutates `addition`'s arrays, and hands them straight through when the line is
 * untouched. Both matter now that they can be memoized slices shared with the next fold:
 * pushing into one would corrupt the cache, and copying one that nothing else contributes
 * to would hand every row a new array identity per fold and defeat the panels' own
 * memoization. Concatenation only happens on a line genuinely split across chunks.
 */
function mergeInto(target: Map<number, ReaderSegment[]>, addition: Map<number, ReaderSegment[]>) {
  for (const [line, segments] of addition) {
    const existing = target.get(line);
    if (existing === undefined) target.set(line, segments);
    else target.set(line, existing.concat(segments));
  }
}

/**
 * The Vietnamese segments of every cached chunk, per raw file line.
 *
 * A row's runs concatenate to exactly `assembleTranslatedLines`' string for that row —
 * including a line split across chunks, whose halves are concatenated in book order,
 * whatever order the engine returned them in.
 */
export function buildTranslatedLineSegments(
  entries: Iterable<SegmentedChunk>
): Map<number, ReaderSegment[]> {
  return buildVietnameseLineSegments(entries, (entry) => ({
    text: entry.translatedText,
    segments: entry.translatedSegments,
  }));
}

/**
 * The character-only gloss's segments of every cached chunk, per raw file line.
 *
 * Folded by exactly the rule the gloss's plain lines are folded by — it is the same chunks
 * through the same engine — and skipping any chunk whose second pass has not landed, which
 * is the same chunk the plain assembler skips.
 */
export function buildCharacterOnlyLineSegments(
  entries: Iterable<SegmentedChunk>
): Map<number, ReaderSegment[]> {
  const glossed = [...entries].filter(
    (entry) => entry.characterOnlyText != null && entry.characterOnlySegments != null
  );
  return buildVietnameseLineSegments(glossed, (entry) => ({
    text: entry.characterOnlyText as string,
    segments: entry.characterOnlySegments as readonly PositionedSegment[],
  }));
}

/**
 * Both Vietnamese panels' line segments, which differ only in which text they read.
 *
 * Offsets accumulate across the chunks covering one line, unlike the Chinese panel's: a
 * Vietnamese row *is* whatever its chunks produced, so its runs tile it by construction and
 * the next chunk's runs start where the last chunk's text ended.
 */
function buildVietnameseLineSegments(
  entries: Iterable<SegmentedChunk>,
  read: (entry: SegmentedChunk) => { text: string; segments: readonly PositionedSegment[] }
): Map<number, ReaderSegment[]> {
  const byLine = new Map<number, ReaderSegment[]>();
  // How much of each line earlier chunks already contributed — a split line's second half
  // starts where its first half ended, which is what makes `lineStart` unique per row.
  const filled = new Map<number, number>();

  for (const entry of orderChunksByLine(entries)) {
    const { text, segments } = read(entry);
    const ranges = chunkLineRanges(entry.chunk, text);
    // The memo can only answer for bases of zero, since the bases are the one input that
    // depends on the other chunks in the fold. They are zero for every chunk that starts
    // each line it touches, which is all of them except where one source line was long
    // enough to be split across chunks — the rare case, which falls through and re-slices.
    const basesAreZero = ranges.every((range) => (filled.get(range.line) ?? 0) === 0);
    const sliced = basesAreZero
      ? sliceChunkCached(entry.chunk.key, text, ranges, segments, () => 0)
      : sliceChunk(
          entry.chunk.key,
          text,
          ranges,
          sealCoverage(text.length, segments),
          (range) => filled.get(range.line) ?? 0
        );
    for (const range of ranges) {
      filled.set(range.line, (filled.get(range.line) ?? 0) + rangeText(text, range).length);
    }
    mergeInto(byLine, sliced);
  }

  return byLine;
}

/**
 * Relabel the gloss's units with the full translation's, by the source characters they
 * cover.
 *
 * The gloss is a *second* engine pass over the same chunk, with semantic arrays of its own:
 * its unit 3 and the full translation's unit 3 are unrelated, so a shared highlight needs
 * one index space. The Translator solves the same problem by fuzzy text matching
 * (`findCharacterOnlyMatch`) because its two passes cover a whole document independently.
 * Here both passes are measured against one identical chunk source, so the correspondence
 * is just character overlap — exact, and computed once when the gloss lands.
 *
 * A gloss unit covering source characters no full-translation unit claims becomes plain
 * text: it has nothing to highlight with, and inventing an index would light a word
 * elsewhere in the row.
 *
 * @param glossSegments the gloss's runs over the gloss text — what gets relabeled.
 * @param glossSourceSegments the gloss's units over the *source* text.
 * @param originalSegments the full translation's units over the same source text.
 */
export function bridgeGlossSegments(
  glossSegments: readonly PositionedSegment[],
  glossSourceSegments: readonly PositionedSegment[],
  originalSegments: readonly PositionedSegment[]
): PositionedSegment[] {
  const sourceRangeOf = new Map<number, { start: number; end: number }>();
  for (const segment of glossSourceSegments) {
    if (!segment.isClickable || segment.unitIndex === undefined) continue;
    sourceRangeOf.set(segment.unitIndex, { start: segment.start, end: segment.end });
  }

  const fullUnits = originalSegments.filter(
    (segment) => segment.isClickable && segment.unitIndex !== undefined
  );

  /** The full-translation unit sharing the most source characters with this range. */
  const bestMatch = (range: { start: number; end: number }): PositionedSegment | undefined => {
    let best: PositionedSegment | undefined;
    let bestOverlap = 0;
    for (const unit of fullUnits) {
      const overlap = Math.min(unit.end, range.end) - Math.max(unit.start, range.start);
      if (overlap > bestOverlap) {
        best = unit;
        bestOverlap = overlap;
      }
    }
    return best;
  };

  const matched = new Map<number, PositionedSegment | undefined>();
  return glossSegments.map((segment) => {
    if (!segment.isClickable || segment.unitIndex === undefined) return segment;
    const range = sourceRangeOf.get(segment.unitIndex);
    if (range === undefined) return { ...segment, isClickable: false };
    if (!matched.has(segment.unitIndex)) matched.set(segment.unitIndex, bestMatch(range));
    const match = matched.get(segment.unitIndex);
    if (match === undefined) return { ...segment, isClickable: false };
    return {
      ...segment,
      unitIndex: match.unitIndex,
      originalText: match.originalText,
      translatedText: match.translatedText,
      source: match.source,
    };
  });
}

/**
 * The Chinese segments of every cached chunk, per raw file line.
 *
 * Offsets are the file line's own, not a running total: a chunk knows where in its first
 * line it began (`startChar`), so a row whose earlier half has not been translated yet
 * still places its runs correctly, and {@link fillSegmentGaps} covers what is missing.
 */
export function buildOriginalLineSegments(
  entries: Iterable<SegmentedChunk>
): Map<number, ReaderSegment[]> {
  const byLine = new Map<number, ReaderSegment[]>();

  for (const entry of orderChunksByLine(entries)) {
    // Always cacheable, unlike the Vietnamese fold: this panel's base offsets come from the
    // chunk's own `startChar`, never from what an earlier chunk contributed.
    mergeInto(
      byLine,
      sliceChunkCached(
        entry.chunk.key,
        entry.sourceText,
        chunkLineRanges(entry.chunk, entry.sourceText),
        entry.originalSegments,
        (range) => (range.line === entry.chunk.startLine ? entry.chunk.startChar : 0)
      )
    );
  }

  return byLine;
}

/**
 * Fill a row's uncovered stretches with plain text from the line itself.
 *
 * Only the Chinese panel needs this, and only transiently: it renders the file's own line
 * whether or not anything has translated it, so a row halfway through a fill would
 * otherwise drop the characters no chunk has reached yet. Returns the input untouched when
 * the runs already cover the line, which is the steady state.
 */
export function fillSegmentGaps(
  lineText: string,
  segments: readonly ReaderSegment[]
): readonly ReaderSegment[] {
  // The steady state is no gaps at all, and it is worth detecting rather than rebuilding
  // into an equal-but-new array: this runs per rendered row per render, and a fresh array
  // each time is a changed `segments` prop, which defeats `SegmentedLine`'s `React.memo`
  // for the whole Chinese panel — every row's spans re-rendered on every render, forever.
  // Returning the input unchanged is what the doc comment above already promises.
  let cursor = 0;
  let hasGap = false;
  for (const segment of segments) {
    if (segment.lineStart > cursor) {
      hasGap = true;
      break;
    }
    cursor = segment.lineStart + segment.text.length;
  }
  if (!hasGap && cursor >= lineText.length) return segments;

  const out: ReaderSegment[] = [];
  cursor = 0;

  for (const segment of segments) {
    if (segment.lineStart > cursor) {
      out.push({
        text: lineText.slice(cursor, segment.lineStart),
        unitIndex: -1,
        chunkKey: '',
        lineStart: cursor,
      });
    }
    out.push(segment);
    cursor = segment.lineStart + segment.text.length;
  }

  if (cursor < lineText.length) {
    out.push({ text: lineText.slice(cursor), unitIndex: -1, chunkKey: '', lineStart: cursor });
  }

  return out;
}

/**
 * `fillSegmentGaps`, memoized on the runs it was given.
 *
 * The gap-filled array for a row only changes when that row's runs do, and its runs are
 * replaced wholesale by a rebuild — so keying on the array's identity is exact, not a
 * heuristic. A `WeakMap` means a line the reader scrolled away from drops out with the
 * rebuild that replaced it, with no eviction rule to maintain.
 *
 * The line text is stored alongside and compared, because the same runs can outlive the
 * page they were measured against while a fetch is in flight.
 */
const gapFillCache = new WeakMap<
  readonly ReaderSegment[],
  { lineText: string; filled: readonly ReaderSegment[] }
>();

export function fillSegmentGapsCached(
  lineText: string,
  segments: readonly ReaderSegment[]
): readonly ReaderSegment[] {
  const hit = gapFillCache.get(segments);
  if (hit !== undefined && hit.lineText === lineText) return hit.filled;
  const filled = fillSegmentGaps(lineText, segments);
  gapFillCache.set(segments, { lineText, filled });
  return filled;
}
