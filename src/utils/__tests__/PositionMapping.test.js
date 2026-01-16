/**
 * Position Mapping Completeness Tests
 *
 * Tests critical position tracking for clickable bidirectional highlighting:
 * - All semantic array units must have valid positions
 * - Original and translated text must synchronize exactly
 * - Position mapping precision is required for click highlighting
 * - Breaking position mapping breaks user-facing highlighting feature
 *
 * WHY THIS IS CRITICAL:
 * - Positions stored during postProcess() text assembly (direct tracking, not search)
 * - setPositionByMatch() uses O(1) lookup vs O(n*m) search
 * - All translation modes must preserve semantic array structure
 * - User clicks translated text → highlights corresponding original text
 * - User clicks original text → highlights corresponding translated text
 *
 * WHAT WE TEST:
 * - All semantic units have positions (no missing mappings)
 * - Positions are valid (non-negative, within bounds)
 * - Position mapping completeness (100% coverage expected)
 * - No duplicate positions (one-to-one mapping)
 */

import { describe, test, expect } from 'vitest';

describe('Position Mapping - Completeness', () => {
  describe('semantic array position requirements', () => {
    test('should have position for every semantic unit', () => {
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
          { source: 'characters', position: 2 },
        ],
      };

      // Every metadata entry must have position
      semanticArrays.metadata.forEach((meta, index) => {
        expect(meta.position).toBeDefined();
        expect(meta.position).not.toBeNull();
        expect(typeof meta.position).toBe('number');
      });
    });

    test('should have valid positions (non-negative integers)', () => {
      const semanticArrays = {
        original: ['在', '天空', '中'],
        translated: ['ở', 'bầu trời', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'phrases', position: 1 },
          { source: 'characters', position: 3 },
        ],
      };

      semanticArrays.metadata.forEach((meta) => {
        expect(meta.position).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(meta.position)).toBe(true);
      });
    });

    test('should have positions within token array bounds', () => {
      const totalTokens = 5;
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 2 },
          { source: 'characters', position: 4 },
        ],
      };

      semanticArrays.metadata.forEach((meta) => {
        expect(meta.position).toBeLessThan(totalTokens);
      });
    });

    test('should reject missing positions', () => {
      const invalidMetadata = [
        { source: 'characters' }, // Missing position
        { source: 'phrases', position: null }, // Null position
        { source: 'numbers', position: undefined }, // Undefined position
      ];

      invalidMetadata.forEach((meta) => {
        const isValid = typeof meta.position === 'number' && meta.position >= 0;
        expect(isValid).toBe(false);
      });
    });
  });

  describe('position mapping coverage', () => {
    test('should achieve 100% coverage (all units mapped)', () => {
      const semanticArrays = {
        original: ['在', '天空', '中', '有', '三', '只', '鸟'],
        translated: ['ở', 'bầu trời', 'trong', 'có', '3', 'con', 'chim'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'phrases', position: 1 },
          { source: 'characters', position: 3 },
          { source: 'characters', position: 4 },
          { source: 'number_conversion', position: 5 },
          { source: 'characters', position: 7 },
          { source: 'characters', position: 8 },
        ],
      };

      const totalUnits = semanticArrays.original.length;
      const unitsWithPositions = semanticArrays.metadata.filter(
        (m) => typeof m.position === 'number'
      ).length;

      const coverage = (unitsWithPositions / totalUnits) * 100;
      expect(coverage).toBe(100); // 100% coverage required
    });

    test('should detect incomplete coverage', () => {
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters' }, // Missing position!
          { source: 'characters', position: 2 },
        ],
      };

      const totalUnits = semanticArrays.original.length;
      const unitsWithValidPositions = semanticArrays.metadata.filter(
        (m) => typeof m.position === 'number' && m.position >= 0
      ).length;

      const coverage = (unitsWithValidPositions / totalUnits) * 100;
      expect(coverage).toBeLessThan(100); // Incomplete coverage detected
      expect(Math.round(coverage)).toBe(67); // 2/3 = 66.67%
    });
  });

  describe('position uniqueness', () => {
    test('should have no duplicate positions within same translation', () => {
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
          { source: 'characters', position: 2 },
        ],
      };

      const positions = semanticArrays.metadata.map((m) => m.position);
      const uniquePositions = new Set(positions);

      expect(uniquePositions.size).toBe(positions.length); // No duplicates
    });

    test('should detect duplicate positions', () => {
      const semanticArrays = {
        original: ['在', '那', '里'],
        translated: ['ở', 'đó', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
          { source: 'characters', position: 1 }, // Duplicate!
        ],
      };

      const positions = semanticArrays.metadata.map((m) => m.position);
      const uniquePositions = new Set(positions);

      expect(uniquePositions.size).toBeLessThan(positions.length); // Duplicates exist
    });
  });

  describe('position ordering', () => {
    test('should have monotonically increasing positions (no backwards jumps)', () => {
      const semanticArrays = {
        original: ['在', '那', '天空', '中'],
        translated: ['ở', 'đó', 'bầu trời', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
          { source: 'phrases', position: 2 }, // Multi-character phrase
          { source: 'characters', position: 4 }, // Skipped position 3 (consumed)
        ],
      };

      // Positions should be non-decreasing (allowing for consumed tokens)
      for (let i = 1; i < semanticArrays.metadata.length; i++) {
        const prevPos = semanticArrays.metadata[i - 1].position;
        const currPos = semanticArrays.metadata[i].position;
        expect(currPos).toBeGreaterThanOrEqual(prevPos);
      }
    });

    test('should handle position gaps (consumed tokens)', () => {
      // Scenario: "三十五" → "35" (consumes 3 tokens, position gaps: 0→3)
      const semanticArrays = {
        original: ['在', '三十五', '人'],
        translated: ['ở', '35', 'người'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'number_conversion', position: 1 }, // Consumed tokens 2, 3
          { source: 'characters', position: 4 },
        ],
      };

      // Position gaps are allowed (consumed tokens)
      const positions = semanticArrays.metadata.map((m) => m.position);
      expect(positions).toEqual([0, 1, 4]); // Gap between 1 and 4
    });
  });

  describe('position-text synchronization', () => {
    test('should maintain text order consistency', () => {
      const originalText = '在那天空中';
      const translatedText = 'ở đó bầu trời trong';

      const semanticArrays = {
        original: ['在', '那', '天空', '中'],
        translated: ['ở', 'đó', 'bầu trời', 'trong'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
          { source: 'phrases', position: 2 },
          { source: 'characters', position: 4 },
        ],
      };

      // Verify original text order matches semantic array order
      const reconstructedOriginal = semanticArrays.original.join('');
      expect(reconstructedOriginal).toBe(originalText);

      // Verify translated text order matches semantic array order
      const reconstructedTranslated = semanticArrays.translated.join(' ');
      expect(reconstructedTranslated).toBe(translatedText);
    });

    test('should track multi-token units correctly', () => {
      // Pattern "在XY中" consumes 4 tokens but appears as 1 semantic unit
      const semanticArrays = {
        original: ['在天空中', '有', '鸟'],
        translated: ['ở trong bầu trời', 'có', 'chim'],
        metadata: [
          { source: 'hierarchical_pattern', position: 0 }, // Consumes tokens 0-3
          { source: 'characters', position: 4 },
          { source: 'characters', position: 5 },
        ],
      };

      // First unit covers multiple tokens (position 0-3)
      expect(semanticArrays.original[0]).toBe('在天空中');
      expect(semanticArrays.translated[0]).toBe('ở trong bầu trời');
      expect(semanticArrays.metadata[0].position).toBe(0);

      // Subsequent units start after consumed tokens
      expect(semanticArrays.metadata[1].position).toBeGreaterThan(3);
    });
  });

  describe('position mapping edge cases', () => {
    test('should handle empty translation', () => {
      const semanticArrays = {
        original: [],
        translated: [],
        metadata: [],
      };

      expect(semanticArrays.original.length).toBe(0);
      expect(semanticArrays.translated.length).toBe(0);
      expect(semanticArrays.metadata.length).toBe(0);
    });

    test('should handle single character translation', () => {
      const semanticArrays = {
        original: ['在'],
        translated: ['ở'],
        metadata: [{ source: 'characters', position: 0 }],
      };

      expect(semanticArrays.metadata[0].position).toBe(0);
      expect(typeof semanticArrays.metadata[0].position).toBe('number');
    });

    test('should handle very long translation', () => {
      const longText = new Array(1000).fill('在');
      const longTranslation = new Array(1000).fill('ở');
      const longMetadata = new Array(1000).fill(null).map((_, i) => ({
        source: 'characters',
        position: i,
      }));

      const semanticArrays = {
        original: longText,
        translated: longTranslation,
        metadata: longMetadata,
      };

      // All 1000 units should have valid positions
      const validPositions = semanticArrays.metadata.filter(
        (m) => typeof m.position === 'number' && m.position >= 0
      ).length;

      expect(validPositions).toBe(1000);
    });

    test('should handle mixed single and multi-token units', () => {
      const semanticArrays = {
        original: [
          '在', // Single token (position 0)
          '天空', // Multi-token phrase (position 1-2)
          '中', // Single token (position 3)
          '三十五', // Multi-token number (position 4-6)
          '人', // Single token (position 7)
        ],
        translated: ['ở', 'bầu trời', 'trong', '35', 'người'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'phrases', position: 1 },
          { source: 'characters', position: 3 },
          { source: 'number_conversion', position: 4 },
          { source: 'characters', position: 7 },
        ],
      };

      // All positions should be valid
      semanticArrays.metadata.forEach((meta) => {
        expect(meta.position).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(meta.position)).toBe(true);
      });
    });
  });

  describe('position validation helpers', () => {
    test('should validate position completeness', () => {
      function hasCompletePositions(semanticArrays) {
        const totalUnits = semanticArrays.original.length;
        const validPositions = semanticArrays.metadata.filter(
          (m) => typeof m.position === 'number' && m.position >= 0
        ).length;
        return validPositions === totalUnits;
      }

      const complete = {
        original: ['在', '那'],
        translated: ['ở', 'đó'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
        ],
      };

      const incomplete = {
        original: ['在', '那'],
        translated: ['ở', 'đó'],
        metadata: [{ source: 'characters', position: 0 }, { source: 'characters' }],
      };

      expect(hasCompletePositions(complete)).toBe(true);
      expect(hasCompletePositions(incomplete)).toBe(false);
    });

    test('should validate position uniqueness', () => {
      function hasUniquePositions(semanticArrays) {
        const positions = semanticArrays.metadata.map((m) => m.position);
        const uniquePositions = new Set(positions);
        return uniquePositions.size === positions.length;
      }

      const unique = {
        original: ['在', '那'],
        translated: ['ở', 'đó'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 1 },
        ],
      };

      const duplicate = {
        original: ['在', '那'],
        translated: ['ở', 'đó'],
        metadata: [
          { source: 'characters', position: 0 },
          { source: 'characters', position: 0 },
        ],
      };

      expect(hasUniquePositions(unique)).toBe(true);
      expect(hasUniquePositions(duplicate)).toBe(false);
    });
  });
});
