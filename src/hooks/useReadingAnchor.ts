import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { setReadingPosition } from '../utils/reader/BookRecordsBackend';
import { registerPendingPositionFlush } from '../utils/reader/PendingPositionFlush';
import {
  ReadingAnchor,
  type ReadingAnchorInputs,
  type ReadingAnchorSnapshot,
} from '../utils/reader/ReadingAnchor';
import type { ReadingPosition } from '../types/ReaderTypes';
import { useAppearanceVersion } from './useAppearanceVersion';

export interface UseReadingAnchorOptions extends ReadingAnchorInputs {
  fingerprint: string;
  /** Where this book was left off; `null` means it was never opened before. */
  initialPosition: ReadingPosition | null;
  /** Whether the Reader is the visible tab. */
  isActive: boolean;
  /** Increments once per constructed engine — a dictionary reload having landed. */
  engineVersion: number;
}

export interface UseReadingAnchorResult extends ReadingAnchorSnapshot {
  /** The anchor's line right now, not as of the last render. */
  readLine: () => number;
  /** The master panel's scroll handler. */
  onScroll: () => void;
  /** Every programmatic jump — see `ReadingAnchor.scrollToLine`. */
  scrollToLine: (line: number) => void;
}

/**
 * The Reader's `ReadingAnchor`, adapted to React: re-renders when the anchor line or the
 * viewport line count changes, and turns the book, tab, reload and Appearance signals —
 * plus the reader's own wheel, pointer and keys — into calls on it.
 */
export function useReadingAnchor({
  fingerprint,
  initialPosition,
  isActive,
  engineVersion,
  master,
  followers,
  lineCount,
  isRefilling,
}: UseReadingAnchorOptions): UseReadingAnchorResult {
  const [anchor] = useState(() => new ReadingAnchor({ persist: setReadingPosition }));
  anchor.setInputs({ master, followers, lineCount, isRefilling });

  const snapshot = useSyncExternalStore(anchor.subscribe, anchor.getSnapshot);

  // Read only on open: the position a book opened with is the one to restore. `fingerprint`
  // is fixed per instance (`BookReader` is keyed by it), so this runs once per book.
  const initialPositionRef = useRef(initialPosition);
  initialPositionRef.current = initialPosition;
  useEffect(() => {
    anchor.open(fingerprint, initialPositionRef.current);
    return () => anchor.close();
  }, [anchor, fingerprint]);

  useEffect(() => {
    anchor.setActive(isActive);
  }, [anchor, isActive]);

  const previousEngineVersionRef = useRef(engineVersion);
  useEffect(() => {
    if (previousEngineVersionRef.current === engineVersion) return;
    previousEngineVersionRef.current = engineVersion;
    anchor.engineReloaded();
  }, [anchor, engineVersion]);

  const appearanceVersion = useAppearanceVersion();
  useEffect(() => {
    // Version 0 is the initial render, not a change: nothing has been measured yet.
    if (appearanceVersion !== 0) anchor.appearanceChanged();
  }, [anchor, appearanceVersion]);

  // Re-measure whenever the rendered range moves — the first paint, a window resize (rows
  // enter or leave), a row growing as its translation lands. The deps are the two indices,
  // not the row array: the virtualizer returns a fresh array every render.
  const rows = master.virtualizer.getVirtualItems();
  const firstIndex = rows.length > 0 ? rows[0].index : 0;
  const lastIndex = rows.length > 0 ? rows[rows.length - 1].index : 0;
  useEffect(() => {
    anchor.onRangeChange();
  }, [anchor, firstIndex, lastIndex]);

  useEffect(() => {
    const handleInput = (event: Event): void => {
      anchor.userInput({ type: event.type, key: (event as KeyboardEvent).key });
    };
    window.addEventListener('wheel', handleInput, { passive: true });
    window.addEventListener('keydown', handleInput);
    window.addEventListener('pointerdown', handleInput);
    return () => {
      window.removeEventListener('wheel', handleInput);
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('pointerdown', handleInput);
    };
  }, [anchor]);

  // Let App.jsx's window-close-requested handler reach this book's pending write.
  useEffect(() => {
    registerPendingPositionFlush(() => anchor.flush());
    return () => registerPendingPositionFlush(null);
  }, [anchor]);

  // Stable for the component's life: the panels they reach are memoized.
  const actions = useMemo(
    () => ({
      readLine: () => anchor.readLine(),
      onScroll: () => anchor.onScroll(),
      scrollToLine: (line: number) => anchor.scrollToLine(line),
    }),
    [anchor]
  );

  return { ...snapshot, ...actions };
}
