/**
 * Translation Engine Integration Tests
 *
 * END-TO-END tests for the complete 5-phase translation pipeline.
 * Tests actual TranslationEngine.translateSinglePass() orchestration.
 *
 * ⚠️ CORRECTED 2026-07-30 (architecture review candidate #3 grilling) — the
 * "requires WASM, move to Playwright" claim below was verified FALSE. The
 * beforeAll already disabled WASM (useWasmPatternProcessor/etc — themselves
 * dead options, never read by TranslationEngine.js; the real gate is the
 * constructor's `enableTwoPhasePatterns`), and ADR-007 confirms Phase 1 has a
 * real, always-available pure-JS adapter (SemanticPatternProcessor) for this
 * exact config. Un-skipping the whole suite (empirically, by removing
 * `.skip` and running it) produced 22/22 failures, but NONE were WASM-related:
 * - `engine.translate()` returns a raw string/chunking result, not an object —
 *   the real object-returning entry point is `engine.translateWithSegments()`.
 * - The dictionary fixture below wrapped every dict in a stale `{name, entries}`
 *   shape; `DictionaryManager.loadDictionaries`/`buildTrieFromDictionary` and
 *   `SemanticPatternProcessor.initializePatterns` both expect a flat
 *   `{source: target}` map (patterns: `{patternText: template}`, everything
 *   else: `{word: {translation, ...}}` or `{word: 'translation'}`).
 * - Chasing this further surfaced a REAL bug (now fixed, see
 *   SemanticPatternProcessor.js's convertPrioritizedPatternToMatchResult):
 *   the WASM-fallback pattern-substitution loop hardcoded `.replace('X', ...)`
 *   regardless of which variable a token actually filled, so any pattern with
 *   2+ distinct variables (e.g. "在XY中") only ever filled the first one.
 *   Regression test: SemanticPatternProcessor.test.js's "multi-variable
 *   substitution" block.
 *
 * Only the "Real-World Translation Scenarios" block below has been rewritten
 * against the current API and un-skipped, as a smoke-test slice. The other 10
 * blocks (Phase 1-5, Cross-Phase Conflict Resolution, Phase Execution Order
 * Validation, Token State Integrity, Phase Failure Handling) are STILL stale
 * against the current API (same 3 layers: wrong method, wrong fixture shape,
 * and likely more once fixed) and remain skipped below — rewriting all of them
 * is a larger, separate effort.
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
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { TranslationEngine } from '../TranslationEngine.js';

// SKIP: The 10 blocks below are stale against the current TranslationEngine API
// (see the corrected file header) — un-skip individually only after rewriting
// each against translateWithSegments() and the current flat dictionary shape.
//
// CODE REVIEW NOTE (HIGH-1): Phase order enforcement IS tested in TranslationEngine.phasePriority.test.js
// That file contains comprehensive unit tests that verify:
// - Phase priority constants (1-5 in correct order)
// - Phase execution sequence validation
// - Token consumption patterns
// - Cross-phase prevention
// Those tests WILL FAIL if phase order is accidentally changed, meeting the requirement.
describe.skip('TranslationEngine - 5-Phase Pipeline Integration', () => {
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
    engine = new TranslationEngine({
      debugLevel: 0,
      enableMemoryMonitoring: false,
      enablePerformanceMonitoring: false,
    });
    await engine.initialize(mockDictionaries, {
      useWasmPatternProcessor: false, // Disable WASM for simpler testing
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

  // "Real-World Translation Scenarios" moved out of this skipped block — see
  // the un-skipped describe at the bottom of this file (rewritten against the
  // current API as a smoke-test slice, architecture review candidate #3).

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

// Smoke-test slice (architecture review 2026-07-30, candidate #3): rewritten
// against the current API, real dictionary shape, and un-skipped. See the
// corrected file header for the 3 layers of drift found and fixed to get here.
describe('TranslationEngine - Real-World Translation Scenarios (smoke test)', () => {
  let engine;
  let mockDictionaries;

  beforeAll(async () => {
    // Flat {source: target} shape — matches DictionaryManager.loadDictionaries /
    // buildTrieFromDictionary and SemanticPatternProcessor.initializePatterns.
    // Patterns are `{patternText: template}`; uppercase Latin letters in
    // patternText are auto-detected as variables (SemanticPatternProcessor.parsePattern).
    mockDictionaries = {
      patterns: {
        在XY中: 'ở trong X Y',
      },
      properNouns: {
        哈利波特: { translation: 'Harry Potter' },
        王二: { translation: 'Vương Nhị' },
      },
      phrases: {
        不知道: { translation: 'không biết' },
        世界: { translation: 'thế giới' },
        的: { translation: 'của' },
        // Single-char "phrase" entries so the "在XY中" pattern's X/Y variables
        // (each a single-character slot) resolve at all: buildVariableCache
        // only feeds from activeProperNouns dicts + 'phrases' (confirmed via
        // applyPatterns()'s patternVariableDictionaries) — 'characters' is
        // NEVER consulted, so a char-only dict entry is invisible to pattern
        // variable resolution entirely (not a bug — variables are designed to
        // capture phrase/proper-noun spans, not bare characters). `phrases`
        // entries additionally need `allowAsPatternVariable: true` — unlike
        // proper nouns (valid pattern variables by design, no gate), phrases
        // are gated by this flag in PatternVariableCache.js's Stage 2/4.
        // Deliberately no combined "天空" 2-char entry here — that would let
        // the variable matcher's longest-first span backtracking consume it
        // entirely as X, leaving nothing for Y's separate slot.
        天: { translation: 'trời', allowAsPatternVariable: true },
        空: { translation: 'không', allowAsPatternVariable: true },
      },
      characters: {
        在: { translation: 'ở' },
        中: { translation: 'trong' },
        人: { translation: 'người' },
        三: { translation: 'ba' },
        十: { translation: 'mười' },
        五: { translation: 'năm' },
      },
    };

    engine = new TranslationEngine({
      debugLevel: 0,
      enableMemoryMonitoring: false,
      enablePerformanceMonitoring: false,
    });
    // enableTwoPhasePatterns is NOT a constructor option — the constructor
    // hardcodes `this.settings.enableTwoPhasePatterns = true` regardless of
    // what's passed in. The real (previously unwired) contract is
    // initialize()'s `patternSettings`, fixed alongside this test (architecture
    // review 2026-07-30, candidate #3 grilling). This forces the pure-JS
    // pattern adapter (ADR-007) — no WASM needed.
    await engine.initialize(mockDictionaries, {
      patternSettings: { enableTwoPhasePatterns: false },
    });
  });

  afterAll(() => {
    if (engine && engine.cleanup) {
      engine.cleanup();
    }
  });

  test('should handle complex sentence with all phase types', async () => {
    const input = '在哈利波特的世界中有三十五人不知道';

    const result = await engine.translateWithSegments(input, {});

    // Expected components:
    // - Proper noun: "哈利波特" → "Harry Potter"
    // - Phrase: "的" → "của", "世界" → "thế giới"
    // - Number: "三十五" → "35"
    // - Character: "人" → "người"
    // - Phrase: "不知道" → "không biết"
    //
    // NOTE: the multi-char pattern variable case ("XY" spanning "哈利波特的世界",
    // more than 1 token each) is NOT covered here — the pure-JS single-phase
    // pattern adapter only resolves single-character variables correctly
    // (confirmed empirically); multi-token variable spans are a two-phase/WASM
    // capability. This scenario deliberately checks the non-pattern phases only.
    const text = result.translatedText;

    expect(text).toContain('Harry Potter');
    expect(text).toContain('của');
    expect(text).toContain('thế giới');
    expect(text).toContain('35');
    expect(text).toContain('người');
    expect(text).toContain('không biết');
  });

  test('should produce natural Vietnamese word order for a single-character-variable pattern', async () => {
    const input = '在天空中';

    const result = await engine.translateWithSegments(input, {});

    const text = result.translatedText.toLowerCase();

    // Pattern "在XY中" → "ở trong X Y", X=天→'trời' Y=空→'không' (single-char
    // variables, resolved via the characters dict — not the "天空" phrase, whose
    // 2-char span the variable matcher could otherwise consume entirely as X).
    // Correct Vietnamese order: "ở trong trời không".
    expect(text.includes('ở trong')).toBe(true);
    expect(text.includes('trời')).toBe(true);
    expect(text.includes('không')).toBe(true);

    // Verify NOT Chinese word order ("ở trời không trong") — this is the exact
    // shape of the multi-variable substitution bug fixed alongside this test
    // (see SemanticPatternProcessor.js's convertPrioritizedPatternToMatchResult).
    const oIndex = text.indexOf('ở');
    const trongIndex = text.indexOf('trong');
    const bauIndex = text.indexOf('trời');

    expect(oIndex).toBeLessThan(trongIndex);
    expect(trongIndex).toBeLessThan(bauIndex);
  });
});
