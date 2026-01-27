/**
 * Tests for PatternPriorityCalculator
 *
 * Tests priority calculation formula:
 * priority = (variables × 8) + (length × 3) + (literal-first ? 5 : 0) - (lowPriority ? 12 : 0)
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePatternPriority,
  calculatePriorityBreakdown,
  PRIORITY_WEIGHTS,
} from '../utils/PatternPriorityCalculator.js';

describe('PatternPriorityCalculator', () => {
  describe('calculatePatternPriority', () => {
    it('should calculate base priority for simple literal pattern', () => {
      const tokens = [{ type: 'literal' }, { type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (0 variables × 8) + (2 tokens × 3) + (literal-first 5) = 11
      expect(priority).toBe(11);
    });

    it('should add variable weight correctly', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (1 variable × 8) + (2 tokens × 3) + (no literal-first) = 14
      expect(priority).toBe(14);
    });

    it('should add literal-first bonus', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (1 variable × 8) + (2 tokens × 3) + (literal-first 5) = 19
      expect(priority).toBe(19);
    });

    it('should prioritize longer patterns over shorter with same variables', () => {
      const shortPattern = [{ type: 'literal' }, { type: 'variable' }];
      const longPattern = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const shortPriority = calculatePatternPriority(shortPattern, variables);
      const longPriority = calculatePatternPriority(longPattern, variables);

      // Short: (1 × 8) + (2 × 3) + 5 = 19
      // Long: (1 × 8) + (3 × 3) + 5 = 22
      expect(longPriority).toBeGreaterThan(shortPriority);
      expect(longPriority - shortPriority).toBe(3); // Length weight difference
    });

    it('should apply low priority penalty correctly', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'variable' }];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const normalPriority = calculatePatternPriority(tokens, variables, false);
      const lowPriority = calculatePatternPriority(tokens, variables, true);

      // Normal: (2 × 8) + (3 × 3) + 5 = 30
      // Low: 30 - 12 = 18
      expect(normalPriority).toBe(30);
      expect(lowPriority).toBe(18);
      expect(normalPriority - lowPriority).toBe(12); // Low priority penalty
    });

    it('should handle pattern with multiple variables', () => {
      const tokens = [
        { type: 'variable' },
        { type: 'literal' },
        { type: 'variable' },
        { type: 'literal' },
      ];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (2 variables × 8) + (4 tokens × 3) + (no literal-first) = 28
      expect(priority).toBe(28);
    });

    it('should handle empty pattern (edge case)', () => {
      const tokens = [];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (0 × 8) + (0 × 3) + (no literal-first) = 0
      expect(priority).toBe(0);
    });

    it('should return 0 for invalid tokens array', () => {
      const priority = calculatePatternPriority(null, []);

      expect(priority).toBe(0);
    });

    it('should return 0 for invalid variables array', () => {
      const tokens = [{ type: 'literal' }];
      const priority = calculatePatternPriority(tokens, null);

      expect(priority).toBe(0);
    });

    it('should cap excessive variable count to prevent overflow', () => {
      const tokens = Array(150).fill({ type: 'variable' });
      const variables = Array(150).fill({ name: 'X' });

      const priority = calculatePatternPriority(tokens, variables);

      // Should cap variables at 100: (100 × 8) + (100 × 3) = 1100
      expect(priority).toBe(1100);
    });

    it('should cap excessive token count to prevent overflow', () => {
      const tokens = Array(150).fill({ type: 'literal' });
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Should cap tokens at 100: (0 × 8) + (100 × 3) + 5 = 305
      expect(priority).toBe(305);
    });

    it('should handle pattern from real example: "在XY中"', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'variable' }];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (2 × 8) + (3 × 3) + 5 = 30
      expect(priority).toBe(30);
    });

    it('should handle pattern from real example: "在X眼中"', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (1 × 8) + (3 × 3) + 5 = 22
      expect(priority).toBe(22);
    });

    it('should allow "在X眼中" to win over "在XY中" with lowPriority flag', () => {
      const genericPattern = [{ type: 'literal' }, { type: 'variable' }, { type: 'variable' }];
      const specificPattern = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
      const genericVars = [{ name: 'X' }, { name: 'Y' }];
      const specificVars = [{ name: 'X' }];

      const genericPriority = calculatePatternPriority(genericPattern, genericVars, true);
      const specificPriority = calculatePatternPriority(specificPattern, specificVars, false);

      // Generic with lowPriority: (2 × 8) + (3 × 3) + 5 - 12 = 18
      // Specific: (1 × 8) + (3 × 3) + 5 = 22
      expect(specificPriority).toBeGreaterThan(genericPriority);
    });
  });

  describe('calculatePriorityBreakdown', () => {
    it('should return detailed breakdown of priority calculation', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const breakdown = calculatePriorityBreakdown(tokens, variables, false);

      expect(breakdown).toEqual({
        variableScore: 8, // 1 × 8
        lengthScore: 9, // 3 × 3
        literalFirstBonus: 5,
        lowPriorityPenalty: 0,
        totalPriority: 22,
      });
    });

    it('should include low priority penalty in breakdown', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      const breakdown = calculatePriorityBreakdown(tokens, variables, true);

      expect(breakdown).toEqual({
        variableScore: 8, // 1 × 8
        lengthScore: 6, // 2 × 3
        literalFirstBonus: 5,
        lowPriorityPenalty: -12,
        totalPriority: 7, // 8 + 6 + 5 - 12
      });
    });

    it('should match calculatePatternPriority result', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }, { type: 'variable' }];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables, true);
      const breakdown = calculatePriorityBreakdown(tokens, variables, true);

      expect(breakdown.totalPriority).toBe(priority);
    });
  });

  describe('PRIORITY_WEIGHTS', () => {
    it('should export weight constants for documentation', () => {
      expect(PRIORITY_WEIGHTS).toEqual({
        VARIABLE: 8,
        LENGTH: 3,
        LITERAL_FIRST: 5,
        LOW_PRIORITY_PENALTY: -12,
      });
    });

    it('should match actual calculation weights', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);
      const expected =
        variables.length * PRIORITY_WEIGHTS.VARIABLE +
        tokens.length * PRIORITY_WEIGHTS.LENGTH +
        PRIORITY_WEIGHTS.LITERAL_FIRST;

      expect(priority).toBe(expected);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tokens with missing type property', () => {
      const tokens = [{ type: 'literal' }, {}, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      // Should not throw, returns 0 due to validation
      const priority = calculatePatternPriority(tokens, variables);

      expect(priority).toBe(0);
    });

    it('should handle tokens with invalid type values', () => {
      const tokens = [{ type: 'literal' }, { type: 'invalid' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      // Should not throw, returns 0 due to validation
      const priority = calculatePatternPriority(tokens, variables);

      expect(priority).toBe(0);
    });

    it('should handle non-array tokens input', () => {
      const tokens = { 0: { type: 'literal' }, length: 1 }; // Array-like but not Array
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      expect(priority).toBe(0);
    });

    it('should handle undefined inputs gracefully', () => {
      const priority = calculatePatternPriority(undefined, undefined);

      expect(priority).toBe(0);
    });

    it('should not add literal-first bonus if first token is not literal', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (1 × 8) + (2 × 3) + (no literal-first) = 14
      expect(priority).toBe(14);
    });

    it('should handle single token pattern', () => {
      const tokens = [{ type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Formula: (0 × 8) + (1 × 3) + 5 = 8
      expect(priority).toBe(8);
    });
  });
});
