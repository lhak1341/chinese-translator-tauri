import { describe, it, expect, beforeEach } from 'vitest';
import AdaptiveChunker from '../text/AdaptiveChunker.js';

describe('AdaptiveChunker', () => {
  let chunker;

  beforeEach(() => {
    chunker = new AdaptiveChunker();
  });

  describe('calculateProperNounDensity', () => {
    it('is higher for text broken into many short punctuation-delimited runs than one long uninterrupted run of the same characters', () => {
      const manyShortSentences =
        '他去。她走。你来。我留。他去。她走。你来。我留。他去。她走。你来。我留。'.repeat(3);
      const oneLongSentence =
        '他去她走你来我留他去她走你来我留他去她走你来我留他去她走你来我留他去她走你来我留他去她走你来我留他去她走你来我留他去她走你来我留他去她走你来我留。';

      expect(chunker.calculateProperNounDensity(manyShortSentences)).toBeGreaterThan(
        chunker.calculateProperNounDensity(oneLongSentence)
      );
    });

    it('returns 0 for text with no punctuation-delimited CJK run', () => {
      expect(chunker.calculateProperNounDensity('你好世界')).toBe(0);
    });
  });

  describe('calculateTechnicalTermDensity', () => {
    it('is higher for text with dates/percentages/chapter markers and long compound runs than plain short-run text', () => {
      const plain = '他去,她来,你走,我留,'.repeat(10);
      const technical = plain + '第一章记载2024年发生的事情占比50%的数据。';

      expect(chunker.calculateTechnicalTermDensity(technical)).toBeGreaterThan(
        chunker.calculateTechnicalTermDensity(plain)
      );
    });
  });

  describe('calculateAverageSentenceLength', () => {
    it('returns 0 for empty text', () => {
      expect(chunker.calculateAverageSentenceLength('')).toBe(0);
    });

    it('is higher for long sentences than short ones', () => {
      const short = '他去了。她也走了。';
      const long = '他今天早上很早就起床然后去了很远的地方办事情结果很晚才回来。';

      expect(chunker.calculateAverageSentenceLength(long)).toBeGreaterThan(
        chunker.calculateAverageSentenceLength(short)
      );
    });
  });

  describe('calculatePunctuationDensity', () => {
    it('returns 0 for text with no punctuation', () => {
      expect(chunker.calculatePunctuationDensity('他去了她也走了你也来吧我们一起走')).toBe(0);
    });

    it('is capped at 0.5 for very dense punctuation', () => {
      expect(chunker.calculatePunctuationDensity('，。！？；：、'.repeat(20))).toBe(0.5);
    });
  });

  describe('calculateChunkVariance', () => {
    it('returns 0 for fewer than 2 chunks', () => {
      expect(chunker.calculateChunkVariance([{ content: 'abc' }])).toBe(0);
      expect(chunker.calculateChunkVariance([])).toBe(0);
    });

    it('returns 0 for uniform-length chunks', () => {
      const chunks = [{ content: 'abcde' }, { content: 'fghij' }, { content: 'klmno' }];
      expect(chunker.calculateChunkVariance(chunks)).toBe(0);
    });

    it('is greater than 0 for chunks of varied length', () => {
      const chunks = [{ content: 'a' }, { content: 'abcdefghij' }, { content: 'ab' }];
      expect(chunker.calculateChunkVariance(chunks)).toBeGreaterThan(0);
    });
  });

  describe('estimateDictionaryHitRate', () => {
    it('is higher for text made of common characters than rare characters', () => {
      const common = '的是了不在有个人这中大为上';
      const rare = '鲲鹏鹦鹉蝙蝠蜈蚣蟋蟀螳螂蜘蛛';

      expect(chunker.estimateDictionaryHitRate(common)).toBeGreaterThan(
        chunker.estimateDictionaryHitRate(rare)
      );
    });

    it('is capped at 0.95', () => {
      expect(chunker.estimateDictionaryHitRate('的'.repeat(50))).toBe(0.95);
    });
  });

  describe('determineChunkingStrategy', () => {
    it('returns aggressive below the simple threshold', () => {
      expect(chunker.determineChunkingStrategy({ complexity: 0.3 })).toBe('aggressive');
    });

    it('returns standard between simple and moderate thresholds', () => {
      expect(chunker.determineChunkingStrategy({ complexity: 0.7 })).toBe('standard');
    });

    it('returns conservative between moderate and complex thresholds', () => {
      expect(chunker.determineChunkingStrategy({ complexity: 1.2 })).toBe('conservative');
    });

    it('returns careful at or above the complex threshold', () => {
      expect(chunker.determineChunkingStrategy({ complexity: 1.8 })).toBe('careful');
      expect(chunker.determineChunkingStrategy({ complexity: 2.5 })).toBe('careful');
    });
  });

  describe('generateOptimizationRecommendations', () => {
    it('recommends dictionary preloading when vocabulary complexity is high', () => {
      const analysis = {
        complexity: 1.0,
        factors: { vocabularyComplexity: 0.8, dictionaryHitRate: 0.9, structuralComplexity: 0.5 },
        chunkingStrategy: 'standard',
      };
      const recs = chunker.generateOptimizationRecommendations(analysis);
      expect(recs.priorityOptimizations.some((o) => o.type === 'dictionary_preloading')).toBe(true);
    });

    it('recommends dictionary expansion when hit rate is low', () => {
      const analysis = {
        complexity: 1.0,
        factors: { vocabularyComplexity: 0.2, dictionaryHitRate: 0.3, structuralComplexity: 0.5 },
        chunkingStrategy: 'standard',
      };
      const recs = chunker.generateOptimizationRecommendations(analysis);
      expect(recs.priorityOptimizations.some((o) => o.type === 'dictionary_expansion')).toBe(true);
    });

    it('recommends conservative processing when structural complexity is high', () => {
      const analysis = {
        complexity: 1.0,
        factors: { vocabularyComplexity: 0.2, dictionaryHitRate: 0.9, structuralComplexity: 1.8 },
        chunkingStrategy: 'standard',
      };
      const recs = chunker.generateOptimizationRecommendations(analysis);
      expect(recs.priorityOptimizations.some((o) => o.type === 'conservative_processing')).toBe(
        true
      );
    });

    it('sets faster performance expectations for low complexity', () => {
      const analysis = {
        complexity: 0.5,
        factors: { vocabularyComplexity: 0.1, dictionaryHitRate: 0.9, structuralComplexity: 0.1 },
        chunkingStrategy: 'aggressive',
      };
      const recs = chunker.generateOptimizationRecommendations(analysis);
      expect(recs.performanceExpectations.relativeSpeed).toBe('110-130%');
    });

    it('sets reduced-speed, improved-accuracy expectations for high complexity', () => {
      const analysis = {
        complexity: 2.0,
        factors: { vocabularyComplexity: 0.9, dictionaryHitRate: 0.2, structuralComplexity: 1.9 },
        chunkingStrategy: 'careful',
      };
      const recs = chunker.generateOptimizationRecommendations(analysis);
      expect(recs.performanceExpectations.relativeSpeed).toBe('70-85%');
    });
  });

  describe('analyzeContentCharacteristics', () => {
    it('classifies simple text with a low-complexity strategy', () => {
      const simple = '他去了。她也走了。你也来吧。';
      const analysis = chunker.analyzeContentCharacteristics(simple, [{ content: simple }]);
      expect(analysis.chunkingStrategy).toBe('aggressive');
    });

    it('classifies dense technical text with a higher-complexity strategy than simple text', () => {
      const simple = '他去了。她也走了。你也来吧。';
      const technical =
        '第一章记载着复杂的长篇专业术语组合词汇结构体系分析报告2024年占比50%的鲲鹏鹦鹉蝙蝠蜈蚣蟋蟀螳螂蜘蛛相关内容。';

      const simpleAnalysis = chunker.analyzeContentCharacteristics(simple, [{ content: simple }]);
      const technicalAnalysis = chunker.analyzeContentCharacteristics(technical, [
        { content: technical },
      ]);

      expect(technicalAnalysis.complexity).toBeGreaterThan(simpleAnalysis.complexity);
    });
  });

  describe('calculateOptimalChunkSize', () => {
    it('returns maxChunkSize for the aggressive strategy', () => {
      const size = chunker.calculateOptimalChunkSize({
        complexity: 0.3,
        chunkingStrategy: 'aggressive',
      });
      expect(size).toBe(chunker.options.maxChunkSize);
    });

    it('returns the midpoint for the standard strategy', () => {
      const size = chunker.calculateOptimalChunkSize({
        complexity: 0.7,
        chunkingStrategy: 'standard',
      });
      expect(size).toBe(
        Math.ceil((chunker.options.minChunkSize + chunker.options.maxChunkSize) / 2)
      );
    });

    it('returns minChunkSize for the careful strategy', () => {
      const size = chunker.calculateOptimalChunkSize({
        complexity: 1.8,
        chunkingStrategy: 'careful',
      });
      expect(size).toBe(chunker.options.minChunkSize);
    });

    it('reduces size under high memory pressure, clamped to minChunkSize', () => {
      const withoutPressure = chunker.calculateOptimalChunkSize(
        { complexity: 0.3, chunkingStrategy: 'aggressive' },
        {}
      );
      const withPressure = chunker.calculateOptimalChunkSize(
        { complexity: 0.3, chunkingStrategy: 'aggressive' },
        { memoryPressure: 'high' }
      );
      expect(withPressure).toBeLessThan(withoutPressure);
      expect(withPressure).toBeGreaterThanOrEqual(chunker.options.minChunkSize);
    });

    it('reduces size when cpuCores is below 4', () => {
      const withoutLimit = chunker.calculateOptimalChunkSize(
        { complexity: 0.3, chunkingStrategy: 'aggressive' },
        {}
      );
      const withLowCores = chunker.calculateOptimalChunkSize(
        { complexity: 0.3, chunkingStrategy: 'aggressive' },
        { cpuCores: 2 }
      );
      expect(withLowCores).toBeLessThan(withoutLimit);
    });

    it('always stays within [minChunkSize, maxChunkSize]', () => {
      const size = chunker.calculateOptimalChunkSize(
        { complexity: 0.3, chunkingStrategy: 'aggressive' },
        { memoryPressure: 'high', cpuCores: 1 }
      );
      expect(size).toBeGreaterThanOrEqual(chunker.options.minChunkSize);
      expect(size).toBeLessThanOrEqual(chunker.options.maxChunkSize);
    });

    it('nudges size down when performance trend is degrading with high confidence', () => {
      // Strictly decreasing efficiency -> negative slope, high correlation/confidence.
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 100,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 100,
        throughput: 8,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 100,
        throughput: 6,
        memoryUsage: 0,
      });

      const trend = chunker.analyzePerformanceTrend();
      expect(trend.direction).toBe('degrading');

      const baseline = new AdaptiveChunker().calculateOptimalChunkSize({
        complexity: 0.3,
        chunkingStrategy: 'aggressive',
      });
      const adapted = chunker.calculateOptimalChunkSize({
        complexity: 0.3,
        chunkingStrategy: 'aggressive',
      });
      expect(adapted).toBeLessThanOrEqual(baseline);
    });

    it('does not adapt when performance trend confidence is NaN (flat efficiency history)', () => {
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 100,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 100,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 100,
        throughput: 10,
        memoryUsage: 0,
      });

      const trend = chunker.analyzePerformanceTrend();
      expect(trend.confidence).toBeNaN();

      const baseline = new AdaptiveChunker().calculateOptimalChunkSize({
        complexity: 0.3,
        chunkingStrategy: 'aggressive',
      });
      const withFlatHistory = chunker.calculateOptimalChunkSize({
        complexity: 0.3,
        chunkingStrategy: 'aggressive',
      });
      expect(withFlatHistory).toBe(baseline);
    });
  });

  describe('recordPerformance', () => {
    it('appends a record with computed efficiency', () => {
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 50,
        throughput: 20,
        memoryUsage: 100,
      });
      expect(chunker.performanceHistory).toHaveLength(1);
      expect(chunker.performanceHistory[0].efficiency).toBe(2);
    });

    it('maintains a sliding window of performanceWindow size', () => {
      for (let i = 0; i < chunker.options.performanceWindow + 3; i++) {
        chunker.recordPerformance({
          chunkSize: 10,
          processingTime: 10,
          throughput: i,
          memoryUsage: 0,
        });
      }
      expect(chunker.performanceHistory).toHaveLength(chunker.options.performanceWindow);
      // Oldest records should have been shifted out.
      expect(chunker.performanceHistory[0].throughput).toBe(3);
    });
  });

  describe('analyzePerformanceTrend', () => {
    it('returns unknown with 0 confidence for fewer than 3 records', () => {
      expect(chunker.analyzePerformanceTrend()).toEqual({ direction: 'unknown', confidence: 0 });

      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 12,
        memoryUsage: 0,
      });
      expect(chunker.analyzePerformanceTrend()).toEqual({ direction: 'unknown', confidence: 0 });
    });

    it('detects an improving trend for increasing efficiency', () => {
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 6,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 8,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 10,
        memoryUsage: 0,
      });

      expect(chunker.analyzePerformanceTrend().direction).toBe('improving');
    });

    it('detects a degrading trend for decreasing efficiency', () => {
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 8,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 6,
        memoryUsage: 0,
      });

      expect(chunker.analyzePerformanceTrend().direction).toBe('degrading');
    });

    it('produces NaN confidence (not a thrown error) for flat efficiency history', () => {
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 10,
        memoryUsage: 0,
      });
      chunker.recordPerformance({
        chunkSize: 10,
        processingTime: 10,
        throughput: 10,
        memoryUsage: 0,
      });

      const trend = chunker.analyzePerformanceTrend();
      expect(trend.direction).toBe('stable');
      expect(trend.confidence).toBeNaN();
    });
  });
});
