import { logger } from '../logger.js';

/**
 * Pattern Priority Calculator
 *
 * Pure utility for calculating pattern matching priorities based on pattern characteristics.
 * Higher priority patterns win when multiple patterns match the same text span.
 *
 * Extracted from: SemanticPatternProcessor.js (lines 319-339)
 * Extraction Date: January 5, 2026
 * Reason: Pure function with zero dependencies - safe for extraction and testing
 *
 * Priority Calculation Formula (CURRENT - Updated 2026-01-16):
 * ═══════════════════════════════════════════════════════════════════
 * priority = (variables × 8) + (length × 3) + (literal-first ? 5 : 0)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Components:
 * - Base priority: 0
 * - Variables: +8 per variable (more variables = more specific pattern)
 * - Length: +3 per token (longer patterns = more context)
 * - Literal-first: +5 if pattern starts with literal (more efficient matching)
 *
 * Weight Rationale (PRIORITY FIX 2026-01-16):
 * - Variable weight: REDUCED from +10 to +8
 * - Length weight: INCREASED from +1 to +3
 * - Why: Longer patterns provide more context and should be prioritized over shorter
 *   patterns with more variables. Prevents generic short patterns from overriding
 *   specific long patterns.
 *
 * CRITICAL - LENGTH-FIRST Selection (Code Review 2026-01-27):
 * ═══════════════════════════════════════════════════════════════════
 * Both Rust (matcher.rs:find_best_pattern_match) and JavaScript
 * (TranslationEngine.js:resolveGlobalConflicts) use LENGTH-FIRST selection:
 *
 * Selection Algorithm:
 * 1. FIRST: Prefer longer matches (better context coverage)
 * 2. TIEBREAKER: Use calculated priority when lengths are equal
 *
 * This is intentional - match length prevents substring collisions
 * (e.g., "mà" matching inside "màu trắng"). Priority calculation
 * only matters for same-length pattern competition.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Example Priority Calculations:
 * ═══════════════════════════════════════════════════════════════════
 *
 * Example 1: Pattern "在XY中" (2 variables, 3 tokens)
 * ───────────────────────────────────────────────────────────────────
 * - Variables: 2 × 8 = 16
 * - Length: 3 × 3 = 9
 * - Literal-first: 0 (starts with literal "在", but formula checks token type)
 * - Total: 16 + 9 = 25
 *
 * Example 2: Pattern "在X眼中" (1 variable, 3 tokens, literal-first)
 * ───────────────────────────────────────────────────────────────────
 * - Variables: 1 × 8 = 8
 * - Length: 3 × 3 = 9
 * - Literal-first: +5 (first token is literal "在")
 * - Total: 8 + 9 + 5 = 22
 *
 * NOTE: Both patterns have same length (3 tokens); whichever pattern is
 * more specific (more variables, or literal-first) wins the tiebreak.
 * If lengths differed, longer pattern would win regardless of priority.
 *
 * Usage:
 *
 * ```typescript
 * import { calculatePatternPriority } from './PatternPriorityCalculator.js';
 *
 * const tokens: PatternToken[] = [
 *   { type: 'literal', value: '在' },
 *   { type: 'variable', name: 'X' },
 *   { type: 'literal', value: '眼中' }
 * ];
 *
 * const variables: PatternVariable[] = [{ name: 'X' }];
 * const priority = calculatePatternPriority(tokens, variables);
 * console.log(priority); // 22 (8 + 9 + 5)
 * ```
 */

/**
 * Pattern token types
 */
type PatternTokenType = 'literal' | 'variable';

/**
 * Pattern token structure
 */
export interface PatternToken {
  /** Token type: 'literal' or 'variable' */
  type: PatternTokenType;

  /** Token value (for literals) */
  value?: string;

  /** Variable name (for variables) */
  name?: string;
}

/**
 * Pattern variable definition
 */
export interface PatternVariable {
  /** Variable name */
  name: string;

  /** Additional variable metadata (optional) */
  [key: string]: unknown;
}

/**
 * Priority breakdown result
 */
export interface PriorityBreakdown {
  /** Score from variables (variableCount × 8) */
  variableScore: number;

  /** Score from pattern length (tokenCount × 3) */
  lengthScore: number;

  /** Bonus for literal-first patterns (+5 or 0) */
  literalFirstBonus: number;

  /** Total calculated priority */
  totalPriority: number;
}

/**
 * Priority scoring weights — single source of truth for the calculation.
 * All weight values must be changed here only; calculatePatternPriority and
 * calculatePriorityBreakdown both reference these constants directly.
 */
export const PRIORITY_WEIGHTS = {
  VARIABLE: 8, // Points per variable in pattern (reduced from 10)
  LENGTH: 3, // Points per token in pattern (increased from 1)
  LITERAL_FIRST: 5, // Bonus for patterns starting with literal
} as const;

/**
 * Calculate pattern priority based on complexity and usefulness
 *
 * @param tokens - Pattern tokens (must have 'type' property: 'literal' or 'variable')
 * @param variables - Pattern variables (variable definitions)
 * @returns Priority score (higher = more important)
 *
 * @example
 * // Simple pattern with no variables
 * const priority1 = calculatePatternPriority(
 *   [{ type: 'literal' }, { type: 'literal' }],
 *   []
 * );
 * // Result: 11 (0 variables + 6 length + 5 literal-first)
 *
 * @example
 * // Pattern with variables
 * const priority2 = calculatePatternPriority(
 *   [{ type: 'variable' }, { type: 'literal' }],
 *   [{ name: 'X' }]
 * );
 * // Result: 14 (8 variables + 6 length)
 */
export function calculatePatternPriority(
  tokens: PatternToken[],
  variables: PatternVariable[]
): number {
  // MEDIUM-2 FIX: Comprehensive input validation
  const MAX_SAFE_COUNT = 100; // Reasonable limit for pattern complexity
  const VALID_TOKEN_TYPES: PatternTokenType[] = ['literal', 'variable'];

  // Validate tokens array
  if (!Array.isArray(tokens)) {
    logger.warn('⚠️ Invalid tokens array (not an Array), using default priority 0');
    return 0;
  }

  // Validate variables array
  if (!Array.isArray(variables)) {
    logger.warn('⚠️ Invalid variables array (not an Array), using default priority 0');
    return 0;
  }

  // MEDIUM-2 FIX: Validate token structure (required properties, valid types)
  const hasInvalidTokens = tokens.some((token, index) => {
    // Check token exists and is an object
    if (!token || typeof token !== 'object') {
      logger.warn(`⚠️ Token ${index} is missing or not an object, using default priority 0`);
      return true;
    }

    // Check token has required 'type' property
    if (!token.type) {
      logger.warn(`⚠️ Token ${index} missing 'type' property, using default priority 0`);
      return true;
    }

    // Check token type is valid
    if (!VALID_TOKEN_TYPES.includes(token.type)) {
      logger.warn(
        `⚠️ Token ${index} has invalid type '${token.type}' (expected 'literal' or 'variable'), using default priority 0`
      );
      return true;
    }

    return false;
  });

  if (hasInvalidTokens) {
    return 0;
  }

  // Cap excessive values to prevent overflow and warn about malformed patterns
  const validatedVariableCount =
    variables.length > MAX_SAFE_COUNT ? MAX_SAFE_COUNT : variables.length;
  const validatedTokenCount = tokens.length > MAX_SAFE_COUNT ? MAX_SAFE_COUNT : tokens.length;

  if (variables.length > MAX_SAFE_COUNT) {
    logger.warn(
      `⚠️ Excessive variables (${variables.length}) in pattern, capping at ${MAX_SAFE_COUNT}`
    );
  }

  if (tokens.length > MAX_SAFE_COUNT) {
    logger.warn(`⚠️ Excessive tokens (${tokens.length}) in pattern, capping at ${MAX_SAFE_COUNT}`);
  }

  let priority = 0;

  // More variables = higher priority (more specific patterns)
  priority += validatedVariableCount * PRIORITY_WEIGHTS.VARIABLE;

  // Longer patterns = higher priority (more context)
  priority += validatedTokenCount * PRIORITY_WEIGHTS.LENGTH;

  // Literal-starting patterns = higher priority (more efficient)
  if (tokens[0]?.type === 'literal') {
    priority += PRIORITY_WEIGHTS.LITERAL_FIRST;
  }

  return priority;
}

/**
 * Calculate priority factors breakdown (for debugging/analysis)
 *
 * Returns detailed breakdown of how priority was calculated.
 * Useful for understanding why one pattern won over another.
 *
 * @param tokens - Pattern tokens
 * @param variables - Pattern variables
 * @returns Priority breakdown with individual factors
 *
 * @internal Exported for unit tests only — not part of the public API surface.
 * @example
 * const breakdown = calculatePriorityBreakdown(tokens, variables);
 * console.log(breakdown);
 * // {
 * //   variableScore: 16,
 * //   lengthScore: 9,
 * //   literalFirstBonus: 5,
 * //   totalPriority: 30
 * // }
 */
export function calculatePriorityBreakdown(
  tokens: PatternToken[],
  variables: PatternVariable[]
): PriorityBreakdown {
  const variableScore = variables.length * PRIORITY_WEIGHTS.VARIABLE;
  const lengthScore = tokens.length * PRIORITY_WEIGHTS.LENGTH;
  const literalFirstBonus = tokens[0]?.type === 'literal' ? PRIORITY_WEIGHTS.LITERAL_FIRST : 0;

  return {
    variableScore,
    lengthScore,
    literalFirstBonus,
    totalPriority: variableScore + lengthScore + literalFirstBonus,
  };
}
