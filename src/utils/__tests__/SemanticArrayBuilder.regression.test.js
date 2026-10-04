/**
 * Regression tests for SemanticArrayBuilder bug fixes
 *
 * Tests prevent regressions for:
 * - Invalid array length edge case (early input validation)
 */

import { describe, it, expect } from 'vitest';
import { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder.js';

describe('SemanticArrayBuilder Regression Tests', () => {
  describe('Bug Fix: Invalid Array Length Edge Case', () => {
    it('should handle NaN estimatedSize gracefully', () => {
      const builder = new SemanticArrayBuilder();

      // Bug fix: Should not crash with NaN
      expect(() => {
        builder.reset(NaN);
      }).not.toThrow();

      // Should fall back to default capacity
      expect(builder.estimatedCapacity).toBeGreaterThan(0);
      expect(builder.estimatedCapacity).toBeLessThanOrEqual(10000);
    });

    it('should handle Infinity estimatedSize gracefully', () => {
      const builder = new SemanticArrayBuilder();

      expect(() => {
        builder.reset(Infinity);
      }).not.toThrow();

      // Should fall back to safe capacity
      expect(builder.estimatedCapacity).toBeGreaterThan(0);
      expect(builder.estimatedCapacity).toBeLessThanOrEqual(10000);
    });

    it('should handle negative estimatedSize gracefully', () => {
      const builder = new SemanticArrayBuilder();

      expect(() => {
        builder.reset(-100);
      }).not.toThrow();

      // Should fall back to default capacity
      expect(builder.estimatedCapacity).toBeGreaterThan(0);
      expect(builder.estimatedCapacity).toBeLessThanOrEqual(10000);
    });

    it('should handle zero estimatedSize', () => {
      const builder = new SemanticArrayBuilder();

      expect(() => {
        builder.reset(0);
      }).not.toThrow();

      // Should fall back to default capacity
      expect(builder.estimatedCapacity).toBe(100);
    });

    it('should handle excessively large estimatedSize', () => {
      const builder = new SemanticArrayBuilder();

      expect(() => {
        builder.reset(1000000); // 1 million
      }).not.toThrow();

      // Should cap at MAX_SAFE_CAPACITY (10000)
      expect(builder.estimatedCapacity).toBeLessThanOrEqual(10000);
    });

    it('should accept valid estimatedSize', () => {
      const builder = new SemanticArrayBuilder();

      builder.reset(500);

      // Should set capacity to ~500 * 1.2 = 600
      expect(builder.estimatedCapacity).toBeGreaterThanOrEqual(500);
      expect(builder.estimatedCapacity).toBeLessThanOrEqual(1000);
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
