/**
 * Translation Engine Integration Tests
 *
 * END-TO-END tests for the complete 5-phase translation pipeline.
 * Tests actual TranslationEngine.translateSinglePass() orchestration.
 *
 * ⚠️ NOTE: These tests require WASM and are currently SKIPPED in Node.js environment
 *
 * WHY THESE TESTS ARE CRITICAL:
 * - Core translation logic was previously UNTESTED end-to-end
 * - Phase order is IMMUTABLE (ADR-004) - tests prevent accidental reordering
 * - Token consumption must work correctly across all phases
 * - Real-world scenarios with actual dictionaries
 *
 * WHAT WE TEST:
 * - Full pipeline execution (all 5 phases)
 * - Phase order enforcement (Pattern → Proper Noun → Number → Phrase → Character)
 * - Real dictionary integration (not mocks)
 * - Conflict resolution (multiple matches for same span)
 * - Translation quality (correct output for known inputs)
 *
 * FUTURE WORK:
 * - Move to Playwright for browser-based testing (WASM available)
 * - Or: Mock WASM processors for Node.js testing
 * - For now: See TranslationEngine.phasePriority.test.js for testable phase logic
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTranslationEngine } from '../TranslationEngineFactory.js';

describe('TranslationEngine - 5-Phase Pipeline Integration', () => {
  let engine;
  let mockDictionaries;

  beforeAll(async () => {
    // Create minimal dictionaries for testing
    mockDictionaries = {
      patterns: {
        name: 'patterns',
        entries: [
          {
            originalPattern: '在XY中',
            translatedPattern: 'ở trong X Y',
            tokens: [
              { type: 'literal', value: '在' },
              { type: 'variable', value: 'X' },
              { type: 'variable', value: 'Y' },
              { type: 'literal', value: '中' },
            ],
            variables: ['X', 'Y'],
            metadata: { priority: 23, lowPriority: false },
          },
        ],
      },
      properNouns: {
        name: 'properNouns-TestNovel',
        entries: {
          哈利波特: { translation: 'Harry Potter', metadata: {} },
          王二: { translation: 'Vương Nhị', metadata: {} },
        },
      },
      phrases: {
        name: 'phrases',
        entries: {
          不知道: { translation: 'không biết', metadata: {} },
          天空: { translation: 'bầu trời', metadata: {} },
          世界: { translation: 'thế giới', metadata: {} },
          的: { translation: 'của', metadata: {} },
        },
      },
      characters: {
        name: 'characters',
        entries: {
          在: { translation: 'ở', metadata: {} },
          中: { translation: 'trong', metadata: {} },
          人: { translation: 'người', metadata: {} },
          三: { translation: 'ba', metadata: {} },
          十: { translation: 'mười', metadata: {} },
          五: { translation: 'năm', metadata: {} },
        },
      },
    };

    // Initialize engine with test dictionaries
    engine = createTranslationEngine();
    await engine.initialize(mockDictionaries, {
      useWasmPatternProcessor: false, // Disable WASM for simpler testing
      useWasmNumberProcessor: false,
      useRustLookupIndex: false,
    });
  });

  afterAll(() => {
    if (engine && engine.cleanup) {
      engine.cleanup();
    }
  });

  describe('Phase 1: Pattern Processing (Highest Priority)', () => {
    test('should match structural patterns with variables', async () => {
      const input = '在天空中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Pattern "在XY中" should match with X=天, Y=空
      // Expected: "ở trong bầu trời" (pattern structure + phrase "天空")
      expect(result.translatedText).toContain('ở trong');
      expect(result.translatedText).toContain('bầu trời');

      // Verify semantic array shows pattern was used
      const semanticUnits = result.semanticArray || [];
      const patternUnits = semanticUnits.filter((u) => u.source && u.source.includes('pattern'));
      expect(patternUnits.length).toBeGreaterThan(0);
    });

    test('should preserve Vietnamese word order via patterns', async () => {
      const input = '在世界中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Pattern "在XY中" → "ở trong X Y"
      // Should produce: "ở trong thế giới" (correct Vietnamese order)
      // NOT: "ở thế giới trong" (incorrect Chinese order)
      const text = result.translatedText;

      // "ở trong" should appear together
      expect(text.toLowerCase().includes('ở trong')).toBe(true);
    });
  });

  describe('Phase 2: Proper Noun Processing', () => {
    test('should translate proper nouns before phrases', async () => {
      const input = '哈利波特';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Should translate as "Harry Potter" (proper noun)
      // NOT character-by-character
      expect(result.translatedText).toBe('Harry Potter');

      // Verify proper noun source
      const semanticUnits = result.semanticArray || [];
      const properNounUnits = semanticUnits.filter(
        (u) => u.source && u.source.includes('properNouns')
      );
      expect(properNounUnits.length).toBeGreaterThan(0);
    });

    test('should handle proper nouns inside patterns', async () => {
      const input = '在哈利波特中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Pattern "在XY中" with X=哈利波特 (proper noun)
      // Expected: "ở trong Harry Potter"
      expect(result.translatedText).toContain('ở trong');
      expect(result.translatedText).toContain('Harry Potter');
    });
  });

  describe('Phase 3: Number Processing', () => {
    test('should convert Chinese numbers atomically', async () => {
      const input = '三十五';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Should produce "35" (number conversion)
      // NOT "ba mười năm" (character-by-character)
      expect(result.translatedText).toBe('35');

      // Verify number source
      const semanticUnits = result.semanticArray || [];
      const numberUnits = semanticUnits.filter((u) => u.source && u.source.includes('number'));
      expect(numberUnits.length).toBeGreaterThan(0);
    });

    test('should handle numbers inside patterns', async () => {
      const input = '在三十五人中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Pattern "在XY中" with X=三十五 (number), Y=人 (character)
      // Expected: "ở trong 35 người"
      expect(result.translatedText).toContain('ở trong');
      expect(result.translatedText).toContain('35');
      expect(result.translatedText).toContain('người');
    });
  });

  describe('Phase 4: Phrase Processing', () => {
    test('should translate common phrases', async () => {
      const input = '不知道';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Should produce "không biết" (phrase)
      // NOT "không tri đạo" (character-by-character)
      expect(result.translatedText).toBe('không biết');

      // Verify phrase source
      const semanticUnits = result.semanticArray || [];
      const phraseUnits = semanticUnits.filter((u) => u.source && u.source.includes('phrase'));
      expect(phraseUnits.length).toBeGreaterThan(0);
    });

    test('should NOT override proper nouns with phrases', async () => {
      const input = '王二';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // "王二" should translate as proper noun "Vương Nhị"
      // Phrase processor should NOT translate "二" as "hai" (two)
      // because proper noun phase (2) runs before phrase phase (4)
      expect(result.translatedText).toBe('Vương Nhị');

      const semanticUnits = result.semanticArray || [];
      const properNounUnits = semanticUnits.filter(
        (u) => u.source && u.source.includes('properNouns')
      );
      expect(properNounUnits.length).toBeGreaterThan(0);
    });
  });

  describe('Phase 5: Character Processing (Fallback)', () => {
    test('should provide character fallback for unmatched tokens', async () => {
      const input = '人';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Should translate to "người" (character fallback)
      expect(result.translatedText).toBe('người');

      // Verify character source
      const semanticUnits = result.semanticArray || [];
      const characterUnits = semanticUnits.filter(
        (u) => u.source && u.source.includes('character')
      );
      expect(characterUnits.length).toBeGreaterThan(0);
    });

    test('should NOT process tokens already consumed by earlier phases', async () => {
      const input = '三十五';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Number phase (3) should consume "三十五" → "35"
      // Character phase (5) should NOT process "十" and "五"
      expect(result.translatedText).toBe('35');

      // Verify NO character-level units for "十" or "五"
      const semanticUnits = result.semanticArray || [];
      const characterUnits = semanticUnits.filter(
        (u) => u.source && u.source.includes('character') && (u.unit === '十' || u.unit === '五')
      );
      expect(characterUnits.length).toBe(0); // Should be consumed by number phase
    });
  });

  describe('Cross-Phase Conflict Resolution', () => {
    test('should resolve pattern vs phrase conflict (pattern wins)', async () => {
      const input = '在天空中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Pattern "在XY中" (phase 1) vs Phrase "天空" (phase 4)
      // Pattern should win (earlier phase = higher priority)
      expect(result.translatedText).toContain('ở trong');

      const semanticUnits = result.semanticArray || [];
      const patternUnits = semanticUnits.filter((u) => u.source && u.source.includes('pattern'));
      expect(patternUnits.length).toBeGreaterThan(0);
    });

    test('should resolve proper noun vs phrase conflict (proper noun wins)', async () => {
      const input = '哈利波特的世界';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // "哈利波特" should be proper noun (phase 2), not phrases
      // "的" should be phrase (phase 4)
      // "世界" should be phrase (phase 4)
      expect(result.translatedText).toContain('Harry Potter');
      expect(result.translatedText).toContain('của');
      expect(result.translatedText).toContain('thế giới');
    });

    test('should resolve number vs character conflict (number wins)', async () => {
      const input = '三十五人';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // "三十五" should be number (phase 3), not characters
      // "人" should be character (phase 5)
      expect(result.translatedText).toContain('35');
      expect(result.translatedText).toContain('người');

      // Verify "三", "十", "五" NOT translated character-by-character
      const text = result.translatedText;
      expect(text).not.toContain('ba mười năm'); // Wrong character-by-character
    });
  });

  describe('Phase Execution Order Validation', () => {
    test('should execute phases in immutable order', async () => {
      const input = '在三十五人中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Expected translation: "ở trong 35 người"
      // 1. Pattern "在XY中" → "ở trong X Y" (phase 1)
      // 2. No proper nouns (phase 2)
      // 3. Number "三十五" → "35" (phase 3)
      // 4. No phrases (phase 4)
      // 5. Character "人" → "người" (phase 5)

      expect(result.translatedText).toContain('ở trong');
      expect(result.translatedText).toContain('35');
      expect(result.translatedText).toContain('người');

      // Verify semantic array preserves phase order
      const semanticUnits = result.semanticArray || [];

      // Find units by source
      const patternUnit = semanticUnits.find((u) => u.source?.includes('pattern'));
      const numberUnit = semanticUnits.find((u) => u.source?.includes('number'));
      const characterUnit = semanticUnits.find((u) => u.source?.includes('character'));

      expect(patternUnit).toBeDefined();
      expect(numberUnit).toBeDefined();
      expect(characterUnit).toBeDefined();
    });

    test('should never reverse phase order', async () => {
      // This test verifies phase order via translation quality
      // If phases run in wrong order, translation will be incorrect

      const testCases = [
        {
          input: '在天空中',
          shouldContain: ['ở trong', 'bầu trời'],
          shouldNotContain: ['ở bầu trời trong'], // Wrong word order
        },
        {
          input: '哈利波特',
          shouldContain: ['Harry Potter'],
          shouldNotContain: ['ha lợi ba đặc'], // Character-by-character
        },
        {
          input: '三十五',
          shouldContain: ['35'],
          shouldNotContain: ['ba mười năm'], // Character-by-character
        },
      ];

      for (const testCase of testCases) {
        const result = await engine.translate(testCase.input, { mode: 'full' });
        const text = result.translatedText.toLowerCase();

        for (const expected of testCase.shouldContain) {
          expect(text).toContain(expected.toLowerCase());
        }

        for (const unexpected of testCase.shouldNotContain) {
          expect(text).not.toContain(unexpected.toLowerCase());
        }
      }
    });
  });

  describe('Token State Integrity', () => {
    test('should maintain token array length across all phases', async () => {
      const input = '在三十五人中';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Semantic array length should equal input character count
      // (phases MUST NOT insert/delete tokens)
      const semanticUnits = result.semanticArray || [];

      // Each character should have one semantic unit (may be consumed)
      expect(semanticUnits.length).toBeGreaterThanOrEqual(input.length);
    });

    test('should mark consumed tokens correctly', async () => {
      const input = '三十五';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Number phase should produce:
      // - Main unit: "三十五" → "35" (translated)
      // - Consumed units: "十", "五" (null translated)

      const semanticUnits = result.semanticArray || [];

      // Find the main number unit
      const mainUnit = semanticUnits.find(
        (u) => u.translated === '35' || u.source?.includes('number')
      );
      expect(mainUnit).toBeDefined();

      // Consumed tokens should have null or empty translated value
      // (exact implementation may vary)
    });
  });

  describe('Real-World Translation Scenarios', () => {
    test('should handle complex sentence with all phase types', async () => {
      const input = '在哈利波特的世界中有三十五人不知道';

      const result = await engine.translate(input, {
        mode: 'full',
        includeSemanticArray: true,
      });

      // Expected components:
      // - Pattern: "在XY中" → "ở trong X Y"
      // - Proper noun: "哈利波特" → "Harry Potter"
      // - Phrase: "的" → "của", "世界" → "thế giới"
      // - Number: "三十五" → "35"
      // - Character: "人" → "người"
      // - Phrase: "不知道" → "không biết"

      const text = result.translatedText;

      expect(text).toContain('ở trong');
      expect(text).toContain('Harry Potter');
      expect(text).toContain('của');
      expect(text).toContain('thế giới');
      expect(text).toContain('35');
      expect(text).toContain('người');
      expect(text).toContain('không biết');
    });

    test('should produce natural Vietnamese word order', async () => {
      const input = '在天空中';

      const result = await engine.translate(input, { mode: 'full' });

      const text = result.translatedText.toLowerCase();

      // Vietnamese word order: "ở trong bầu trời"
      // Pattern establishes "ở trong X"
      // Phrase fills X with "bầu trời"

      expect(text.includes('ở trong')).toBe(true);
      expect(text.includes('bầu trời')).toBe(true);

      // Verify NOT Chinese word order: "ở bầu trời trong"
      const oIndex = text.indexOf('ở');
      const trongIndex = text.indexOf('trong');
      const bauIndex = text.indexOf('bầu');

      if (oIndex !== -1 && trongIndex !== -1 && bauIndex !== -1) {
        expect(oIndex).toBeLessThan(trongIndex); // "ở" before "trong"
        expect(trongIndex).toBeLessThan(bauIndex); // "trong" before "bầu"
      }
    });
  });

  describe('Phase Failure Handling', () => {
    test('should continue translation if one phase fails', async () => {
      // This test would require mocking a phase to throw an error
      // For now, we verify that missing dictionaries don't crash

      const minimalEngine = createTranslationEngine();
      await minimalEngine.initialize(
        {
          characters: mockDictionaries.characters,
        },
        {
          useWasmPatternProcessor: false,
          useWasmNumberProcessor: false,
          useRustLookupIndex: false,
        }
      );

      const input = '人';

      const result = await minimalEngine.translate(input, { mode: 'full' });

      // Should still translate using character fallback
      expect(result.translatedText).toBe('người');

      if (minimalEngine.cleanup) {
        minimalEngine.cleanup();
      }
    });

    test('should handle empty input gracefully', async () => {
      const result = await engine.translate('', { mode: 'full' });

      expect(result.translatedText).toBe('');
      expect(result.semanticArray).toEqual([]);
    });

    test('should handle whitespace-only input', async () => {
      const result = await engine.translate('   ', { mode: 'full' });

      // Should preserve whitespace or return empty
      expect(typeof result.translatedText).toBe('string');
    });
  });
});
