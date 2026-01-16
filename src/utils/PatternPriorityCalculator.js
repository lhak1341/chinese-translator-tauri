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
 * Priority Calculation Formula:
 * - Base priority: 0
 * - Variables: +8 per variable (more variables = more specific pattern)
 * - Length: +3 per token (longer patterns = more context, increased from +1)
 * - Literal-first: +5 if pattern starts with literal (more efficient matching)
 * - Low priority flag: -12 (allows same-length patterns to compete)
 *
 * PRIORITY FIX (2026-01-16):
 * Increased length weight from +1 to +3, reduced variable weight from +10 to +8.
 * Why: Longer patterns provide more context and should be prioritized over shorter
 * patterns with more variables. Prevents generic short patterns from overriding
 * specific long patterns.
 *
 * Example Priority Calculations:
 *
 * 1. Pattern "在XY中" (2 variables, 3 tokens):
 *    - Variables: 2 * 8 = 16
 *    - Length: 3 * 3 = 9
 *    - Literal-first: No (starts with variable)
 *    - Total: 16 + 9 = 25 (becomes 13 with lowPriority flag)
 *
 * 2. Pattern "在X眼中" (1 variable, 3 tokens):
 *    - Variables: 1 * 8 = 8
 *    - Length: 3 * 3 = 9
 *    - Literal-first: Yes (starts with "在")
 *    - Total: 8 + 9 + 5 = 22
 *
 * With lowPriority=true on first pattern, pattern 2 wins (22 > 13).
 *
 * Usage:
 *
 * ```javascript
 * import { calculatePatternPriority } from './PatternPriorityCalculator.js';
 *
 * const tokens = [
 *   { type: 'literal', value: '在' },
 *   { type: 'variable', name: 'X' },
 *   { type: 'literal', value: '眼中' }
 * ];
 *
 * const variables = [{ name: 'X' }];
 * const priority = calculatePatternPriority(tokens, variables, false);
 * console.log(priority); // 18 (10 + 3 + 5)
 * ```
 */

/**
 * Calculate pattern priority based on complexity and usefulness
 *
 * @param {Array} tokens - Pattern tokens (must have 'type' property: 'literal' or 'variable')
 * @param {Array} variables - Pattern variables (variable definitions)
 * @param {boolean} lowPriority - Whether this is a low priority pattern (default: false)
 * @returns {number} Priority score (higher = more important)
 *
 * @example
 * // Simple pattern with no variables
 * const priority1 = calculatePatternPriority(
 *   [{ type: 'literal' }, { type: 'literal' }],
 *   [],
 *   false
 * );
 * // Result: 7 (0 variables + 2 length + 5 literal-first)
 *
 * @example
 * // Pattern with variables
 * const priority2 = calculatePatternPriority(
 *   [{ type: 'variable' }, { type: 'literal' }],
 *   [{ name: 'X' }],
 *   false
 * );
 * // Result: 12 (10 variables + 2 length)
 *
 * @example
 * // Low priority pattern (for conflict resolution)
 * const priority3 = calculatePatternPriority(
 *   [{ type: 'literal' }, { type: 'variable' }],
 *   [{ name: 'X' }],
 *   true
 * );
 * // Result: 5 (10 variables + 2 length + 5 literal-first - 12 low priority penalty)
 */
export function calculatePatternPriority(tokens, variables, lowPriority = false) {
  let priority = 0;

  // More variables = higher priority (more specific patterns)
  // Weight: 8 (reduced from 10 to balance with pattern length)
  priority += variables.length * 8;

  // Longer patterns = higher priority (more context)
  // Weight: 3 (increased from 1 to prioritize context over variables)
  priority += tokens.length * 3;

  // Literal-starting patterns = higher priority (more efficient)
  if (tokens[0]?.type === 'literal') {
    priority += 5;
  }

  // Low priority flag only affects tiebreakers (same length patterns)
  if (lowPriority) {
    priority -= 12; // Significant penalty to allow same-length patterns to compete
  }

  return priority;
}

/**
 * Priority scoring weights (for documentation)
 * These constants are NOT used in the calculation - they're for reference only
 */
export const PRIORITY_WEIGHTS = {
  VARIABLE: 8, // Points per variable in pattern (reduced from 10)
  LENGTH: 3, // Points per token in pattern (increased from 1)
  LITERAL_FIRST: 5, // Bonus for patterns starting with literal
  LOW_PRIORITY_PENALTY: -12, // Penalty for low priority flag
};

/**
 * Calculate priority factors breakdown (for debugging/analysis)
 *
 * Returns detailed breakdown of how priority was calculated.
 * Useful for understanding why one pattern won over another.
 *
 * @param {Array} tokens - Pattern tokens
 * @param {Array} variables - Pattern variables
 * @param {boolean} lowPriority - Whether this is a low priority pattern
 * @returns {Object} Priority breakdown with individual factors
 *
 * @example
 * const breakdown = calculatePriorityBreakdown(tokens, variables, false);
 * console.log(breakdown);
 * // {
 * //   variableScore: 20,
 * //   lengthScore: 3,
 * //   literalFirstBonus: 5,
 * //   lowPriorityPenalty: 0,
 * //   totalPriority: 28
 * // }
 */
export function calculatePriorityBreakdown(tokens, variables, lowPriority = false) {
  const variableScore = variables.length * 8; // Updated weight: 8 (was 10)
  const lengthScore = tokens.length * 3; // Updated weight: 3 (was 1)
  const literalFirstBonus = tokens[0]?.type === 'literal' ? 5 : 0;
  const lowPriorityPenalty = lowPriority ? -12 : 0;

  return {
    variableScore,
    lengthScore,
    literalFirstBonus,
    lowPriorityPenalty,
    totalPriority: variableScore + lengthScore + literalFirstBonus + lowPriorityPenalty,
  };
}
