/**
 * Adaptive Chunker - Smart Chunk Size Optimization
 *
 * Dynamically adjusts chunk processing sizes based on:
 * - Content complexity (proper nouns, patterns, technical terms)
 * - Device performance characteristics
 * - Real-time processing performance
 * - Memory usage patterns
 * - Text structure analysis
 */

import { batchLog } from '../BatchLogger.js';

class AdaptiveChunker {
  constructor(options = {}) {
    this.options = {
      minChunkSize: options.minChunkSize || 8,
      maxChunkSize: options.maxChunkSize || 20,
      performanceWindow: options.performanceWindow || 5, // Track last 5 batches for adaptation
      adaptationSensitivity: options.adaptationSensitivity || 0.2, // How quickly to adapt (0.1 = conservative, 0.5 = aggressive)
      complexityThresholds: {
        simple: 0.5, // Simple conversational text
        moderate: 1.0, // Mixed content with some technical terms
        complex: 1.5, // Dense technical/literary content
        veryComplex: 2.0, // Academic/highly technical content
      },
      ...options,
    };

    // Performance tracking for adaptive sizing
    this.performanceHistory = [];
  }

  /**
   * Analyze content characteristics beyond basic complexity
   * @param {string} text - Full text to analyze
   * @param {Array} chunks - Text chunks from TextChunker
   * @returns {Object} Enhanced complexity analysis
   */
  analyzeContentCharacteristics(text, chunks) {
    const analysis = {
      complexity: 0,
      factors: {},
      chunkingStrategy: 'standard',
    };

    // Factor 1: Vocabulary complexity (proper nouns, technical terms)
    const properNounDensity = this.calculateProperNounDensity(text);
    const technicalTermDensity = this.calculateTechnicalTermDensity(text);
    analysis.factors.vocabularyComplexity = (properNounDensity + technicalTermDensity) / 2;

    // Factor 2: Sentence structure complexity
    const avgSentenceLength = this.calculateAverageSentenceLength(text);
    const structuralComplexity = Math.min(avgSentenceLength / 20, 2.0); // Normalize to 0-2.0
    analysis.factors.structuralComplexity = structuralComplexity;

    // Factor 3: Punctuation density (affects chunking efficiency)
    const punctuationDensity = this.calculatePunctuationDensity(text);
    analysis.factors.punctuationDensity = punctuationDensity;

    // Factor 4: Chunk size variance (indicates content heterogeneity)
    const chunkVariance = this.calculateChunkVariance(chunks);
    analysis.factors.chunkVariance = chunkVariance;

    // Factor 5: Dictionary hit rate estimation (based on character frequency)
    const dictionaryHitEstimate = this.estimateDictionaryHitRate(text);
    analysis.factors.dictionaryHitRate = dictionaryHitEstimate;

    // Calculate overall complexity score
    analysis.complexity =
      analysis.factors.vocabularyComplexity * 0.3 +
      analysis.factors.structuralComplexity * 0.25 +
      analysis.factors.punctuationDensity * 0.15 +
      analysis.factors.chunkVariance * 0.15 +
      (1 - analysis.factors.dictionaryHitRate) * 0.15; // Lower hit rate = higher complexity

    // Determine chunking strategy based on analysis
    analysis.chunkingStrategy = this.determineChunkingStrategy(analysis);

    batchLog.verbose(
      'adaptive-chunker-analysis',
      `Content analysis complete: complexity=${analysis.complexity.toFixed(2)}, strategy=${analysis.chunkingStrategy}`,
      analysis.factors
    );

    return analysis;
  }

  /**
   * Calculate proper noun density in text
   * @param {string} text - Input text
   * @returns {number} Proper noun density (0-1)
   */
  calculateProperNounDensity(text) {
    // Match potential proper nouns (capitalized Chinese characters after punctuation)
    // This is a heuristic - actual proper noun detection would require dictionary lookup
    const properNounPattern = /[。！？：；]\s*([A-Z\u4e00-\u9fff]{2,})/g;
    const matches = text.match(properNounPattern) || [];
    return Math.min(matches.length / (text.length / 100), 1.0);
  }

  /**
   * Calculate technical term density
   * @param {string} text - Input text
   * @returns {number} Technical term density (0-1)
   */
  calculateTechnicalTermDensity(text) {
    // Heuristic: look for patterns that suggest technical content
    const technicalPatterns = [
      /[\u4e00-\u9fff]{4,}/g, // Long Chinese compound words
      /[0-9]+[%％]/g, // Percentages
      /[0-9]+[年月日]/g, // Dates
      /第[一二三四五六七八九十百千万]+[章节回]/g, // Chapter/section markers
    ];

    let technicalMatches = 0;
    technicalPatterns.forEach((pattern) => {
      const matches = text.match(pattern) || [];
      technicalMatches += matches.length;
    });

    return Math.min(technicalMatches / (text.length / 50), 1.0);
  }

  /**
   * Calculate average sentence length
   * @param {string} text - Input text
   * @returns {number} Average sentence length in characters
   */
  calculateAverageSentenceLength(text) {
    const sentences = text.split(/[。！？]/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const totalLength = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
    return totalLength / sentences.length;
  }

  /**
   * Calculate punctuation density
   * @param {string} text - Input text
   * @returns {number} Punctuation density (0-1)
   */
  calculatePunctuationDensity(text) {
    const punctuationPattern = /[，。！？；：、""''（）《》【】]/g;
    const matches = text.match(punctuationPattern) || [];
    return Math.min(matches.length / text.length, 0.5); // Cap at 0.5 for normalization
  }

  /**
   * Calculate chunk size variance
   * @param {Array} chunks - Text chunks
   * @returns {number} Normalized variance (0-1)
   */
  calculateChunkVariance(chunks) {
    if (chunks.length < 2) return 0;

    const lengths = chunks.map((chunk) => chunk.content.length);
    const mean = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const variance =
      lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;

    // Normalize variance relative to mean length
    return Math.min(Math.sqrt(variance) / mean, 1.0);
  }

  /**
   * Estimate dictionary hit rate based on character frequency
   * @param {string} text - Input text
   * @returns {number} Estimated hit rate (0-1)
   */
  estimateDictionaryHitRate(text) {
    // Common Chinese characters have higher dictionary hit rates
    // This is a rough heuristic based on character frequency patterns
    const commonCharPattern =
      /[的是了不在有个人这中大为上国我以要他时来用于下自己就会么说出所][的是了不在有个人这中大为上国我以要他时来用于下自己就会么说出所]*/g;
    const commonMatches = text.match(commonCharPattern) || [];
    const commonCharRatio = commonMatches.join('').length / text.length;

    // Higher ratio of common characters suggests higher dictionary hit rate
    return Math.min(commonCharRatio * 1.2, 0.95); // Cap at 95% hit rate
  }

  /**
   * Determine optimal chunking strategy based on content analysis
   * @param {Object} analysis - Content analysis results
   * @returns {string} Chunking strategy
   */
  determineChunkingStrategy(analysis) {
    const { complexity } = analysis;
    const { complexityThresholds } = this.options;

    if (complexity < complexityThresholds.simple) {
      return 'aggressive'; // Large chunks for simple content
    } else if (complexity < complexityThresholds.moderate) {
      return 'standard'; // Standard chunks for moderate content
    } else if (complexity < complexityThresholds.complex) {
      return 'conservative'; // Smaller chunks for complex content
    } else {
      return 'careful'; // Very small chunks for very complex content
    }
  }

  /**
   * Calculate optimal chunk size based on content analysis and performance history
   * @param {Object} contentAnalysis - Content analysis results
   * @param {Object} deviceInfo - Device performance characteristics
   * @param {number} totalChunks - Total number of chunks to process
   * @returns {number} Optimal chunk size
   */
  calculateOptimalChunkSize(contentAnalysis, deviceInfo = {}, _totalChunks = 0) {
    const { complexity, chunkingStrategy } = contentAnalysis;

    // Base chunk size from strategy
    let baseSize;
    switch (chunkingStrategy) {
      case 'aggressive':
        baseSize = this.options.maxChunkSize;
        break;
      case 'standard':
        baseSize = Math.ceil((this.options.minChunkSize + this.options.maxChunkSize) / 2);
        break;
      case 'conservative':
        baseSize = Math.ceil(this.options.maxChunkSize * 0.7);
        break;
      case 'careful':
        baseSize = this.options.minChunkSize;
        break;
      default:
        baseSize = this.options.maxChunkSize;
    }

    // Adjust based on device characteristics
    if (deviceInfo.memoryPressure === 'high') {
      baseSize = Math.max(this.options.minChunkSize, Math.ceil(baseSize * 0.8));
    }

    if (deviceInfo.cpuCores && deviceInfo.cpuCores < 4) {
      baseSize = Math.max(this.options.minChunkSize, Math.ceil(baseSize * 0.9));
    }

    // Apply performance history adaptation
    if (this.performanceHistory.length >= 2) {
      const performanceTrend = this.analyzePerformanceTrend();
      if (performanceTrend.direction === 'degrading' && performanceTrend.confidence > 0.7) {
        baseSize = Math.max(this.options.minChunkSize, baseSize - 1);
      } else if (performanceTrend.direction === 'improving' && performanceTrend.confidence > 0.8) {
        baseSize = Math.min(this.options.maxChunkSize, baseSize + 1);
      }
    }

    // Ensure within bounds
    const finalSize = Math.max(
      this.options.minChunkSize,
      Math.min(this.options.maxChunkSize, baseSize)
    );

    batchLog.info(
      'adaptive-chunker-sizing',
      `Optimal chunk size calculated: ${finalSize} (strategy: ${chunkingStrategy}, complexity: ${complexity.toFixed(2)})`
    );

    return finalSize;
  }

  /**
   * Record performance data for adaptation
   * @param {Object} performanceData - Batch performance metrics
   */
  recordPerformance(performanceData) {
    const record = {
      chunkSize: performanceData.chunkSize,
      processingTime: performanceData.processingTime,
      throughput: performanceData.throughput, // chunks/second
      memoryUsage: performanceData.memoryUsage,
      timestamp: Date.now(),
      efficiency: performanceData.throughput / performanceData.chunkSize, // normalized efficiency
    };

    this.performanceHistory.push(record);

    // Maintain sliding window
    if (this.performanceHistory.length > this.options.performanceWindow) {
      this.performanceHistory.shift();
    }

    batchLog.hotVerbose(
      'adaptive-chunker-perf',
      `Performance recorded: size=${record.chunkSize}, throughput=${record.throughput.toFixed(2)}, efficiency=${record.efficiency.toFixed(3)}`
    );
  }

  /**
   * Analyze performance trend for adaptive sizing
   * @returns {Object} Performance trend analysis
   */
  analyzePerformanceTrend() {
    if (this.performanceHistory.length < 3) {
      return { direction: 'unknown', confidence: 0 };
    }

    const recentPerformance = this.performanceHistory.slice(-3);
    const efficiencies = recentPerformance.map((record) => record.efficiency);

    // Calculate trend using linear regression on efficiency values
    const n = efficiencies.length;
    const sumX = ((n - 1) * n) / 2; // 0 + 1 + 2 + ... + (n-1)
    const sumY = efficiencies.reduce((sum, eff) => sum + eff, 0);
    const sumXY = efficiencies.reduce((sum, eff, i) => sum + i * eff, 0);
    const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6; // 0² + 1² + 2² + ... + (n-1)²

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const correlation =
      Math.abs(slope) /
      Math.sqrt(
        efficiencies.reduce((sum, eff) => {
          const avgEff = sumY / n;
          return sum + Math.pow(eff - avgEff, 2);
        }, 0) / n
      );

    return {
      direction: slope > 0.01 ? 'improving' : slope < -0.01 ? 'degrading' : 'stable',
      confidence: Math.min(correlation, 1.0),
      slope: slope,
    };
  }
}

// Export singleton instance with default configuration
export const adaptiveChunker = new AdaptiveChunker({
  minChunkSize: 8,
  maxChunkSize: 20,
  performanceWindow: 5,
  adaptationSensitivity: 0.2,
});

export default AdaptiveChunker;
