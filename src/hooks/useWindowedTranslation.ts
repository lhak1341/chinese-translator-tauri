import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { rowAt } from '../utils/reader/PanelRows';
import type { PanelRow } from '../utils/reader/PanelRows';
import { WindowFiller } from '../utils/reader/WindowFiller';
import type { ChunkTranslationResult, GlossResult } from '../utils/reader/WindowedTranslationFill';
import type { EngineCall } from '../utils/reader/ReaderEngine';

export type { ChunkTranslationResult, GlossResult } from '../utils/reader/WindowedTranslationFill';

export interface UseWindowedTranslationOptions {
  lineCount: number;
  /** Topmost line touching the viewport — the same anchor the reading position uses. */
  anchorLine: number;
  viewportLines: number;
  overscanLines: number;
  /** Bumped by `useBookLines` whenever a page lands, so a plan blocked on unfetched lines re-runs. */
  linesVersion: number;
  getLine: (index: number) => string | undefined;
  /**
   * One engine call. Must be referentially stable, and must come from `createReaderEngine`
   * (`src/utils/reader/ReaderEngine.ts`) — the `EngineCall` brand is what makes wiring a
   * callback that bypasses the Reader's engine queue a compile error.
   */
  translateChunk: EngineCall<ChunkTranslationResult>;
  /**
   * The same text through the engine's character-only pass, for the reference panel. Runs
   * *after* the chunk's full translation has already been published, so the gloss costs
   * the translation panel nothing but its own engine time. Must be referentially stable and
   * come from `createReaderEngine`, same as `translateChunk`.
   */
  translateGloss: EngineCall<GlossResult>;
  /** Bumped on every engine reinitialization; a change invalidates the whole cache. */
  dictionaryVersion: number;
  /** Translation only runs while the engine is ready and the Reader is the visible tab. */
  isEnabled: boolean;
}

export interface WindowedTranslation {
  /**
   * Each panel's row for a raw file line — see `PanelRow` and CONTEXT.md's "Reader Panels".
   * Each getter is referentially stable for the component's life.
   */
  getRow: {
    translation: (index: number) => PanelRow;
    original: (index: number) => PanelRow;
    characterOnly: (index: number) => PanelRow;
  };
  /**
   * Changes whenever any row's content does — a page landing, a chunk landing, an eviction.
   *
   * The getters above read through refs and never change identity, which is what lets the
   * panels' `estimateSize` stay stable — but it means a memoized panel cannot tell from
   * them that there is new text to show. This is the value it watches instead.
   */
  contentVersion: number;
  /** True while a fill is in progress, for a quiet indicator rather than a blocking state. */
  isTranslating: boolean;
}

/**
 * The Reader's Window Filler (`src/utils/reader/WindowFiller.ts`, CONTEXT.md "Window
 * Filler"), adapted to React: one filler per book instance, re-planned from one effect
 * whenever an input changes, read through `useSyncExternalStore`, disposed on unmount. The
 * fill's rules — planning, the two staleness signals, the cache, when `isTranslating`
 * clears — are the filler's and are tested there, without `renderHook`.
 *
 * What stays here is display: the row getters, which hand the filler's rows to `rowAt`
 * (which decides blankness from the line), and `contentVersion`.
 *
 * `translateChunk`/`translateGloss` are read once, when the filler is built — they must be
 * stable, and `BookReader` remounts per book (ADR-050).
 */
export function useWindowedTranslation({
  lineCount,
  anchorLine,
  viewportLines,
  overscanLines,
  linesVersion,
  getLine,
  translateChunk,
  translateGloss,
  dictionaryVersion,
  isEnabled,
}: UseWindowedTranslationOptions): WindowedTranslation {
  const [filler] = useState(() => new WindowFiller({ translateChunk, translateGloss }));
  const { version, isTranslating } = useSyncExternalStore(filler.subscribe, filler.getSnapshot);

  useEffect(() => () => filler.dispose(), [filler]);

  // `linesVersion` is an input only as a trigger: `getLine` reads through a ref, so a page
  // landing changes nothing the filler can see except that it is asked again.
  useEffect(() => {
    filler.update({
      lineCount,
      anchorLine,
      viewportLines,
      overscanLines,
      getLine,
      dictionaryVersion,
      isEnabled,
    });
  }, [
    filler,
    anchorLine,
    dictionaryVersion,
    getLine,
    isEnabled,
    lineCount,
    linesVersion,
    overscanLines,
    viewportLines,
  ]);

  // Stable getters that read the filler's latest rows, so the panels' `estimateSize` never
  // changes identity; `contentVersion` is what tells a memoized panel to look again.
  const translationRow = useCallback(
    (index: number): PanelRow =>
      rowAt(filler.getSnapshot().rows, 'translation', index, getLine(index)),
    [filler, getLine]
  );
  const originalRow = useCallback(
    (index: number): PanelRow =>
      rowAt(filler.getSnapshot().rows, 'original', index, getLine(index)),
    [filler, getLine]
  );
  const characterOnlyRow = useCallback(
    (index: number): PanelRow =>
      rowAt(filler.getSnapshot().rows, 'characterOnly', index, getLine(index)),
    [filler, getLine]
  );

  const getRow = useMemo(
    () => ({ translation: translationRow, original: originalRow, characterOnly: characterOnlyRow }),
    [translationRow, originalRow, characterOnlyRow]
  );

  // Both counters only ever increase, so their sum changes whenever either does.
  return { getRow, contentVersion: linesVersion + version, isTranslating };
}
