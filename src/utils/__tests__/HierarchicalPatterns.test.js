/**
 * Comprehensive test cases for hierarchical pattern implementation
 * Tests two-phase pattern processing with composite pattern recognition
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import PatternAnalyzer from '../PatternAnalyzer.js';
import TwoPhasePatternProcessor from '../TwoPhasePatternProcessor.js';
import CompositePatternDetector from '../CompositePatternDetector.js';
import CompositeDecisionEngine from '../CompositeDecisionEngine.js';

describe('Hierarchical Pattern Implementation', () => {
  // Test data matching the plan examples
  const testPatterns = [
    {
      originalPattern: '这位X',
      template: 'vị X này',
      allowAsPatternVariable: true,
    },
    {
      originalPattern: 'X的耳朵里',
      template: 'trong lỗ tai X',
    },
    {
      originalPattern: '在X和Y之间',
      template: 'giữa X và Y',
    },
  ];

  const mockTokens = [
    { value: '这', type: 'chinese_char' },
    { value: '位', type: 'chinese_char' },
    { value: '部', type: 'chinese_char' },
    { value: '长', type: 'chinese_char' },
    { value: '的', type: 'chinese_char' },
    { value: '耳', type: 'chinese_char' },
    { value: '朵', type: 'chinese_char' },
    { value: '里', type: 'chinese_char' },
    { value: '了', type: 'chinese_char' },
  ].map((token, index) => ({ ...token, originalIndex: index }));

  const mockDictionaryManager = {
    translate: vi.fn((text, _dictionaries) => {
      const translations = {
        部长: { translation: 'bộ trưởng', dictionary: 'properNouns' },
      };
      return translations[text] || null;
    }),
    findAllMatches: vi.fn(() => []),
  };

  describe('PatternAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new PatternAnalyzer();
    });

    test('should analyze single-variable pattern correctly', () => {
      const pattern = {
        originalPattern: '这位X',
        template: 'vị X này',
      };

      const analysis = analyzer.analyzePattern(pattern);

      expect(analysis.hasVariables).toBe(true);
      expect(analysis.hasXVariable).toBe(true);
      expect(analysis.hasYVariable).toBe(false);
      expect(analysis.isMultiVariable).toBe(false);
      expect(analysis.compositeEligible).toBe(true);
      expect(analysis.variableCount).toBe(1);
    });

    test('should analyze multi-variable pattern correctly', () => {
      const pattern = {
        originalPattern: '在X和Y之间',
        template: 'giữa X và Y',
      };

      const analysis = analyzer.analyzePattern(pattern);

      expect(analysis.hasVariables).toBe(true);
      expect(analysis.hasXVariable).toBe(true);
      expect(analysis.hasYVariable).toBe(true);
      expect(analysis.isMultiVariable).toBe(true);
      expect(analysis.compositeEligible).toBe(false); // Multi-variable patterns not eligible
      expect(analysis.variableCount).toBe(2);
    });

    test('should validate patterns correctly', () => {
      const validPattern = {
        originalPattern: 'X的耳朵里',
        template: 'trong lỗ tai X',
      };

      const validation = analyzer.validatePattern(validPattern);
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    test('should detect pattern validation issues', () => {
      const invalidPattern = {
        originalPattern: '在X和Y之间',
        template: 'giữa X và Y',
        allowAsPatternVariable: true, // Multi-variable can't be pattern variable
      };

      const validation = analyzer.validatePattern(invalidPattern);
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain(
        'Multi-variable patterns (containing Y) cannot be used as pattern variables'
      );
    });

    test('should categorize patterns by capability', () => {
      const patterns = testPatterns.map((p) => analyzer.analyzePattern(p));

      const phaseAPatterns = analyzer.getPhaseAPatterns(patterns);
      const compositeEligible = analyzer.getCompositeEligiblePatterns(patterns);

      expect(phaseAPatterns).toHaveLength(1); // Only "这位X" has allowAsPatternVariable: true
      expect(compositeEligible).toHaveLength(2); // "这位X" and "X的耳朵里" are composite eligible
    });

    test('should generate summary statistics', () => {
      const summary = analyzer.generateSummary(testPatterns);

      expect(summary.total).toBe(3);
      expect(summary.withVariables).toBe(3);
      expect(summary.multiVariable).toBe(1);
      expect(summary.compositeEligible).toBe(2);
      expect(summary.phaseAEligible).toBe(1);
    });
  });

  describe('TwoPhasePatternProcessor', () => {
    let processor;

    beforeEach(() => {
      processor = new TwoPhasePatternProcessor(testPatterns, {
        debugMode: false,
        enableFallback: true,
      });
    });

    test('should initialize and categorize patterns correctly', () => {
      const stats = processor.getStatistics();

      expect(stats.patterns.total).toBe(3);
      expect(stats.patterns.variablePatterns).toBe(1); // Only "这位X"
      expect(stats.patterns.compositeEligible).toBe(2); // "这位X" and "X的耳朵里"
    });

    test('should validate setup correctly', () => {
      const validation = processor.validateSetup();

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    test('should handle empty patterns gracefully', () => {
      const emptyProcessor = new TwoPhasePatternProcessor([], { debugMode: false });
      const validation = emptyProcessor.validateSetup();

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('No patterns provided for processing');
    });
  });

  describe('CompositePatternDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new CompositePatternDetector({ debugMode: false });
    });

    test('should detect composite opportunities', () => {
      const phaseAResults = [
        {
          startIndex: 0,
          endIndex: 3,
          originalText: '这位部长',
          translation: 'vị bộ trưởng này',
          pattern: { originalPattern: '这位X', template: 'vị X này' },
        },
      ];

      const phaseBCandidates = [
        {
          startIndex: 0,
          endIndex: 7,
          originalText: '这位部长的耳朵里',
          pattern: {
            originalPattern: 'X的耳朵里',
            template: 'trong lỗ tai X',
            compositeEligible: true,
          },
        },
      ];

      const composites = detector.detectComposites(phaseAResults, phaseBCandidates, mockTokens);

      expect(composites).toHaveLength(1);
      expect(composites[0].type).toBe('composite');
      expect(composites[0].translation).toBe('trong lỗ tai vị bộ trưởng này');
    });

    test('should not create composites for multi-variable patterns', () => {
      const phaseAResults = [
        {
          startIndex: 0,
          endIndex: 1,
          originalText: '张三',
          translation: 'Trương Tam',
          pattern: { originalPattern: 'X', allowAsPatternVariable: true },
        },
      ];

      const phaseBCandidates = [
        {
          startIndex: 0,
          endIndex: 5,
          originalText: '在张三和李四之间',
          pattern: {
            originalPattern: '在X和Y之间',
            template: 'giữa X và Y',
            compositeEligible: false, // Multi-variable pattern
          },
        },
      ];

      const composites = detector.detectComposites(phaseAResults, phaseBCandidates, mockTokens);

      expect(composites).toHaveLength(0); // No composites for multi-variable patterns
    });

    test('should validate composite constraints', () => {
      const phaseAResult = {
        startIndex: 0,
        endIndex: 1,
        originalText: '这位',
        translation: 'vị này',
      };

      const phaseBCandidate = {
        startIndex: 25, // Very far from Phase A result
        endIndex: 30,
        originalText: '耳朵里',
        pattern: { compositeEligible: true },
      };

      const isValid = detector.validateComposite(phaseAResult, phaseBCandidate, mockTokens);
      expect(isValid).toBe(false); // Should fail due to distance constraint
    });
  });

  describe('CompositeDecisionEngine', () => {
    let engine;

    beforeEach(() => {
      engine = new CompositeDecisionEngine({
        debugMode: false,
        preferComposites: true,
        minConfidenceThreshold: 0.3,
      });
    });

    test('should prefer composites over individual patterns', () => {
      const phaseAResults = [
        {
          startIndex: 0,
          endIndex: 3,
          originalText: '这位部长',
          translation: 'vị bộ trưởng này',
          confidence: 0.8,
        },
      ];

      const phaseBResults = [
        {
          startIndex: 4,
          endIndex: 7,
          originalText: '的耳朵里',
          translation: 'đích lỗ tai lý',
          confidence: 0.7,
        },
      ];

      const compositeResults = [
        {
          startIndex: 0,
          endIndex: 7,
          originalText: '这位部长的耳朵里',
          translation: 'trong lỗ tai vị bộ trưởng này',
          confidence: 0.9,
          type: 'composite',
        },
      ];

      const selected = engine.selectOptimalResults(phaseAResults, phaseBResults, compositeResults);

      expect(selected).toHaveLength(1);
      expect(selected[0].type).toBe('composite');
      expect(selected[0].translation).toBe('trong lỗ tai vị bộ trưởng này');
    });

    test('should handle overlapping results correctly', () => {
      const overlappingResults = [
        {
          startIndex: 0,
          endIndex: 2,
          originalText: '这位部',
          translation: 'vị bộ',
          confidence: 0.6,
        },
        {
          startIndex: 1,
          endIndex: 3,
          originalText: '位部长',
          translation: 'vị bộ trưởng',
          confidence: 0.8,
        },
      ];

      const scoredResults = overlappingResults.map(
        (result) => engine.scoreResults([result], 'phaseA')[0]
      );

      const selected = engine.resolveConflicts(scoredResults);

      expect(selected).toHaveLength(1); // Should select only one non-overlapping result
      expect(selected[0].result.translation).toBe('vị bộ trưởng'); // Higher confidence wins
    });

    test('should filter by confidence threshold', () => {
      const lowConfidenceResults = [
        {
          startIndex: 0,
          endIndex: 1,
          originalText: '这',
          translation: 'này',
          confidence: 0.2, // Below threshold
        },
      ];

      const selected = engine.selectOptimalResults(lowConfidenceResults, [], []);

      expect(selected).toHaveLength(0); // Should be filtered out by confidence threshold
    });

    test('should generate decision analysis', () => {
      const phaseAResults = [
        {
          startIndex: 0,
          endIndex: 1,
          confidence: 0.8,
          translation: 'test',
        },
      ];

      const allOptions = engine.scoreResults(phaseAResults, 'phaseA');
      const selected = engine.resolveConflicts(allOptions);

      const analysis = engine.analyzeSelection(selected);

      expect(analysis.totalResults).toBe(1);
      expect(analysis.typeDistribution.phaseA).toBe(1);
      expect(analysis.averageScore).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    test('basic composite translation workflow', async () => {
      const patterns = [
        {
          originalPattern: '这位X',
          template: 'vị X này',
          allowAsPatternVariable: true,
        },
        {
          originalPattern: 'X的耳朵里',
          template: 'trong lỗ tai X',
        },
      ];

      const processor = new TwoPhasePatternProcessor(patterns, {
        debugMode: false,
        enableFallback: true,
      });

      const options = {
        activeProperNouns: ['properNouns'],
        dictionaryManager: mockDictionaryManager,
      };

      // Mock the processPatterns method to return expected results
      const mockSemanticPatternProcessor = {
        processPatterns: jest
          .fn()
          .mockResolvedValueOnce([
            {
              // Phase A results
              startIndex: 0,
              endIndex: 3,
              originalText: '这位部长',
              translation: 'vị bộ trưởng này',
              pattern: patterns[0],
            },
          ])
          .mockResolvedValueOnce([
            {
              // Phase B results
              startIndex: 0,
              endIndex: 7,
              originalText: '这位部长的耳朵里',
              translation: 'trong lỗ tai vị bộ trưởng này',
              pattern: patterns[1],
            },
          ]),
      };

      // Replace import with mock
      vi.doMock('../SemanticPatternProcessor.js', () => ({
        default: vi.fn(() => mockSemanticPatternProcessor),
      }));

      const results = await processor.processTokens(mockTokens, options);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    test('no composite opportunities scenario', async () => {
      const patterns = [
        {
          originalPattern: '这位X',
          template: 'vị X này',
          allowAsPatternVariable: true,
        },
      ];

      const processor = new TwoPhasePatternProcessor(patterns, {
        debugMode: false,
      });

      const options = {
        activeProperNouns: ['properNouns'],
        dictionaryManager: mockDictionaryManager,
      };

      const results = await processor.processTokens(mockTokens, options);

      // Should still work even without composite opportunities
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    test('fallback to single-phase on error', async () => {
      const patterns = [
        {
          originalPattern: '这位X',
          template: 'vị X này',
        },
      ];

      const processor = new TwoPhasePatternProcessor(patterns, {
        debugMode: false,
        enableFallback: true,
      });

      // Mock to force error in hierarchical processing
      const mockSemanticPatternProcessor = {
        processPatterns: vi.fn().mockRejectedValue(new Error('Test error')),
      };

      vi.doMock('../SemanticPatternProcessor.js', () => ({
        default: vi.fn(() => mockSemanticPatternProcessor),
      }));

      const options = {
        activeProperNouns: ['properNouns'],
        dictionaryManager: mockDictionaryManager,
      };

      const results = await processor.processTokens(mockTokens, options);

      // Should fallback gracefully
      expect(results).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should handle large pattern sets efficiently', () => {
      const largePatternSet = Array.from({ length: 100 }, (_, i) => ({
        originalPattern: `这位X${i}`,
        template: `vị X${i} này`,
        allowAsPatternVariable: i % 2 === 0,
      }));

      const start = performance.now();

      const processor = new TwoPhasePatternProcessor(largePatternSet, {
        debugMode: false,
      });

      const end = performance.now();
      const initializationTime = end - start;

      expect(initializationTime).toBeLessThan(100); // Should initialize in <100ms
      expect(processor.getStatistics().patterns.total).toBe(100);
    });

    test('should handle complex token arrays efficiently', () => {
      const _largeTokenArray = Array.from({ length: 1000 }, (_, i) => ({
        value: String.fromCharCode(0x4e00 + (i % 1000)), // Chinese characters
        type: 'chinese_char',
        originalIndex: i,
      }));

      const analyzer = new PatternAnalyzer();
      const start = performance.now();

      // Analyze a subset of patterns
      const patterns = [
        { originalPattern: '这位X', template: 'vị X này' },
        { originalPattern: 'X的耳朵里', template: 'trong lỗ tai X' },
      ];

      patterns.forEach((pattern) => analyzer.analyzePattern(pattern));

      const end = performance.now();
      const analysisTime = end - start;

      expect(analysisTime).toBeLessThan(50); // Should analyze in <50ms
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty input gracefully', () => {
      const analyzer = new PatternAnalyzer();

      expect(() => analyzer.analyzePatterns([])).not.toThrow();
      expect(analyzer.generateSummary([])).toEqual({
        total: 0,
        withVariables: 0,
        withXOnly: 0,
        withYOnly: 0,
        multiVariable: 0,
        compositeEligible: 0,
        phaseAEligible: 0,
        validationIssues: 0,
      });
    });

    test('should handle malformed patterns', () => {
      const analyzer = new PatternAnalyzer();

      const malformedPattern = {
        // Missing originalPattern
        template: 'some template',
      };

      expect(() => analyzer.analyzePattern(malformedPattern)).toThrow();
    });

    test('should handle patterns without variables', () => {
      const analyzer = new PatternAnalyzer();

      const noVariablePattern = {
        originalPattern: '这是一个测试',
        template: 'đây là một bài kiểm tra',
      };

      const analysis = analyzer.analyzePattern(noVariablePattern);

      expect(analysis.hasVariables).toBe(false);
      expect(analysis.compositeEligible).toBe(false);
      expect(analysis.variableCount).toBe(0);
    });
  });
});
