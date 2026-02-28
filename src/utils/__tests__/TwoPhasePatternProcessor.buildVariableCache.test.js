/**
 * Tests that buildVariableCache includes pattern-translated tokens with
 * patternSemanticType in the variable cache.
 *
 * WHAT WE TEST (Task 5):
 * - A token with translationSource === 'pattern' and a patternSemanticType field
 *   is added to the cache with the correct { translation, source, type } shape.
 * - The same applies to all four hierarchical pattern source strings:
 *   'hierarchical_pattern', 'hierarchical_patterns', 'hierarchical_patterns_composite'
 * - A pattern-translated token WITHOUT patternSemanticType is NOT added via this path.
 * - A non-pattern source (e.g. 'phrases') is NOT added via this path even if
 *   patternSemanticType is set.
 * - When both a proper-noun translation (Phase 1) and a pattern translation
 *   (Phase 1b) exist for the same text, the latter wins (later write).
 *
 * APPROACH:
 * We construct a minimal TwoPhasePatternProcessor with no patterns (empty array)
 * and a stub dictionaryManager that returns no matches, so the only cache entries
 * come from the new Phase 1b block.
 */

import { describe, test, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Stub dictionaryManager — no matches so Phase 2/3/4 add nothing to cache
// ─────────────────────────────────────────────────────────────────────────────
function makeNoopDictionaryManager() {
  return {
    translate: () => null,
    findAllMatches: () => [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Import helper — avoids top-level await in describe body
// ─────────────────────────────────────────────────────────────────────────────
async function makeProcessor() {
  const mod = await import('../TwoPhasePatternProcessor.js');
  // Default export
  const TwoPhasePatternProcessor = mod.default;
  // Empty patterns array — no pattern analysis needed, only testing cache building
  return new TwoPhasePatternProcessor([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildVariableCache — cross-pass pattern tokens (Task 5)', () => {
  test('caches a token with translationSource=pattern and patternSemanticType', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '刘备',
        translated: 'Lưu Bị',
        translationSource: 'pattern',
        patternSemanticType: 'person',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    expect(cache['刘备']).toEqual({
      translation: 'Lưu Bị',
      source: 'pattern',
      type: 'person',
    });
  });

  test('caches a token with translationSource=hierarchical_pattern', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '天空',
        translated: 'bầu trời',
        translationSource: 'hierarchical_pattern',
        patternSemanticType: 'concept',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    expect(cache['天空']).toEqual({
      translation: 'bầu trời',
      source: 'hierarchical_pattern',
      type: 'concept',
    });
  });

  test('caches a token with translationSource=hierarchical_patterns', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '地球',
        translated: 'trái đất',
        translationSource: 'hierarchical_patterns',
        patternSemanticType: 'location',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    expect(cache['地球']).toEqual({
      translation: 'trái đất',
      source: 'hierarchical_patterns',
      type: 'location',
    });
  });

  test('caches a token with translationSource=hierarchical_patterns_composite', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '王国',
        translated: 'vương quốc',
        translationSource: 'hierarchical_patterns_composite',
        patternSemanticType: 'organization',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    expect(cache['王国']).toEqual({
      translation: 'vương quốc',
      source: 'hierarchical_patterns_composite',
      type: 'organization',
    });
  });

  test('does NOT cache a pattern-translated token that lacks patternSemanticType', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '山河',
        translated: 'sơn hà',
        translationSource: 'pattern',
        // patternSemanticType intentionally absent
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    // Should not be added by Phase 1b (no patternSemanticType)
    expect(cache['山河']).toBeUndefined();
  });

  test('does NOT cache a token with non-pattern translationSource even if patternSemanticType is set', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '朋友',
        translated: 'bạn bè',
        translationSource: 'phrases', // Not a pattern source
        patternSemanticType: 'concept',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    // 'phrases' is not a pattern translationSource — must not be added by Phase 1b
    expect(cache['朋友']).toBeUndefined();
  });

  test('does NOT cache a token with null patternSemanticType', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '星球',
        translated: 'hành tinh',
        translationSource: 'pattern',
        patternSemanticType: null,
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    expect(cache['星球']).toBeUndefined();
  });

  test('pattern-translated token with type overrides a proper-noun cache entry for the same text', async () => {
    const processor = await makeProcessor();
    // Both tokens have the same value '李白' — proper noun first, pattern second
    const tokens = [
      {
        value: '李白',
        translated: 'Lý Bạch (proper noun)',
        translationSource: 'properNouns-TestNovel',
        patternSemanticType: undefined,
        type: 'chinese_word',
      },
      {
        value: '李白',
        translated: 'Lý Bạch (pattern)',
        translationSource: 'pattern',
        patternSemanticType: 'person',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    // Phase 1b runs after Phase 1, so pattern entry overwrites proper-noun entry
    expect(cache['李白'].type).toBe('person');
    expect(cache['李白'].source).toBe('pattern');
    expect(cache['李白'].translation).toBe('Lý Bạch (pattern)');
  });

  test('caches multiple tokens with different patternSemanticTypes', async () => {
    const processor = await makeProcessor();
    const tokens = [
      {
        value: '皇帝',
        translated: 'hoàng đế',
        translationSource: 'pattern',
        patternSemanticType: 'person',
        type: 'chinese_word',
      },
      {
        value: '宫殿',
        translated: 'cung điện',
        translationSource: 'hierarchical_patterns',
        patternSemanticType: 'location',
        type: 'chinese_word',
      },
    ];

    const cache = processor.buildVariableCache(tokens, {
      activeProperNouns: [],
      dictionaryManager: makeNoopDictionaryManager(),
    });

    expect(cache['皇帝']).toEqual({
      translation: 'hoàng đế',
      source: 'pattern',
      type: 'person',
    });
    expect(cache['宫殿']).toEqual({
      translation: 'cung điện',
      source: 'hierarchical_patterns',
      type: 'location',
    });
  });
});
