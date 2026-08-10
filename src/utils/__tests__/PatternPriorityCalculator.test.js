/**
 * Tests for Pattern Priority Calculator
 *
 * Tests priority calculation for pattern matching competition.
 * When multiple patterns match the same text span, priority determines the winner.
 *
 * NOTE: Updated 2026-01-16 for new priority formula:
 * - Variables: 8 points each (reduced from 10)
 * - Length: 3 points per token (increased from 1)
 * - Literal-first: 5 points (unchanged)
 */

import {
  calculatePatternPriority,
  calculatePriorityBreakdown,
  PRIORITY_WEIGHTS,
} from '../pattern/PatternPriorityCalculator.js';

describe('calculatePatternPriority', () => {
  describe('basic priority calculation', () => {
    test('should calculate priority for pattern with no variables', () => {
      const tokens = [{ type: 'literal' }, { type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 0 (variables) + 6 (length: 2*3) + 5 (literal-first) = 11
      expect(priority).toBe(11);
    });

    test('should calculate priority for pattern with one variable', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 8 (1 variable: 1*8) + 6 (length: 2*3) + 0 (no literal-first) = 14
      expect(priority).toBe(14);
    });

    test('should calculate priority for pattern with multiple variables', () => {
      const tokens = [{ type: 'variable' }, { type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 16 (2 variables: 2*8) + 9 (length: 3*3) + 0 (no literal-first) = 25
      expect(priority).toBe(25);
    });
  });

  describe('literal-first bonus', () => {
    test('should add bonus for patterns starting with literal', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 8 (1 variable: 1*8) + 6 (length: 2*3) + 5 (literal-first) = 19
      expect(priority).toBe(19);
    });

    test('should not add bonus for patterns starting with variable', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 8 (1 variable: 1*8) + 6 (length: 2*3) + 0 (no literal-first) = 14
      expect(priority).toBe(14);
    });
  });

  describe('pattern competition examples from docs', () => {
    test('pattern "在XY中" should have priority 33', () => {
      // Pattern: 在XY中 (2 variables, 4 tokens, literal-first)
      // Tokens: 在(literal), X(variable), Y(variable), 中(literal)
      const tokens = [
        { type: 'literal', value: '在' },
        { type: 'variable', name: 'X' },
        { type: 'variable', name: 'Y' },
        { type: 'literal', value: '中' },
      ];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 16 (2 variables: 2*8) + 12 (length: 4*3) + 5 (literal-first) = 33
      expect(priority).toBe(33);
    });

    test('pattern "在X眼中" should have priority 25', () => {
      // Pattern: 在X眼中 (1 variable, 4 tokens, literal-first)
      // Tokens: 在(literal), X(variable), 眼(literal), 中(literal)
      const tokens = [
        { type: 'literal', value: '在' },
        { type: 'variable', name: 'X' },
        { type: 'literal', value: '眼' },
        { type: 'literal', value: '中' },
      ];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 8 (1 variable: 1*8) + 12 (length: 4*3) + 5 (literal-first) = 25
      expect(priority).toBe(25);
    });
  });

  describe('edge cases', () => {
    test('should handle empty pattern', () => {
      const tokens = [];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      expect(priority).toBe(0);
    });

    test('should handle pattern with only one literal token', () => {
      const tokens = [{ type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 0 (variables) + 3 (length: 1*3) + 5 (literal-first) = 8
      expect(priority).toBe(8);
    });

    test('should handle pattern with only one variable token', () => {
      const tokens = [{ type: 'variable' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 8 (1 variable: 1*8) + 3 (length: 1*3) + 0 (no literal-first) = 11
      expect(priority).toBe(11);
    });

    test('should handle pattern with no first token (edge case)', () => {
      const tokens = [];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // tokens[0]?.type will be undefined, so no literal-first bonus
      expect(priority).toBe(0);
    });

    test('should handle very long pattern', () => {
      const tokens = new Array(20).fill({ type: 'literal' });
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 0 (variables) + 60 (length: 20*3) + 5 (literal-first) = 65
      expect(priority).toBe(65);
    });

    test('should handle many variables', () => {
      const tokens = new Array(10).fill({ type: 'variable' });
      const variables = new Array(10).fill({ name: 'X' });

      const priority = calculatePatternPriority(tokens, variables);

      // Expected: 80 (10 variables: 10*8) + 30 (length: 10*3) + 0 (no literal-first) = 110
      expect(priority).toBe(110);
    });

    test('should cap excessive variable count to prevent overflow', () => {
      const tokens = Array(150).fill({ type: 'variable' });
      const variables = Array(150).fill({ name: 'X' });

      const priority = calculatePatternPriority(tokens, variables);

      // Should cap variables at 100: (100 × 8) + (100 × 3) = 1100
      expect(priority).toBe(1100);
    });

    test('should cap excessive token count to prevent overflow', () => {
      const tokens = Array(150).fill({ type: 'literal' });
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables);

      // Should cap tokens at 100: (0 × 8) + (100 × 3) + 5 = 305
      expect(priority).toBe(305);
    });

    test('should return 0 for invalid tokens array (null)', () => {
      const priority = calculatePatternPriority(null, []);
      expect(priority).toBe(0);
    });

    test('should return 0 for invalid variables array (null)', () => {
      const tokens = [{ type: 'literal' }];
      const priority = calculatePatternPriority(tokens, null);
      expect(priority).toBe(0);
    });

    test('should return 0 for undefined inputs', () => {
      const priority = calculatePatternPriority(undefined, undefined);
      expect(priority).toBe(0);
    });

    test('should return 0 for tokens with missing type property', () => {
      const tokens = [{ type: 'literal' }, {}, { type: 'variable' }];
      const variables = [{ name: 'X' }];
      const priority = calculatePatternPriority(tokens, variables);
      expect(priority).toBe(0);
    });

    test('should return 0 for tokens with invalid type values', () => {
      const tokens = [{ type: 'literal' }, { type: 'invalid' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];
      const priority = calculatePatternPriority(tokens, variables);
      expect(priority).toBe(0);
    });

    test('should return 0 for non-array tokens input', () => {
      const tokens = { 0: { type: 'literal' }, length: 1 }; // Array-like but not Array
      const variables = [];
      const priority = calculatePatternPriority(tokens, variables);
      expect(priority).toBe(0);
    });
  });
});

describe('calculatePriorityBreakdown', () => {
  test('should return breakdown for simple pattern', () => {
    const tokens = [{ type: 'literal' }, { type: 'literal' }];
    const variables = [];

    const breakdown = calculatePriorityBreakdown(tokens, variables);

    expect(breakdown).toEqual({
      variableScore: 0,
      lengthScore: 6, // 2*3
      literalFirstBonus: 5,
      totalPriority: 11, // 0 + 6 + 5
    });
  });

  test('should return breakdown for pattern with variables', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }];
    const variables = [{ name: 'X' }];

    const breakdown = calculatePriorityBreakdown(tokens, variables);

    expect(breakdown).toEqual({
      variableScore: 8, // 1*8
      lengthScore: 6, // 2*3
      literalFirstBonus: 5,
      totalPriority: 19, // 8 + 6 + 5
    });
  });

  test('should return breakdown for complex pattern', () => {
    const tokens = [
      { type: 'literal' },
      { type: 'variable' },
      { type: 'variable' },
      { type: 'literal' },
    ];
    const variables = [{ name: 'X' }, { name: 'Y' }];

    const breakdown = calculatePriorityBreakdown(tokens, variables);

    expect(breakdown).toEqual({
      variableScore: 16, // 2*8
      lengthScore: 12, // 4*3
      literalFirstBonus: 5,
      totalPriority: 33, // 16 + 12 + 5
    });
  });

  test('totalPriority should match calculatePatternPriority result', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
    const variables = [{ name: 'X' }];

    const priority = calculatePatternPriority(tokens, variables);
    const breakdown = calculatePriorityBreakdown(tokens, variables);

    expect(breakdown.totalPriority).toBe(priority);
  });
});

describe('PRIORITY_WEIGHTS constants', () => {
  test('should export priority weight constants', () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      VARIABLE: 8,
      LENGTH: 3,
      LITERAL_FIRST: 5,
    });
  });

  test('constants should match actual calculation weights', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }];
    const variables = [{ name: 'X' }];

    const breakdown = calculatePriorityBreakdown(tokens, variables);

    // Verify weights match
    expect(breakdown.variableScore / variables.length).toBe(PRIORITY_WEIGHTS.VARIABLE);
    expect(breakdown.lengthScore / tokens.length).toBe(PRIORITY_WEIGHTS.LENGTH);
    expect(breakdown.literalFirstBonus).toBe(PRIORITY_WEIGHTS.LITERAL_FIRST);
  });
});
