/**
 * Tests for Pattern Priority Calculator
 *
 * Tests priority calculation for pattern matching competition.
 * When multiple patterns match the same text span, priority determines the winner.
 */

import {
  calculatePatternPriority,
  calculatePriorityBreakdown,
  PRIORITY_WEIGHTS,
} from '../PatternPriorityCalculator.js';

describe('calculatePatternPriority', () => {
  describe('basic priority calculation', () => {
    test('should calculate priority for pattern with no variables', () => {
      const tokens = [{ type: 'literal' }, { type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 0 (variables) + 2 (length) + 5 (literal-first) = 7
      expect(priority).toBe(7);
    });

    test('should calculate priority for pattern with one variable', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 10 (1 variable) + 2 (length) + 0 (no literal-first) = 12
      expect(priority).toBe(12);
    });

    test('should calculate priority for pattern with multiple variables', () => {
      const tokens = [{ type: 'variable' }, { type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 20 (2 variables) + 3 (length) + 0 (no literal-first) = 23
      expect(priority).toBe(23);
    });
  });

  describe('literal-first bonus', () => {
    test('should add bonus for patterns starting with literal', () => {
      const tokens = [{ type: 'literal' }, { type: 'variable' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 10 (1 variable) + 2 (length) + 5 (literal-first) = 17
      expect(priority).toBe(17);
    });

    test('should not add bonus for patterns starting with variable', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 10 (1 variable) + 2 (length) + 0 (no literal-first) = 12
      expect(priority).toBe(12);
    });
  });

  describe('low priority flag', () => {
    test('should apply penalty with lowPriority flag', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, true);

      // Expected: 10 (1 variable) + 2 (length) + 0 (no literal-first) - 12 (penalty) = 0
      expect(priority).toBe(0);
    });

    test('should not apply penalty without lowPriority flag', () => {
      const tokens = [{ type: 'variable' }, { type: 'literal' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      expect(priority).toBe(12); // No penalty
    });

    test('lowPriority flag can result in negative priority', () => {
      const tokens = [{ type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables, true);

      // Expected: 0 (variables) + 1 (length) + 5 (literal-first) - 12 (penalty) = -6
      expect(priority).toBe(-6);
    });
  });

  describe('pattern competition examples from docs', () => {
    test('pattern "在XY中" should have priority 29', () => {
      // Pattern: 在XY中 (2 variables, 4 tokens, literal-first)
      // Tokens: 在(literal), X(variable), Y(variable), 中(literal)
      const tokens = [
        { type: 'literal', value: '在' },
        { type: 'variable', name: 'X' },
        { type: 'variable', name: 'Y' },
        { type: 'literal', value: '中' },
      ];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 20 (2 variables) + 4 (length) + 5 (literal-first) = 29
      expect(priority).toBe(29);
    });

    test('pattern "在XY中" with lowPriority should have priority 17', () => {
      // Same pattern but with lowPriority flag
      const tokens = [
        { type: 'literal', value: '在' },
        { type: 'variable', name: 'X' },
        { type: 'variable', name: 'Y' },
        { type: 'literal', value: '中' },
      ];
      const variables = [{ name: 'X' }, { name: 'Y' }];

      const priority = calculatePatternPriority(tokens, variables, true);

      // Expected: 29 - 12 (penalty) = 17
      expect(priority).toBe(17);
    });

    test('pattern "在X眼中" should have priority 19', () => {
      // Pattern: 在X眼中 (1 variable, 4 tokens, literal-first)
      // Tokens: 在(literal), X(variable), 眼(literal), 中(literal)
      const tokens = [
        { type: 'literal', value: '在' },
        { type: 'variable', name: 'X' },
        { type: 'literal', value: '眼' },
        { type: 'literal', value: '中' },
      ];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 10 (1 variable) + 4 (length) + 5 (literal-first) = 19
      expect(priority).toBe(19);
    });

    test('"在X眼中" should win over "在XY中" with lowPriority', () => {
      // Pattern 1: "在XY中" with lowPriority
      const pattern1Tokens = [
        { type: 'literal' },
        { type: 'variable' },
        { type: 'variable' },
        { type: 'literal' },
      ];
      const pattern1Vars = [{ name: 'X' }, { name: 'Y' }];
      const priority1 = calculatePatternPriority(pattern1Tokens, pattern1Vars, true);

      // Pattern 2: "在X眼中"
      const pattern2Tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
      const pattern2Vars = [{ name: 'X' }];
      const priority2 = calculatePatternPriority(pattern2Tokens, pattern2Vars, false);

      expect(priority2).toBeGreaterThan(priority1); // Pattern 2 wins
    });
  });

  describe('edge cases', () => {
    test('should handle empty pattern', () => {
      const tokens = [];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables, false);

      expect(priority).toBe(0);
    });

    test('should handle pattern with only one literal token', () => {
      const tokens = [{ type: 'literal' }];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 0 (variables) + 1 (length) + 5 (literal-first) = 6
      expect(priority).toBe(6);
    });

    test('should handle pattern with only one variable token', () => {
      const tokens = [{ type: 'variable' }];
      const variables = [{ name: 'X' }];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 10 (1 variable) + 1 (length) + 0 (no literal-first) = 11
      expect(priority).toBe(11);
    });

    test('should handle pattern with no first token (edge case)', () => {
      const tokens = [];
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables, false);

      // tokens[0]?.type will be undefined, so no literal-first bonus
      expect(priority).toBe(0);
    });

    test('should handle very long pattern', () => {
      const tokens = new Array(20).fill({ type: 'literal' });
      const variables = [];

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 0 (variables) + 20 (length) + 5 (literal-first) = 25
      expect(priority).toBe(25);
    });

    test('should handle many variables', () => {
      const tokens = new Array(10).fill({ type: 'variable' });
      const variables = new Array(10).fill({ name: 'X' });

      const priority = calculatePatternPriority(tokens, variables, false);

      // Expected: 100 (10 variables) + 10 (length) + 0 (no literal-first) = 110
      expect(priority).toBe(110);
    });
  });
});

describe('calculatePriorityBreakdown', () => {
  test('should return breakdown for simple pattern', () => {
    const tokens = [{ type: 'literal' }, { type: 'literal' }];
    const variables = [];

    const breakdown = calculatePriorityBreakdown(tokens, variables, false);

    expect(breakdown).toEqual({
      variableScore: 0,
      lengthScore: 2,
      literalFirstBonus: 5,
      lowPriorityPenalty: 0,
      totalPriority: 7,
    });
  });

  test('should return breakdown for pattern with variables', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }];
    const variables = [{ name: 'X' }];

    const breakdown = calculatePriorityBreakdown(tokens, variables, false);

    expect(breakdown).toEqual({
      variableScore: 10,
      lengthScore: 2,
      literalFirstBonus: 5,
      lowPriorityPenalty: 0,
      totalPriority: 17,
    });
  });

  test('should return breakdown with lowPriority penalty', () => {
    const tokens = [{ type: 'variable' }, { type: 'literal' }];
    const variables = [{ name: 'X' }];

    const breakdown = calculatePriorityBreakdown(tokens, variables, true);

    expect(breakdown).toEqual({
      variableScore: 10,
      lengthScore: 2,
      literalFirstBonus: 0,
      lowPriorityPenalty: -12,
      totalPriority: 0,
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

    const breakdown = calculatePriorityBreakdown(tokens, variables, false);

    expect(breakdown).toEqual({
      variableScore: 20,
      lengthScore: 4,
      literalFirstBonus: 5,
      lowPriorityPenalty: 0,
      totalPriority: 29,
    });
  });

  test('totalPriority should match calculatePatternPriority result', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }, { type: 'literal' }];
    const variables = [{ name: 'X' }];

    const priority = calculatePatternPriority(tokens, variables, false);
    const breakdown = calculatePriorityBreakdown(tokens, variables, false);

    expect(breakdown.totalPriority).toBe(priority);
  });

  test('totalPriority should match with lowPriority flag', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }];
    const variables = [{ name: 'X' }];

    const priority = calculatePatternPriority(tokens, variables, true);
    const breakdown = calculatePriorityBreakdown(tokens, variables, true);

    expect(breakdown.totalPriority).toBe(priority);
  });
});

describe('PRIORITY_WEIGHTS constants', () => {
  test('should export priority weight constants', () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      VARIABLE: 10,
      LENGTH: 1,
      LITERAL_FIRST: 5,
      LOW_PRIORITY_PENALTY: -12,
    });
  });

  test('constants should match actual calculation weights', () => {
    const tokens = [{ type: 'literal' }, { type: 'variable' }];
    const variables = [{ name: 'X' }];

    const breakdown = calculatePriorityBreakdown(tokens, variables, false);

    // Verify weights match
    expect(breakdown.variableScore / variables.length).toBe(PRIORITY_WEIGHTS.VARIABLE);
    expect(breakdown.lengthScore / tokens.length).toBe(PRIORITY_WEIGHTS.LENGTH);
    expect(breakdown.literalFirstBonus).toBe(PRIORITY_WEIGHTS.LITERAL_FIRST);
  });
});
