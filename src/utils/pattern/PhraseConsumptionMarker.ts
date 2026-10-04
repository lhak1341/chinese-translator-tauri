/**
 * Marks the follower tokens of a matched phrase as consumed by the phrase phase.
 * Was hand-written 3x in TranslationEngine.js (createPhraseGroups — since deleted as dead code —
 * processRemainingPhrasesSequential, processRemainingPhrasesParallel) — one site
 * (the parallel path) had silently drifted to skip `groupedWith`, so phrase-follower
 * lookups keyed off `groupedWith` would miss entries created by that path.
 */
import { consumedSource } from '../TranslationSourcePriority';

export interface ConsumableToken {
  groupedWith?: number[];
  isGrouped?: boolean;
  groupLeader?: number | null;
  translated: unknown;
  translationSource?: string | null;
}

/**
 * `leaderIndex` keeps its translated value and gains a `groupedWith` list of every
 * follower index. Followers (`leaderIndex + 1` .. `leaderIndex + tokenSpan - 1`) are
 * marked `isGrouped`, pointed back at `leaderIndex` via `groupLeader`, and set to the
 * `phrases_consumed` state (`translated: null`) per the consumed-token contract.
 */
export function markPhraseFollowersConsumed<T extends ConsumableToken>(
  tokens: T[],
  leaderIndex: number,
  tokenSpan: number
): void {
  for (let j = 1; j < tokenSpan; j++) {
    if (leaderIndex + j < tokens.length) {
      const leader = tokens[leaderIndex];
      leader.groupedWith = leader.groupedWith || [];
      leader.groupedWith.push(leaderIndex + j);

      const follower = tokens[leaderIndex + j];
      follower.isGrouped = true;
      follower.groupLeader = leaderIndex;
      follower.translated = null;
      follower.translationSource = consumedSource('phrases');
    }
  }
}
