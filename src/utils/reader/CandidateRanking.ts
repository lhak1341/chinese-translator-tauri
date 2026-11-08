import type { Candidate } from '../../types/ReaderTypes';
import type { TransformRule } from '../../types/TransformRuleTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import { candidateType } from './CandidateAdd';

/**
 * The Candidate finder's Transform Rules pass over a run's survivors (ADR-111): the ×3 rule
 * boost, the re-sort and the cut. Pure, so a rule edit re-ranks the cached survivors without
 * a re-run.
 */

/** What an enabled Transform Rule match multiplies a candidate's count by when ranking. */
export const RULE_BOOST = 3;

/** How many ranked candidates the panel keeps (the held-out recall was measured at 1000). */
export const MAX_RANKED = 1000;

export interface RankedCandidate {
  candidate: Candidate;
  /** The row's pre-selected type: the matching rule's, else the target's default. */
  semanticType: SemanticType | '';
  /** Whether an enabled rule matched, so the type is the rule's and not the default. */
  ruled: boolean;
}

/** The type chips: every row, rows a rule typed, rows no rule matches. */
export type RuleFilter = 'all' | 'rule' | 'none';

/** Characters (code points) in a candidate's text. */
const textLength = (text: string): number => [...text].length;

/** Boosts, re-sorts and cuts `candidates`, with each row's type for `target`. Ties in the
 * boosted score go to the higher raw count, then to the longer text, then to the text
 * (UTF-16 order; the analysis sorts). Pattern-covered survivors are already gone (`CandidateFinderStore`). */
export function rankCandidates(
  candidates: readonly Candidate[],
  rules: TransformRule[],
  target: string
): RankedCandidate[] {
  return candidates
    .map((candidate) => {
      const { semanticType, ruled } = candidateType(rules, candidate.text, target);
      return { candidate, semanticType, ruled, score: candidate.count * (ruled ? RULE_BOOST : 1) };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.count - a.candidate.count ||
        textLength(b.candidate.text) - textLength(a.candidate.text) ||
        (a.candidate.text < b.candidate.text ? -1 : a.candidate.text > b.candidate.text ? 1 : 0)
    )
    .slice(0, MAX_RANKED)
    .map(({ candidate, semanticType, ruled }) => ({ candidate, semanticType, ruled }));
}

/** The rank chips: every row, or only the first 100, 250 or 500 in likelihood order. */
export type RankLimit = 'all' | 100 | 250 | 500;

/** Keeps the first `limit` rows. Applied after the other filters, so "Top 100" of "4 chars" is
 * the 100 likeliest four-character rows, and before the sort, so a sort reorders the kept rows. */
export function limitToTop(ranked: RankedCandidate[], limit: number | 'all'): RankedCandidate[] {
  return limit === 'all' ? ranked : ranked.slice(0, limit);
}

/** How the panel orders the ranked survivors: by likelihood, or longest phrase first. */
export type CandidateSort = 'likely' | 'length';

/** Orders ranked rows for display. 'length' is a view over the rows the cut already kept (never
 * a different cut) and is stable, so equal lengths keep their likelihood order. */
export function sortRanked(ranked: RankedCandidate[], sort: CandidateSort): RankedCandidate[] {
  if (sort === 'likely') return ranked;
  return [...ranked].sort((a, b) => textLength(b.candidate.text) - textLength(a.candidate.text));
}

/** The length chips: every row, exactly 2, 3 or 4 characters, or 5 and up. */
export type LengthFilter = 'all' | 2 | 3 | 4 | '5+';

export function filterByLength(ranked: RankedCandidate[], filter: LengthFilter): RankedCandidate[] {
  if (filter === 'all') return ranked;
  return ranked.filter((row) => {
    const length = textLength(row.candidate.text);
    return filter === '5+' ? length >= 5 : length === filter;
  });
}

export function filterByRule(ranked: RankedCandidate[], filter: RuleFilter): RankedCandidate[] {
  if (filter === 'all') return ranked;
  return ranked.filter((row) => row.ruled === (filter === 'rule'));
}
