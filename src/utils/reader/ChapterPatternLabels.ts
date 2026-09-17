import type { ChapterPatternCandidate, ChapterPatternId } from '../../types/ReaderTypes';

/**
 * How each header convention is named and summarized for the reader.
 *
 * Shared by the chapter slide-over and the binding dialog, which both show the election
 * result and both offer the override — two places rendering the same candidate list from
 * one table rather than two hand-copied ones that can disagree about what `hui` is called
 * or about whether "regularity" is a fraction or a percentage.
 */
export const CHAPTER_PATTERN_LABELS: Record<ChapterPatternId, string> = {
  chapter: 'Chapter (第...章)',
  section: 'Section (第...节)',
  volume: 'Volume (第...卷)',
  hui: 'Hui (第...回)',
  bareNumber: 'Numbered lines',
};

/** A candidate's median gap, or the em dash the election itself means by `null`: too few
 * hits (or too gappy) for the number to carry information. */
export function formatMedianGap(candidate: ChapterPatternCandidate): string {
  return candidate.medianGap == null ? '—' : String(Math.round(candidate.medianGap));
}

/** A candidate's regularity as a percentage, or an em dash when it has none. */
export function formatRegularity(candidate: ChapterPatternCandidate): string {
  return candidate.regularity == null ? '—' : `${Math.round(candidate.regularity * 100)}%`;
}

/** The same stats on one line, for a dropdown option. Rounds through the two formatters
 * above rather than repeating their arithmetic, so a table cell and a dropdown option can
 * never disagree about what a candidate scored. */
export function candidateSummary(candidate: ChapterPatternCandidate): string {
  const parts = [`${candidate.hitCount} hit${candidate.hitCount === 1 ? '' : 's'}`];
  if (candidate.medianGap != null) parts.push(`median gap ${formatMedianGap(candidate)}`);
  if (candidate.regularity != null) parts.push(`${formatRegularity(candidate)} regular`);
  return parts.join(', ');
}
