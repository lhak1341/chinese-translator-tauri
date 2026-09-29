/**
 * **Panel rows** (CONTEXT.md "Reader Panels"): what each of the Reader's three panels shows
 * for one raw file line, given the translated chunks that have landed.
 *
 * `projectPanelRows` folds the cache's entries once — after every chunk lands or leaves —
 * into a snapshot of per-line strings and runs. `rowAt` answers one row from that snapshot
 * and the line as it stands now, since a page can land without any chunk landing. Every
 * silent-failure rule of the panels lives here, in one place, under table tests:
 *
 * - A Vietnamese row nothing has translated yet shows its Chinese, dimmed, with no runs.
 * - A chunk whose gloss has not landed is left out of the reference panel, not assembled as
 *   an empty string — an empty string is a translated blank line, which would blank the row
 *   instead of leaving the Chinese showing.
 * - The original panel is pending only on its own page, and fills back in, as plain text,
 *   whatever part of a line no run covers.
 * - A blank line is decided from the Chinese, so all three panels collapse the same rows.
 *
 * Pure — no engine, no DOM, no React. `useWindowedTranslation` owns when to project.
 */

import type { CachedChunk } from './TranslationChunkCache';
import { assembleTranslatedLines } from './TranslationWindow';
import {
  buildCharacterOnlyLineSegments,
  buildOriginalLineSegments,
  buildTranslatedLineSegments,
  fillSegmentGapsCached,
} from './LineSegments';
import type { ReaderSegment, SegmentedChunk } from './LineSegments';

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

export type Panel = 'translation' | 'original' | 'characterOnly';

/** What a projection reads from each cached chunk. */
export type ProjectedChunk = Pick<
  CachedChunk,
  | 'chunk'
  | 'sourceText'
  | 'translatedText'
  | 'characterOnlyText'
  | 'prebuiltSegments'
  | 'originalSegments'
  | 'characterOnlySegments'
>;

/** Every landed chunk, folded into lines. Replaced whole on each projection, never mutated. */
export interface PanelRowsSnapshot {
  readonly translatedLines: ReadonlyMap<number, string>;
  readonly characterOnlyLines: ReadonlyMap<number, string>;
  readonly translatedSegments: ReadonlyMap<number, ReaderSegment[]>;
  readonly originalSegments: ReadonlyMap<number, ReaderSegment[]>;
  readonly characterOnlySegments: ReadonlyMap<number, ReaderSegment[]>;
}

export const EMPTY_PANEL_ROWS: PanelRowsSnapshot = Object.freeze({
  translatedLines: new Map(),
  characterOnlyLines: new Map(),
  translatedSegments: new Map(),
  originalSegments: new Map(),
  characterOnlySegments: new Map(),
});

export function projectPanelRows(entries: readonly ProjectedChunk[]): PanelRowsSnapshot {
  // The character-only pass folds back into lines by exactly the same rule — it is the
  // same chunks through the same engine — so it reuses the same assembler rather than
  // growing a second one that could drift from it. A chunk whose gloss has not landed
  // yet is left out entirely rather than assembled as an empty string.
  const characterOnlyLines = assembleTranslatedLines(
    entries
      .filter((entry) => entry.characterOnlyText !== null)
      .map(({ chunk, characterOnlyText }) => ({
        chunk,
        translatedText: characterOnlyText as string,
      }))
  );
  // Cut from the same chunks the lines are assembled from, so a row's runs and its plain
  // string are two views of one fold rather than two foldings that can disagree.
  const segmented: SegmentedChunk[] = entries.map((entry) => ({
    ...entry,
    translatedSegments: entry.prebuiltSegments,
  }));
  return Object.freeze({
    translatedLines: assembleTranslatedLines(entries),
    characterOnlyLines,
    translatedSegments: buildTranslatedLineSegments(segmented),
    originalSegments: buildOriginalLineSegments(segmented),
    characterOnlySegments: buildCharacterOnlyLineSegments(segmented),
  });
}

/**
 * One row of a Vietnamese panel.
 *
 * Text the reader has not reached yet shows its real Chinese, dimmed, rather than a blank
 * or a grey bar — scrolling ahead still shows something readable, and the row is measured
 * at very nearly its final height, so it barely moves when the Vietnamese lands.
 */
function vietnameseRow(
  translated: string | undefined,
  source: string | undefined,
  isBlank: boolean,
  segments?: readonly ReaderSegment[]
): PanelRow {
  if (translated !== undefined)
    return { text: translated, isPending: false, lang: 'vi', isBlank, segments };
  // Stand-in Chinese carries no runs: they describe the Vietnamese this row will become.
  return { text: source, isPending: true, lang: 'zh', isBlank };
}

/**
 * Panel `panel`'s row for raw file line `index`. `line` is that line as fetched now
 * (`undefined` before its page lands); `isBlank` must be the panels' own rule, so a row's
 * collapse and its estimated height agree.
 */
export function rowAt(
  snapshot: PanelRowsSnapshot,
  panel: Panel,
  index: number,
  line: string | undefined,
  isBlank: boolean
): PanelRow {
  if (panel === 'translation') {
    return vietnameseRow(
      snapshot.translatedLines.get(index),
      line,
      isBlank,
      snapshot.translatedSegments.get(index)
    );
  }
  if (panel === 'characterOnly') {
    return vietnameseRow(
      snapshot.characterOnlyLines.get(index),
      line,
      isBlank,
      snapshot.characterOnlySegments.get(index)
    );
  }
  const segments = line === undefined ? undefined : snapshot.originalSegments.get(index);
  return {
    text: line,
    // The source panel is only ever pending on its own page fetch, never on translation.
    isPending: line === undefined,
    lang: 'zh',
    isBlank,
    // A chunk covers part of a line before the rest of it lands, and this panel shows the
    // file's own line either way — so whatever no run covers is filled back in as plain
    // text rather than dropped. Cached on the runs' own identity: this runs per rendered
    // row per render, and a fresh array each time is a changed prop for every row.
    segments: segments && line !== undefined ? fillSegmentGapsCached(line, segments) : undefined,
  };
}
