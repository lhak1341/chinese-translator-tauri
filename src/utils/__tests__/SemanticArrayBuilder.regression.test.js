/**
 * Regression tests for SemanticArrayBuilder bug fixes
 *
 * Tests prevent regressions for:
 * - the corruption signal and growth past any starting size
 * - adjacent units not counted as overlapping
 */

import { describe, it, expect } from 'vitest';
import { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder.js';

describe('SemanticArrayBuilder Regression Tests', () => {
  describe('Corruption signal', () => {
    it('starts clean, and a well-formed unit leaves it clean', () => {
      const builder = new SemanticArrayBuilder();

      expect(builder.isCorrupted).toBe(false);
      expect(builder.addUnit('你', 'bạn', 'characters', 0)).toBe(true);
      expect(builder.isCorrupted).toBe(false);
    });

    it('an undefined translation corrupts the builder and refuses every later unit', () => {
      const builder = new SemanticArrayBuilder();

      expect(builder.addUnit('你', undefined, 'characters', 0)).toBe(false);
      expect(builder.isCorrupted).toBe(true);
      expect(builder.addUnit('好', 'tốt', 'characters', 1)).toBe(false);
    });

    it('reset() clears it, so the next translation starts fresh', () => {
      const builder = new SemanticArrayBuilder();
      builder.addUnit('你', undefined, 'characters', 0);

      builder.reset();

      expect(builder.isCorrupted).toBe(false);
      expect(builder.getArrays().original).toEqual([]);
      expect(builder.addUnit('你', 'bạn', 'characters', 0)).toBe(true);
    });

    it('grows past any starting size without a capacity to set', () => {
      const builder = new SemanticArrayBuilder();
      for (let i = 0; i < 20000; i++) builder.addUnit(`原${i}`, `dịch${i}`, 'characters', i);

      expect(builder.isCorrupted).toBe(false);
      expect(builder.getArrays().original).toHaveLength(20000);
    });
  });

  describe('Bug Fix: adjacent units are not overlapping', () => {
    it('accepts a unit starting exactly where the previous one ended (e.g. "A" then "1")', () => {
      const builder = new SemanticArrayBuilder();
      builder.addUnit('abc', 'abc', 'characters', 0);
      builder.addUnit('123', '123', 'characters', 1);
      expect(builder.setPositionByMatch(0, 'abc', 0, 3, 0)).toBe(true);
      expect(builder.setPositionByMatch(1, '123', 3, 6, 3)).toBe(true);
    });

    it('still rejects a genuinely overlapping range', () => {
      const builder = new SemanticArrayBuilder();
      builder.addUnit('abc', 'abc', 'characters', 0);
      builder.addUnit('123', '123', 'characters', 1);
      builder.setPositionByMatch(0, 'abc', 0, 3, 0);
      expect(builder.setPositionByMatch(1, '123', 2, 5, 3)).toBe(false);
    });
  });
});
