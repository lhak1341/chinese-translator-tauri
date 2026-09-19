import { useCallback, useEffect, useState } from 'react';
import type { ReaderHighlight } from '../components/reader/ReaderPanel';

/**
 * The lit semantic unit shared across the Reader's three panels, or `null`.
 *
 * One piece of state for every panel: a unit is the same unit on both sides of the
 * translation, so lighting the Vietnamese lights the Chinese it came from with no mapping
 * step in between — which is the whole reason the panels key off a chunk key plus an index
 * rather than off text positions.
 */
export function useReaderHighlight(
  fingerprint: string,
  engineVersion: number
): { highlight: ReaderHighlight | null; toggleHighlight: (next: ReaderHighlight) => void } {
  const [highlight, setHighlight] = useState<ReaderHighlight | null>(null);

  // A chunk key is a line range, so the same key names a different passage in another book
  // and different Vietnamese after a dictionary reload. Neither is a highlight worth
  // keeping, and both would otherwise light an unrelated word.
  useEffect(() => {
    setHighlight(null);
  }, [fingerprint, engineVersion]);

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
