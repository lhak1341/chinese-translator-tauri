/**
 * Position Mapping Validator Tests
 *
 * Verifies that position mapping validation catches real issues:
 * - Unmapped units
 * - Invalid positions (negative, NaN, Infinity)
 * - Out-of-bounds positions
 * - Duplicate positions
 * - Text mismatches (position points to wrong text)
 */

import { describe, test, expect } from 'vitest';
import { PositionMappingValidator, validatePositionMapping } from '../PositionMappingValidator.js';

describe('PositionMappingValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new PositionMappingValidator();
  });

  describe('validate() - basic validation', () => {
    test('should pass validation for correct position mapping', () => {
      // "ở đó trong" = 10 chars: "ở"(0-1) + " "(1-2) + "đó"(2-4) + " "(4-5) + "trong"(5-10)
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' }, // "ở"
          { translatedStart: 2, translatedEnd: 4, source: 'dictionary' }, // "đó"
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' }, // "trong"
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(true);
      expect(report.totalUnits).toBe(3);
      expect(report.mappedUnits).toBe(3);
      expect(report.coverage).toBe(100);
      expect(report.issues).toHaveLength(0);
    });

    test('should detect unmapped units', () => {
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: -1, translatedEnd: -1, source: 'dictionary' }, // Unmapped
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(false); // Low coverage
      expect(report.unmappedUnits).toBe(1);
      expect(report.mappedUnits).toBe(2);
      expect(report.coverage).toBeCloseTo(66.7, 1);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          type: 'unmapped',
          unitIndex: 1,
        })
      );
    });

    test('should detect invalid positions (negative)', () => {
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: -5, translatedEnd: 4, source: 'dictionary' }, // Invalid
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(false);
      expect(report.invalidPositions).toBe(1);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          type: 'invalid_position',
          unitIndex: 1,
          start: -5,
        })
      );
    });

    test('should detect out-of-bounds positions', () => {
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: 2, translatedEnd: 100, source: 'dictionary' }, // Out of bounds
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(false);
      expect(report.outOfBounds).toBe(1);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          type: 'out_of_bounds',
          unitIndex: 1,
          end: 100,
          textLength: translatedText.length,
        })
      );
    });

    test('should detect duplicate positions', () => {
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' }, // Duplicate
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.duplicatePositions).toBe(1);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          type: 'duplicate_position',
          unitIndex: 1,
        })
      );
    });

    test('should detect text mismatch (position points to wrong text)', () => {
      // Text is "ở đó trong" but translated array says unit 2 is "WRONG"
      // Position 5-10 points to "trong" but expects "WRONG"
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'WRONG'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: 2, translatedEnd: 4, source: 'dictionary' },
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' }, // Points to "trong", expects "WRONG"
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          type: 'text_mismatch',
          unitIndex: 2,
          expected: 'WRONG',
          actual: 'trong',
        })
      );
    });
  });

  describe('validate() - spacing scenarios (CRITICAL-1 test)', () => {
    test('should correctly handle spacing between segments', () => {
      // Translation with spacing: "Hello World" (space at position 5)
      // Segment 1: "Hello" (0-5)
      // Space added
      // Segment 2: "World" (6-11)
      const translatedText = 'Hello World';
      const semanticArrays = {
        original: ['你好', '世界'],
        translated: ['Hello', 'World'],
        metadata: [
          { translatedStart: 0, translatedEnd: 5, source: 'dictionary' },
          { translatedStart: 6, translatedEnd: 11, source: 'dictionary' }, // Should account for space
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(true);
      expect(report.issues).toHaveLength(0);
      expect(report.coverage).toBe(100);
    });

    test('should detect position offset if spacing is NOT tracked', () => {
      // If spacing is not tracked, positions would be wrong:
      // Segment 1: "Hello" (0-5)
      // Segment 2: "World" (5-10) ❌ WRONG - should be (6-11)
      const translatedText = 'Hello World';
      const semanticArrays = {
        original: ['你好', '世界'],
        translated: ['Hello', 'World'],
        metadata: [
          { translatedStart: 0, translatedEnd: 5, source: 'dictionary' },
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' }, // Wrong - doesn't account for space
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          type: 'text_mismatch',
          unitIndex: 1,
          expected: 'World',
          actual: ' Worl', // Actual text at positions 5-10
        })
      );
    });

    test('should handle multiple spaces correctly', () => {
      // "ở  đó  trong" with double spaces: "ở"(0-1) + "  "(1-3) + "đó"(3-5) + "  "(5-7) + "trong"(7-12)
      const translatedText = 'ở  đó  trong'; // Double spaces
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' }, // "ở"
          { translatedStart: 3, translatedEnd: 5, source: 'dictionary' }, // "đó" after 2 spaces
          { translatedStart: 7, translatedEnd: 12, source: 'dictionary' }, // "trong" after 2 more spaces
        ],
      };

      const report = validator.validate(translatedText, semanticArrays);

      expect(report.isValid).toBe(true);
      expect(report.issues).toHaveLength(0);
    });
  });

  describe('formatReport()', () => {
    test('should format valid report', () => {
      const report = {
        isValid: true,
        totalUnits: 10,
        mappedUnits: 10,
        coverage: 100,
        issues: [],
        unmappedUnits: 0,
        invalidPositions: 0,
        outOfBounds: 0,
        duplicatePositions: 0,
      };

      const formatted = validator.formatReport(report);

      expect(formatted).toContain('✅ VALID');
      expect(formatted).toContain('100.0%');
    });

    test('should format invalid report with issues', () => {
      const report = {
        isValid: false,
        totalUnits: 10,
        mappedUnits: 7,
        coverage: 70,
        unmappedUnits: 3,
        invalidPositions: 0,
        outOfBounds: 0,
        duplicatePositions: 0,
        issues: [
          {
            type: 'unmapped',
            unitIndex: 5,
            original: '在',
            translated: 'ở',
          },
        ],
      };

      const formatted = validator.formatReport(report);

      expect(formatted).toContain('❌ INVALID');
      expect(formatted).toContain('70.0%');
      expect(formatted).toContain('Unmapped units: 3');
    });
  });

  describe('getSuggestions()', () => {
    test('should suggest fix for high unmapped units', () => {
      const report = {
        totalUnits: 100,
        unmappedUnits: 50,
        invalidPositions: 0,
        outOfBounds: 0,
        duplicatePositions: 0,
        issues: [],
      };

      const suggestions = validator.getSuggestions(report);

      expect(suggestions).toContainEqual(
        expect.stringContaining('setPositionByMatch() is being called')
      );
    });

    test('should suggest fix for text mismatches', () => {
      const report = {
        totalUnits: 10,
        unmappedUnits: 0,
        invalidPositions: 0,
        outOfBounds: 0,
        duplicatePositions: 0,
        issues: [
          { type: 'text_mismatch', unitIndex: 0 },
          { type: 'text_mismatch', unitIndex: 1 },
        ],
      };

      const suggestions = validator.getSuggestions(report);

      expect(suggestions).toContainEqual(expect.stringContaining('position/text mismatches'));
    });
  });

  describe('validatePositionMapping() helper', () => {
    test('should return true for valid mapping', () => {
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: 2, translatedEnd: 4, source: 'dictionary' },
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
        ],
      };

      const isValid = validatePositionMapping(translatedText, semanticArrays);

      expect(isValid).toBe(true);
    });

    test('should return false for invalid mapping', () => {
      const translatedText = 'ở đó trong';
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'WRONG', 'trong'],
        metadata: [
          { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
          { translatedStart: 2, translatedEnd: 4, source: 'dictionary' }, // Points to "đó", expects "WRONG"
          { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
        ],
      };

      const isValid = validatePositionMapping(translatedText, semanticArrays);

      expect(isValid).toBe(false);
    });
  });
});
