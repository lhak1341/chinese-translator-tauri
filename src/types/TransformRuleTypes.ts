import type { SemanticType } from '../constants/SemanticTypes';

export type TransformRuleMatchKind = 'suffix' | 'prefix';

/** Contract length cap for `TransformRule.key` — 1 to this many Chinese characters. */
export const MAX_TRANSFORM_RULE_KEY_LENGTH = 4;

/**
 * A user-authored rule that auto-transforms a dictionary entry's rough-gloss
 * Translation guess and stamps its semanticType, keyed off leading/trailing
 * Chinese characters of the entry's Source text. See CONTEXT.md's
 * "Transform Rule" glossary entry for the full contract.
 */
export interface TransformRule {
  id: string;
  matchKind: TransformRuleMatchKind;
  key: string; // 1-4 Chinese characters
  charCount?: number; // optional exact total-Source-length constraint
  moveWords: number;
  moveReplacement?: string; // if set, replaces the moved words instead of relocating them
  capitalizeExceptN: number;
  semanticType: SemanticType;
  enabled: boolean;
  label?: string;
}
