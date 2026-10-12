/**
 * Span claims: the one place a phase writes a match onto the token array.
 *
 * A phase that matches a span of tokens leaves the first token (the leader) holding the
 * translation and every other token (a follower) consumed: `translated: null`, a
 * `<leader source>_consumed` source and `groupLeader` pointing back. The consumed-token contract
 * (TranslationSourcePriority.ts) is that rule. Phases used to hand-write it, and one copy drifted
 * and skipped `groupedWith`.
 *
 * Two shapes, because `postProcess` and the highlight path read the two differently:
 * - `claimSpan` (Phase 1 patterns, Phase 3 numbers) writes the light shape: no `isGrouped`, no
 *   `groupedWith`, the leader's `value` untouched. Pattern-consumed tokens stay in
 *   `getTextFromTokens`, so text keeps lining up with the tokenizer's `.start` positions.
 * - `claimGroupedSpan` (Phase 2 proper nouns, Phase 4 phrases, Phase 5 characters) also marks the
 *   span `isGrouped`, records `groupedWith`/`originalValue`, and rewrites the leader's `value`
 *   and `end` to the grouped text. When it overwrites an earlier phase's leader it releases that
 *   leader's followers outside the new span, or they would be silently dropped.
 *
 * `isClaimed` is the read side: whether any phase has claimed a token. Every phase's skip test and
 * span check uses it. It reads two fields only, because every writer of `isGrouped` or
 * `groupLeader` (this module) and of `translated` (this module, `NumberLiangFix`, the
 * character-only sentinels) sets `translationSource` in the same call, and the orphan release
 * clears all of them together.
 *
 * Both claims check what a JS caller can get wrong without a compiler: a leader with a null translation
 * (its characters vanish from the output) and a source `getSourcePriority` does not rank (it
 * sorts below the character fallback). Violations are logged, never thrown.
 */
import { logger } from './logger';
import { consumedSource, getSourcePriority, isConsumedSource } from './TranslationSourcePriority';

export interface ClaimableToken {
  value: string;
  end?: number;
  translated: unknown;
  translationSource?: string | null;
  groupLeader?: number | null;
  isGrouped?: boolean;
  groupedWith?: number[];
  originalValue?: string;
}

const UNRANKED = 999;

/** Whether an earlier phase claimed this token (as a leader or a consumed follower). */
export function isClaimed(
  token: Pick<ClaimableToken, 'translated' | 'translationSource'>
): boolean {
  return token.translated !== null || Boolean(token.translationSource);
}

function checkLeader(
  source: string,
  translated: unknown,
  startIndex: number,
  activeProperNouns: string[]
): void {
  if (translated === null || translated === undefined) {
    logger.error(
      `🚨 span claim at token ${startIndex}: source "${source}" has no translation ` +
        `(its characters would be deleted from the output)`
    );
  }
  if (isConsumedSource(source) || getSourcePriority(source, activeProperNouns) === UNRANKED) {
    logger.error(
      `🚨 span claim at token ${startIndex}: "${source}" is not a ranked leader source ` +
        `(it ranks ${UNRANKED}, below the character fallback)`
    );
  }
}

/**
 * Claims tokens `startIndex..endIndex` (inclusive) as the light shape: the leader gets the
 * translation, each follower is consumed by it.
 */
export function claimSpan(
  tokens: ClaimableToken[],
  startIndex: number,
  endIndex: number,
  source: string,
  translated: string,
  activeProperNouns: string[] = []
): void {
  checkLeader(source, translated, startIndex, activeProperNouns);
  tokens[startIndex].translated = translated;
  tokens[startIndex].translationSource = source;

  const followerSource = consumedSource(source);
  for (let i = startIndex + 1; i <= endIndex; i++) {
    const follower = tokens[i];
    if (!follower) continue;
    follower.translated = null;
    follower.translationSource = followerSource;
    follower.groupLeader = startIndex;
  }
}

/**
 * Claims `tokenSpan` tokens from `startIndex` as the grouped shape. `groupedText` is the matched
 * word; the leader's `value` becomes it and its `end` becomes the last token's `end`. A span of
 * one token is a plain leader: translation and source only.
 */
export function claimGroupedSpan(
  tokens: ClaimableToken[],
  startIndex: number,
  tokenSpan: number,
  source: string,
  translated: string,
  groupedText: string,
  activeProperNouns: string[] = []
): void {
  checkLeader(source, translated, startIndex, activeProperNouns);
  const leader = tokens[startIndex];
  leader.translated = translated;
  leader.translationSource = source;
  if (tokenSpan <= 1) return;

  leader.isGrouped = true;
  if (!leader.originalValue) leader.originalValue = leader.value;
  leader.value = groupedText;
  const lastIndex = startIndex + tokenSpan - 1;
  if (lastIndex < tokens.length) leader.end = tokens[lastIndex].end;

  const followerSource = consumedSource(source);
  leader.groupedWith = leader.groupedWith || [];
  for (let i = 1; i < tokenSpan; i++) {
    const follower = tokens[startIndex + i];
    if (!follower) continue;
    leader.groupedWith.push(startIndex + i);
    if (!follower.originalValue) follower.originalValue = follower.value;

    // A follower that was itself an earlier phase's leader (a Phase 1 pattern leader that a proper
    // noun overwrites): free that leader's followers beyond the new span, or postProcess drops them.
    // Phase 1 writes no groupedWith, so prior leadership shows as a non-consumed source with a
    // non-null translation.
    const priorSource = follower.translationSource;
    if (follower.translated !== null && priorSource && !isConsumedSource(priorSource)) {
      const orphanedSource = consumedSource(priorSource);
      for (let k = startIndex + tokenSpan; k < tokens.length; k++) {
        if (tokens[k].translationSource !== orphanedSource) break; // orphans are consecutive
        tokens[k].translated = null;
        tokens[k].translationSource = null;
        tokens[k].isGrouped = false;
        tokens[k].groupLeader = null;
      }
    }

    follower.translated = null;
    follower.translationSource = followerSource;
    follower.isGrouped = true;
    follower.groupLeader = startIndex;
  }
}
