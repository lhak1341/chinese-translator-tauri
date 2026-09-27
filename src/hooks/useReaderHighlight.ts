import { useCallback, useEffect, useState } from 'react';
import type { ReaderHighlight } from '../components/reader/ReaderPanel';

/**
 * The lit semantic unit shared across the Reader's three panels, or `null`.
 *
 * One piece of state for every panel: a unit is the same unit on both sides of the
 * translation, so lighting the Vietnamese lights the Chinese it came from with no mapping
 * step in between — which is the whole reason the panels key off a chunk key plus an index
 * rather than off text positions.
 *
 * One book per instance: `BookReader` is keyed by fingerprint, so a highlight never
 * outlives its book.
 */
export function useReaderHighlight(engineVersion: number): {
  highlight: ReaderHighlight | null;
  toggleHighlight: (next: ReaderHighlight) => void;
} {
  const [highlight, setHighlight] = useState<ReaderHighlight | null>(null);

  // A chunk key is a line range, and the same range holds different Vietnamese after a
  // dictionary reload — a highlight kept across one would light an unrelated word.
  useEffect(() => {
    setHighlight(null);
  }, [engineVersion]);

  /** Click a run to light it, click it again to clear — same gesture in every panel. */
  const toggleHighlight = useCallback((next: ReaderHighlight): void => {
    setHighlight((current) =>
      current && current.chunkKey === next.chunkKey && current.unitIndex === next.unitIndex
        ? null
        : next
    );
  }, []);

  return { highlight, toggleHighlight };
}
