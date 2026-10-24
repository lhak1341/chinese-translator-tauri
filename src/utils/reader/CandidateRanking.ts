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

/** Boosts, re-sorts and cuts `candidates`, with each row's type for `target`. Ties in the
 * boosted score go to the higher raw count, then to the text (UTF-16 order; the
 * analysis sorts). */
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
        (a.candidate.text < b.candidate.text ? -1 : a.candidate.text > b.candidate.text ? 1 : 0)
    )
    .slice(0, MAX_RANKED)
    .map(({ candidate, semanticType, ruled }) => ({ candidate, semanticType, ruled }));
}

export function filterByRule(ranked: RankedCandidate[], filter: RuleFilter): RankedCandidate[] {
  if (filter === 'all') return ranked;
  return ranked.filter((row) => row.ruled === (filter === 'rule'));
}
