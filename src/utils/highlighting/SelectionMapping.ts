/**
 * Selection mapping — turning a selection in a translation panel into the Chinese it came from.
 *
 * The quick-add keys (Cmd-1..7) read the selection as the new entry's Source. When that
 * selection sits in a translation panel it is Vietnamese, so each surface registers a mapper
 * that snaps it to the whole units it touches and returns their **covering span** of the
 * original Chinese: everything from the earliest unit's start to the latest unit's end, gaps
 * included, because a dictionary entry is one contiguous run of source text however the
 * translation reordered it.
 *
 * Registered mappers, not a hotkey option: Cmd-1..6 belong to the Translator and Reader
 * registrations but Cmd-7 belongs to the tab container's, which knows no panel. Every
 * registration asks the same registry, and only the mapper whose panel holds the selection
 * answers.
 *
 * `resolveQuickAddSource` is the whole question every Add route asks — the keys and the
 * Reader's palette alike: the mapped Chinese, else the plain selected text, else the
 * clipboard. It never writes the clipboard.
 */

import type { SemanticArrays } from '../../types/SemanticTypes';
import type { ReaderSegment } from '../reader/LineSegments';
import { precomputeOriginalSegments } from './SegmentPrecomputer';
import { logger } from '../logger';

/** One unit's run over the source text: `key` identifies the unit within its surface. */
export interface SourceRun {
  key: string;
  start: number;
  end: number;
}

export type SelectionMapping =
  | { kind: 'mapped'; source: string }
  | { kind: 'refused'; reason: string }
  /** Not a selection over translated units — the caller keeps the raw selected text. */
  | { kind: 'unmapped' };

export type SelectionMapper = (range: Range) => SelectionMapping;

const UNMAPPED: SelectionMapping = { kind: 'unmapped' };

export const CROSSES_LINE_REASON = 'Selection spans more than one line — select within one line';

/**
 * The covering span of the units named by `keys`, over `sourceText`.
 *
 * Refused when the span crosses a line break: no dictionary entry spans lines, so a span
 * that does is a drag that went further than meant.
 */
export function mapSelectedUnits(
  keys: readonly string[],
  runs: readonly SourceRun[],
  sourceText: string
): SelectionMapping {
  const wanted = new Set(keys);
  let start = Infinity;
  let end = -Infinity;
  for (const run of runs) {
    if (!wanted.has(run.key)) continue;
    start = Math.min(start, run.start);
    end = Math.max(end, run.end);
  }
  if (start === Infinity) return UNMAPPED;
  const span = sourceText.slice(start, end);
  if (span.includes('\n')) return { kind: 'refused', reason: CROSSES_LINE_REASON };
  const source = span.trim();
  if (!source) return UNMAPPED;
  return { kind: 'mapped', source };
}

/**
 * The unit elements a range touches inside `container`, in document order — a unit only
 * partly selected counts whole.
 *
 * Null when the range is not wholly inside the container, or touches no unit — both mean
 * "not a translation-panel selection", which the caller answers with the raw text. A unit
 * is an element carrying a non-negative `data-unit-index`; runs no unit produced carry -1
 * or no attribute at all.
 */
export function touchedUnits(range: Range, container: HTMLElement): HTMLElement[] | null {
  if (!container.contains(range.commonAncestorContainer)) return null;
  const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-unit-index]')).filter(
    (element) => Number(element.dataset.unitIndex) >= 0 && range.intersectsNode(element)
  );
  return elements.length === 0 ? null : elements;
}

/**
 * The Translator's Full Translation panel: units are keyed by `data-unit-index`, and their
 * runs over the input are the ones the Original Chinese panel draws.
 */
export function mapTranslatorSelection(
  range: Range,
  container: HTMLElement | null,
  originalText: string,
  semanticArrays: SemanticArrays | null | undefined
): SelectionMapping {
  if (!container || !semanticArrays) return UNMAPPED;
  const selected = touchedUnits(range, container);
  if (!selected) return UNMAPPED;
  const runs = precomputeOriginalSegments(originalText, semanticArrays)
    .filter((segment) => segment.unitIndex >= 0)
    .map((segment) => ({ key: String(segment.unitIndex), start: segment.start, end: segment.end }));
  const keys = selected.map((element) => element.dataset.unitIndex ?? '');
  return mapSelectedUnits(keys, runs, originalText);
}

/** A Reader row's Chinese, as its Original panel draws it. */
interface ReaderOriginalRow {
  text: string | undefined;
  segments?: readonly ReaderSegment[];
}

const readerKey = (chunkKey: string, unitIndex: number | string): string =>
  `${chunkKey}:${unitIndex}`;

/**
 * The Reader's Translation panel: a unit index is only unique within its chunk, so units
 * are keyed by chunk and index, and matched against the same row of the Original panel.
 * A selection over more than one row is refused — rows are the book's lines.
 */
export function mapReaderSelection(
  range: Range,
  container: HTMLElement | null,
  originalRow: (index: number) => ReaderOriginalRow | undefined
): SelectionMapping {
  if (!container) return UNMAPPED;
  const selected = touchedUnits(range, container);
  if (!selected) return UNMAPPED;
  const rows = new Set(
    selected.map((element) => element.closest<HTMLElement>('[data-index]')?.dataset.index)
  );
  if (rows.size > 1) return { kind: 'refused', reason: CROSSES_LINE_REASON };
  const [rowIndex] = rows;
  const row = rowIndex === undefined ? undefined : originalRow(Number(rowIndex));
  if (!row?.text || !row.segments) return UNMAPPED;
  const runs = row.segments
    .filter((segment) => segment.chunkKey !== '')
    .map((segment) => ({
      key: readerKey(segment.chunkKey, segment.unitIndex),
      start: segment.lineStart,
      end: segment.lineStart + segment.text.length,
    }));
  const keys = selected.map((element) =>
    readerKey(element.dataset.chunkKey ?? '', element.dataset.unitIndex ?? '')
  );
  return mapSelectedUnits(keys, runs, row.text);
}

const mappers = new Set<SelectionMapper>();

/** Registers a surface's mapper; returns the function that removes it. */
export function registerSelectionMapper(mapper: SelectionMapper): () => void {
  mappers.add(mapper);
  return () => {
    mappers.delete(mapper);
  };
}

/**
 * The first registered mapper's answer that is not `unmapped`. A mapper that throws — its
 * surface's state went stale under it — counts as not recognising the selection, so the
 * key still falls back to the raw text instead of failing.
 */
export function mapSelectionRange(range: Range | null): SelectionMapping {
  if (!range || range.collapsed) return UNMAPPED;
  for (const mapper of mappers) {
    try {
      const mapping = mapper(range);
      if (mapping.kind !== 'unmapped') return mapping;
    } catch {
      // Treated as unmapped — see above.
    }
  }
  return UNMAPPED;
}

/** The text an Add starts from, or why the selection cannot give one. */
export type QuickAddSource = { kind: 'source'; text: string } | { kind: 'refused'; reason: string };

/**
 * What an Add (Cmd-1..7, or a Reader palette Add row) starts from: a selection in a translation
 * panel mapped to its Chinese; a selection the mappers refuse, refused; any other selection as
 * its plain text; and with nothing selected, the clipboard — "add what I'm pointing at, else
 * what I copied". Reads the clipboard only in that last case and never writes it, so the
 * user's copied text survives the key press. A clipboard that cannot be read gives `''`.
 */
export async function resolveQuickAddSource(
  selection: Selection | null = window.getSelection(),
  readClipboard: () => Promise<string> = () => navigator.clipboard.readText()
): Promise<QuickAddSource> {
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const mapping = mapSelectionRange(range);
  if (mapping.kind === 'refused') return mapping;
  if (mapping.kind === 'mapped') return { kind: 'source', text: mapping.source };
  const selected = selection?.toString().trim() ?? '';
  if (selected) return { kind: 'source', text: selected };
  try {
    return { kind: 'source', text: (await readClipboard()).trim() };
  } catch (cause) {
    logger.warn('Could not read the clipboard for an Add:', cause);
    return { kind: 'source', text: '' };
  }
}
