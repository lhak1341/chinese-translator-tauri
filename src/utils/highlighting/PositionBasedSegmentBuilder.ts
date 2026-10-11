/**
 * Direct-placement path: build Chinese-panel segments using stored originalStart positions.
 * Called when all metadata entries have originalStart >= 0 (set during postProcess).
 * Avoids the greedy scan's first-available tie-breaking, which can diverge from the
 * Vietnamese panel's assignment order for duplicate translated words.
 *
 * Extracted from SegmentPrecomputer.ts (architecture review 2026-08-15) — self-contained,
 * shares no state or matching logic with precomputeOriginalSegments's own greedy scan
 * (the scan loop ADR-036 protects from unification). Not that scan; safe to split out.
 */

import type { SemanticArrays } from '../../types/SemanticTypes';
import type { Segment } from './SegmentPrecomputer';

export function buildSegmentsFromPositions(
  text: string,
  semanticArrays: SemanticArrays
): Segment[] {
  const { original, translated, metadata } = semanticArrays;

  // Sort entries by originalStart to walk the Chinese text in order
  const sorted = metadata
    .map((meta, i) => ({ i, meta }))
    .filter(({ meta }) => meta.originalStart >= 0)
    .sort((a, b) => a.meta.originalStart - b.meta.originalStart);

  const segments: Segment[] = [];
  let currentPosition = 0;

  for (const { i, meta } of sorted) {
    // Skip if this entry's range has already been covered (overlap guard)
    if (meta.originalStart < currentPosition) continue;

    // Add gap text before this entry
    if (meta.originalStart > currentPosition) {
      segments.push({
        type: 'text',
        text: text.substring(currentPosition, meta.originalStart),
        start: currentPosition,
        end: meta.originalStart,
        unitIndex: -1,
        isClickable: false,
      });
    }

    // Add the semantic segment at its recorded position
    const segEnd = Math.min(meta.originalEnd, text.length);
    segments.push({
      type: 'semantic',
      text: text.substring(meta.originalStart, segEnd),
      start: meta.originalStart,
      end: segEnd,
      unitIndex: i,
      originalText: original[i],
      translatedText: translated[i],
      source: meta.source,
      metadata: meta,
      isClickable: true,
    });

    currentPosition = segEnd;
  }

  // Add any remaining text after the last segment
  if (currentPosition < text.length) {
    segments.push({
      type: 'text',
      text: text.substring(currentPosition),
      start: currentPosition,
      end: text.length,
      unitIndex: -1,
      isClickable: false,
    });
  }

  return segments;
}
