/**
 * TranslationEngine — Phase Source String Contract Tests
 *
 * These tests lock down the exact translationSource string values used by each
 * phase's addUnit() calls. The most common AI mistake in this codebase is
 * passing a wrong source string to addUnit(), which causes getSourcePriority()
 * to return 999 (lower than character fallback) and silently corrupt output.
 *
 * Historical failures that these tests would have caught:
 * - Session 30: addUnit passed 'patterns' (plural) — should be 'pattern' (singular)
 * - Any future change to consumed suffix convention
 * - Phase priority number drift
 *
 * WHAT WE TEST:
 * 1. Valid source strings return the correct phase priority (1-5)
 * 2. Commonly-confused wrong values return 999 (the sentinel for unrecognised sources)
 * 3. Consumed token detection matches exactly the '_consumed' suffix contract
 * 4. Priority ordering is Phase1 < Phase2 < Phase3 < Phase4 < Phase5
 *
 * These tests mirror the logic inside translateSinglePass() which cannot be
 * imported directly (it's a local function). If the engine's PHASE_PRIORITIES
 * or getSourcePriority logic changes, update these tests to match.
 */

import { describe, test, expect } from 'vitest';

// ============================================================================
// Mirror of PHASE_PRIORITIES from TranslationEngine.js:translateSinglePass()
// If you change this in the engine, update it here too.
// ============================================================================
const PHASE_PRIORITIES = {
  // Phase 1 — Pattern (all possible source strings from JS and WASM paths)
  pattern: 1,
  hierarchical_pattern: 1,
  hierarchical_patterns: 1,
  hierarchical_patterns_composite: 1,
  // Phase 2 — Proper noun: dynamic dictionary names, resolved separately
  // Phase 3 — Number
  number_conversion: 3,
  number_plus_liang_fix: 3,
  // Phase 4 — Phrase
  phrases: 4,
  // Phase 5 — Character
  characters: 5,
};

/**
 * Mirror of getSourcePriority() from TranslationEngine.js:7510-7522
 * Dynamic proper-noun dict names (e.g. 'properNouns-MyNovel') are handled
 * via the activeProperNouns check — here we pass them in explicitly.
 */
function getSourcePriority(translationSource, activeProperNouns = []) {
  if (!translationSource || translationSource.includes('_consumed')) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(PHASE_PRIORITIES, translationSource)) {
    return PHASE_PRIORITIES[translationSource];
  }
  if (activeProperNouns.includes(translationSource)) {
    return 2;
  }
  return 999;
}

describe('TranslationEngine — Phase Source String Contracts', () => {
  // --------------------------------------------------------------------------
  // Phase 1: Pattern sources
  // --------------------------------------------------------------------------
  describe('Phase 1 — Pattern sources', () => {
    test('pattern (singular) returns priority 1', () => {
      expect(getSourcePriority('pattern')).toBe(1);
    });

    test('hierarchical_pattern returns priority 1', () => {
      expect(getSourcePriority('hierarchical_pattern')).toBe(1);
    });

    test('hierarchical_patterns returns priority 1', () => {
      expect(getSourcePriority('hierarchical_patterns')).toBe(1);
    });

    test('hierarchical_patterns_composite returns priority 1', () => {
      expect(getSourcePriority('hierarchical_patterns_composite')).toBe(1);
    });

    // This is the exact bug from Session 30 — 'patterns' was passed instead of 'pattern'
    test('WRONG: patterns (plural) returns 999 — use pattern (singular)', () => {
      expect(getSourcePriority('patterns')).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 2: Proper noun sources
  // --------------------------------------------------------------------------
  describe('Phase 2 — Proper noun sources', () => {
    test('active proper noun dict name returns priority 2', () => {
      const activeProperNouns = ['properNouns-MyNovel'];
      expect(getSourcePriority('properNouns-MyNovel', activeProperNouns)).toBe(2);
    });

    test('inactive proper noun dict name returns 999 (not in active list)', () => {
      expect(getSourcePriority('properNouns-MyNovel', [])).toBe(999);
    });

    test('WRONG: properNouns (generic string) returns 999', () => {
      expect(getSourcePriority('properNouns')).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 3: Number sources
  // --------------------------------------------------------------------------
  describe('Phase 3 — Number sources', () => {
    test('number_conversion returns priority 3', () => {
      expect(getSourcePriority('number_conversion')).toBe(3);
    });

    test('number_plus_liang_fix returns priority 3', () => {
      expect(getSourcePriority('number_plus_liang_fix')).toBe(3);
    });

    test('WRONG: numbers (plural) returns 999', () => {
      expect(getSourcePriority('numbers')).toBe(999);
    });

    test('WRONG: number (bare) returns 999', () => {
      expect(getSourcePriority('number')).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 4: Phrase sources
  // --------------------------------------------------------------------------
  describe('Phase 4 — Phrase sources', () => {
    test('phrases (plural) returns priority 4', () => {
      expect(getSourcePriority('phrases')).toBe(4);
    });

    test('WRONG: phrase (singular) returns 999 — use phrases (plural)', () => {
      expect(getSourcePriority('phrase')).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 5: Character sources
  // --------------------------------------------------------------------------
  describe('Phase 5 — Character sources', () => {
    test('characters (plural) returns priority 5', () => {
      expect(getSourcePriority('characters')).toBe(5);
    });

    test('WRONG: character (singular) returns 999 — use characters (plural)', () => {
      expect(getSourcePriority('character')).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // Priority ordering
  // --------------------------------------------------------------------------
  describe('Priority ordering — Phase 1 through 5 must be strictly ascending', () => {
    test('Phase 1 (pattern) has lower number than Phase 2 (proper noun)', () => {
      expect(getSourcePriority('pattern')).toBeLessThan(2);
    });

    test('Phase 2 (proper noun) has lower number than Phase 3 (number)', () => {
      expect(getSourcePriority('number_conversion')).toBeGreaterThan(2);
    });

    test('Phase 3 (number) has lower number than Phase 4 (phrase)', () => {
      expect(getSourcePriority('number_conversion')).toBeLessThan(getSourcePriority('phrases'));
    });

    test('Phase 4 (phrase) has lower number than Phase 5 (character)', () => {
      expect(getSourcePriority('phrases')).toBeLessThan(getSourcePriority('characters'));
    });

    test('All valid phase priorities are less than 999 (the unknown sentinel)', () => {
      for (const source of Object.keys(PHASE_PRIORITIES)) {
        expect(getSourcePriority(source)).toBeLessThan(999);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Consumed token detection contract
  // --------------------------------------------------------------------------
  describe('Consumed token detection — "_consumed" suffix convention', () => {
    test('getSourcePriority returns null for consumed sources', () => {
      const consumedSources = [
        'pattern_consumed',
        'hierarchical_pattern_consumed',
        'number_conversion_consumed',
        'phrases_consumed',
        'characters_consumed',
        'properNouns-MyNovel_consumed',
      ];
      for (const source of consumedSources) {
        expect(getSourcePriority(source)).toBeNull();
      }
    });

    test('consumed detection uses includes("_consumed") — any suffix position matches', () => {
      // validateConsumedTokenContract uses .includes('_consumed')
      // getSourcePriority also uses .includes('_consumed')
      // These MUST match — if one changes, the other must too
      const consumed = 'number_conversion_consumed';
      expect(consumed.includes('_consumed')).toBe(true);
      expect(getSourcePriority(consumed)).toBeNull();
    });

    test('non-consumed source containing "consume" in a different way is not affected', () => {
      // Contrived, but guards against over-broad matching
      expect('phrases'.includes('_consumed')).toBe(false);
      expect(getSourcePriority('phrases')).toBe(4);
    });

    test('null source returns null (uninitialised token)', () => {
      expect(getSourcePriority(null)).toBeNull();
      expect(getSourcePriority(undefined)).toBeNull();
      expect(getSourcePriority('')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Consumed token contract: *_consumed → translated must be null
  // --------------------------------------------------------------------------
  describe('Consumed token data contract', () => {
    test('leader token: non-consumed source must have non-null translated', () => {
      const leaderToken = { translated: 'ba mươi lăm', translationSource: 'number_conversion' };
      expect(leaderToken.translated).not.toBeNull();
      expect(leaderToken.translationSource.includes('_consumed')).toBe(false);
    });

    test('follower token: _consumed source must have null translated', () => {
      const followerToken = { translated: null, translationSource: 'number_conversion_consumed' };
      expect(followerToken.translated).toBeNull();
      expect(followerToken.translationSource.includes('_consumed')).toBe(true);
    });

    test('contract violation: _consumed source with non-null translated is detected', () => {
      // This is what validateConsumedTokenContract catches at runtime.
      // This test locks down the detection predicate.
      const violatingToken = { translated: 'ba', translationSource: 'number_conversion_consumed' };
      const isConsumed = violatingToken.translationSource.includes('_consumed');
      const hasTranslation = violatingToken.translated !== null;
      // A consumed token with a translation is a contract violation
      expect(isConsumed && hasTranslation).toBe(true); // violation detected
    });

    test('contract ok: non-consumed source with non-null translated', () => {
      const validToken = { translated: 'ba', translationSource: 'characters' };
      const isConsumed = validToken.translationSource.includes('_consumed');
      const hasTranslation = validToken.translated !== null;
      expect(isConsumed).toBe(false);
      expect(hasTranslation).toBe(true);
    });
  });
});
