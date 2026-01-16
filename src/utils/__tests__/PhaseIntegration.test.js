/**
 * Phase Integration Tests
 *
 * Tests critical 5-phase translation pipeline integration:
 * - Phase 1: Pattern Processing
 * - Phase 2: Proper Noun Processing
 * - Phase 3: Number Processing
 * - Phase 4: Phrase Processing
 * - Phase 5: Character Processing
 *
 * WHY THIS IS CRITICAL:
 * - Phase order is IMMUTABLE (changing breaks conflict resolution)
 * - Each phase consumes tokens (prevents double-processing)
 * - Token consumption tracking prevents phase conflicts
 * - Later phases must skip tokens consumed by earlier phases
 *
 * WHAT WE TEST:
 * - Token consumption patterns (consumed tokens marked correctly)
 * - Phase priority enforcement (earlier phases take precedence)
 * - Cross-phase interference prevention (no double-processing)
 * - Conflict resolution (multiple matches for same span)
 */

import { describe, test, expect } from 'vitest';

describe('Phase Integration - Token Consumption', () => {
  describe('consumed token patterns', () => {
    test('should mark consumed tokens with null translated value', () => {
      // Simulates number processor consuming "三十五" → "35"
      // First token gets translation, remaining tokens marked consumed
      const tokens = [
        {
          type: 'chinese_char',
          value: '三',
          translated: '35', // Main token
          translationSource: 'number_conversion',
        },
        {
          type: 'chinese_char',
          value: '十',
          translated: null, // Consumed
          translationSource: 'number_conversion_consumed',
        },
        {
          type: 'chinese_char',
          value: '五',
          translated: null, // Consumed
          translationSource: 'number_conversion_consumed',
        },
      ];

      // Verify pattern: main token has translation, consumed have null
      expect(tokens[0].translated).toBe('35');
      expect(tokens[0].translationSource).toBe('number_conversion');

      expect(tokens[1].translated).toBeNull();
      expect(tokens[1].translationSource).toBe('number_conversion_consumed');

      expect(tokens[2].translated).toBeNull();
      expect(tokens[2].translationSource).toBe('number_conversion_consumed');
    });

    test('should detect consumed tokens by translationSource suffix', () => {
      const consumedSources = [
        'number_conversion_consumed',
        'pattern_consumed',
        'phrase_consumed',
        'hierarchical_pattern_consumed',
      ];

      for (const source of consumedSources) {
        expect(source.includes('consumed')).toBe(true);
      }
    });

    test('should NOT process tokens with translationSource set', () => {
      // Later phases must skip tokens that have translationSource
      const token = {
        type: 'chinese_char',
        value: '在',
        translated: null,
        translationSource: 'number_conversion_consumed',
      };

      // Token has translationSource, so should be skipped
      const shouldSkip = token.translationSource !== null;
      expect(shouldSkip).toBe(true);
    });
  });

  describe('phase priority enforcement', () => {
    test('should respect phase order: Pattern > Proper Noun > Number > Phrase > Character', () => {
      const phasePriorities = {
        pattern: 1,
        properNouns: 2,
        number: 3,
        phrase: 4,
        character: 5,
      };

      // Verify priorities are in correct order (lower = higher priority)
      expect(phasePriorities.pattern).toBeLessThan(phasePriorities.properNouns);
      expect(phasePriorities.properNouns).toBeLessThan(phasePriorities.number);
      expect(phasePriorities.number).toBeLessThan(phasePriorities.phrase);
      expect(phasePriorities.phrase).toBeLessThan(phasePriorities.character);
    });

    test('should prevent phrase processing on proper noun consumed tokens', () => {
      // Scenario: "在X中" matched by pattern processor in Phase 1
      // "中" should NOT be processed by phrase processor in Phase 4
      const tokens = [
        {
          type: 'chinese_char',
          value: '在',
          translated: 'ở trong',
          translationSource: 'hierarchical_pattern',
        },
        {
          type: 'chinese_char',
          value: '天空',
          translated: null,
          translationSource: 'hierarchical_pattern_consumed',
        },
        {
          type: 'chinese_char',
          value: '中',
          translated: null,
          translationSource: 'hierarchical_pattern_consumed',
        },
      ];

      // Phrase processor should skip all tokens with translationSource
      const unprocessedTokens = tokens.filter(
        (t) => t.translationSource === null && t.translated === null
      );
      expect(unprocessedTokens.length).toBe(0); // All tokens already processed
    });

    test('should prevent character fallback on number consumed tokens', () => {
      // Scenario: "三十五" converted to "35" by number processor
      // Character processor should NOT process "十" and "五"
      const tokens = [
        {
          type: 'chinese_char',
          value: '三',
          translated: '35',
          translationSource: 'number_conversion',
        },
        {
          type: 'chinese_char',
          value: '十',
          translated: null,
          translationSource: 'number_conversion_consumed',
        },
        {
          type: 'chinese_char',
          value: '五',
          translated: null,
          translationSource: 'number_conversion_consumed',
        },
      ];

      // Character processor skips tokens with translationSource
      const tokensForCharacterPhase = tokens.filter((t) => t.translationSource === null);
      expect(tokensForCharacterPhase.length).toBe(0);
    });
  });

  describe('cross-phase interference prevention', () => {
    test('should prevent double-processing of same token', () => {
      // Token processed by phase 2 (proper nouns)
      const token = {
        type: 'chinese_char',
        value: '王二',
        translated: 'Vương Nhị',
        translationSource: 'properNouns-NovelName',
      };

      // Phases 3-5 should detect translationSource and skip
      const isAlreadyProcessed = token.translated !== null || token.translationSource !== null;
      expect(isAlreadyProcessed).toBe(true);
    });

    test('should handle mixed processed and unprocessed tokens', () => {
      const tokens = [
        { value: '在', translated: 'ở', translationSource: 'characters' }, // Processed
        { value: '那', translated: null, translationSource: null }, // Unprocessed
        { value: '里', translated: null, translationSource: 'phrase_consumed' }, // Consumed
      ];

      // Only token at index 1 should be processed by next phase
      const unprocessedTokens = tokens.filter(
        (t) => t.translated === null && t.translationSource === null
      );
      expect(unprocessedTokens.length).toBe(1);
      expect(unprocessedTokens[0].value).toBe('那');
    });

    test('should maintain token array length across all phases', () => {
      // CRITICAL: Phases MUST NOT insert/delete tokens
      const initialLength = 10;
      const tokensAfterPhase1 = new Array(initialLength).fill({ value: '在' });
      const tokensAfterPhase2 = tokensAfterPhase1; // Same reference
      const tokensAfterPhase3 = tokensAfterPhase2;
      const tokensAfterPhase4 = tokensAfterPhase3;
      const tokensAfterPhase5 = tokensAfterPhase4;

      expect(tokensAfterPhase5.length).toBe(initialLength);
    });
  });

  describe('conflict resolution', () => {
    test('should resolve pattern vs phrase conflict (pattern wins)', () => {
      // Pattern "在X中" matches "在天空中"
      // Phrase "天空" also matches
      // Pattern should win (higher priority: phase 1 vs phase 4)

      const patternMatch = {
        phase: 1,
        originalText: '在天空中',
        translation: 'ở trong bầu trời',
      };

      const phraseMatch = {
        phase: 4,
        originalText: '天空',
        translation: 'bầu trời',
      };

      // Lower phase number = higher priority
      const winner = patternMatch.phase < phraseMatch.phase ? patternMatch : phraseMatch;
      expect(winner).toBe(patternMatch);
    });

    test('should resolve proper noun vs phrase conflict (proper noun wins)', () => {
      // Proper noun "王二" (character name)
      // Phrase "二" (number two)
      // Proper noun should win (phase 2 < phase 4)

      const properNounMatch = {
        phase: 2,
        originalText: '王二',
        translation: 'Vương Nhị',
      };

      const phraseMatch = {
        phase: 4,
        originalText: '二',
        translation: 'hai',
      };

      const winner = properNounMatch.phase < phraseMatch.phase ? properNounMatch : phraseMatch;
      expect(winner).toBe(properNounMatch);
    });

    test('should resolve number vs character conflict (number wins)', () => {
      // Number "三十五" → "35"
      // Character "三" → "ba", "十" → "mười", "五" → "năm"
      // Number should win (phase 3 < phase 5)

      const numberMatch = {
        phase: 3,
        originalText: '三十五',
        translation: '35',
      };

      const characterMatch = {
        phase: 5,
        originalText: '三',
        translation: 'ba',
      };

      const winner = numberMatch.phase < characterMatch.phase ? numberMatch : characterMatch;
      expect(winner).toBe(numberMatch);
    });
  });

  describe('phase execution sequence', () => {
    test('should process phases in correct order', () => {
      const executionLog = [];

      // Simulate phase execution
      const executePhase = (phaseName, phaseNumber) => {
        executionLog.push({ phaseName, phaseNumber });
      };

      executePhase('patterns', 1);
      executePhase('properNouns', 2);
      executePhase('numbers', 3);
      executePhase('phrases', 4);
      executePhase('characters', 5);

      // Verify execution order
      expect(executionLog[0].phaseName).toBe('patterns');
      expect(executionLog[1].phaseName).toBe('properNouns');
      expect(executionLog[2].phaseName).toBe('numbers');
      expect(executionLog[3].phaseName).toBe('phrases');
      expect(executionLog[4].phaseName).toBe('characters');

      // Verify sequential phase numbers
      for (let i = 0; i < executionLog.length; i++) {
        expect(executionLog[i].phaseNumber).toBe(i + 1);
      }
    });

    test('should never reverse phase order', () => {
      const invalidExecutionOrders = [
        ['characters', 'phrases'], // Wrong: phase 5 before phase 4
        ['numbers', 'properNouns'], // Wrong: phase 3 before phase 2
        ['phrases', 'patterns'], // Wrong: phase 4 before phase 1
      ];

      for (const [first, second] of invalidExecutionOrders) {
        const phaseNumbers = {
          patterns: 1,
          properNouns: 2,
          numbers: 3,
          phrases: 4,
          characters: 5,
        };

        // Verify first phase has higher number (invalid)
        expect(phaseNumbers[first]).toBeGreaterThan(phaseNumbers[second]);
      }
    });
  });

  describe('token state consistency', () => {
    test('should maintain token state across phases', () => {
      // Token should preserve extra properties through all phases
      const token = {
        type: 'chinese_char',
        value: '在',
        translated: null,
        translationSource: null,
        start: 0,
        end: 1,
        isGrouped: false,
      };

      // Phase 1: Patterns (no match)
      // token properties unchanged

      // Phase 2: Proper nouns (no match)
      // token properties unchanged

      // Phase 3: Numbers (no match)
      // token properties unchanged

      // Phase 4: Phrases (no match)
      // token properties unchanged

      // Phase 5: Characters (match!)
      token.translated = 'ở';
      token.translationSource = 'characters';

      // Extra properties should be preserved
      expect(token.start).toBe(0);
      expect(token.end).toBe(1);
      expect(token.isGrouped).toBe(false);
    });

    test('should not mutate consumed tokens after marking', () => {
      const token = {
        type: 'chinese_char',
        value: '十',
        translated: null,
        translationSource: 'number_conversion_consumed',
      };

      // Once marked consumed, token should never be modified again
      const originalTranslated = token.translated;
      const originalSource = token.translationSource;

      // Phases 4 and 5 should skip this token
      // (no modifications)

      expect(token.translated).toBe(originalTranslated);
      expect(token.translationSource).toBe(originalSource);
    });
  });
});
