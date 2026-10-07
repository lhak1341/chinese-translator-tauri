/**
 * Phase 4 global conflict resolution: greedy interval scheduling over every candidate phrase
 * match at once. Longer first, then phrase (type priority 1) beats pattern (2) beats any other
 * type (3) at equal length, then earlier start; a full tie keeps input order (the sort is
 * stable). A candidate is selected when no token in its span was taken by an earlier pick.
 *
 * Phrases beat patterns at equal length because by Phase 4 all Phase 1 structural-pattern
 * tokens are already consumed; any remaining 'pattern' entry is residual and should yield to a
 * phrase of equal length. Only phrase candidates reach this function today.
 *
 * `find_best_pattern_match` in matcher.rs is not a counterpart: that picks the best pattern at
 * a single position (Phase 1). This runs across all positions.
 *
 * Pure: it neither mutates `matches` nor reads anything else. test-fixtures/
 * conflict-resolution-parity.json is its spec (ConflictResolution.parity.test.js). A WASM twin
 * existed until 2026-10-07; on the real Phase 4 inputs (3 candidates per call at the median,
 * 17 at most) it was about 17x slower, so it was deleted (ADR-083).
 */

export interface ConflictCandidate {
  startIndex: number;
  endIndex: number;
  length: number;
  type: string;
}

function typePriority(candidate: ConflictCandidate): number {
  if (candidate.type === 'phrase') return 1;
  if (candidate.type === 'pattern') return 2;
  return 3;
}

/**
 * @returns the selected candidates (the caller's own objects) in acceptance order
 */
export function resolveGlobalConflicts<T extends ConflictCandidate>(matches: readonly T[]): T[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const pa = typePriority(a);
    const pb = typePriority(b);
    if (pa !== pb) return pa - pb;
    return a.startIndex - b.startIndex;
  });

  const selected: T[] = [];
  const used = new Set<number>();
  for (const match of sorted) {
    let conflict = false;
    for (let i = match.startIndex; i <= match.endIndex; i++) {
      if (used.has(i)) {
        conflict = true;
        break;
      }
    }
    if (!conflict) {
      selected.push(match);
      for (let i = match.startIndex; i <= match.endIndex; i++) used.add(i);
    }
  }
  return selected;
}
