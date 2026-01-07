/**
 * Performance Monitoring and Profiling System
 * Phase 7: Comprehensive performance tracking for the translation system
 *
 * Features:
 * - Real-time performance metrics collection
 * - Bottleneck detection and analysis
 * - Memory usage monitoring
 * - Translation speed profiling
 * - Performance history and trends
 * - Memory-efficient object pooling for reduced GC pressure
 *
 * @import {
 *   TranslationMetrics,
 *   ExtremeTranslation,
 *   TextSizeMetrics,
 *   DictionaryMetrics,
 *   RenderingMetrics,
 *   MemoryMetrics,
 *   ParallelMetrics,
 *   PerformanceBottleneck,
 *   TranslationProfile,
 *   PhaseMetrics,
 *   PerformanceHistoryEntry,
 *   DetectionThresholds,
 *   PerformanceSummary,
 *   PerformanceReport,
 *   PerformanceProfilerInterface
 * } from '../types/PerformanceMonitoringTypes'
 */

import {
  getPerformanceMetric,
  releasePerformanceMetric,
  // getMemorySnapshot,
  // releaseMemorySnapshot,
  // getTimestamp,
  // releaseTimestamp
} from './DebugObjectPool.js';

export class PerformanceProfiler {
  constructor() {
    this.metrics = {
      translation: {
        totalTranslations: 0,
        totalTime: 0,
        averageTime: 0,
        throughput: 0, // characters per second
        slowestTranslation: { time: 0, text: '', length: 0 },
        fastestTranslation: { time: Infinity, text: '', length: 0 },
        byTextSize: {
          small: { count: 0, totalTime: 0, avgTime: 0 }, // <500 chars
          medium: { count: 0, totalTime: 0, avgTime: 0 }, // 500-2000 chars
          large: { count: 0, totalTime: 0, avgTime: 0 }, // 2000-8000 chars
          huge: { count: 0, totalTime: 0, avgTime: 0 }, // >8000 chars
        },
      },
      dictionary: {
        cacheHitRate: 0,
        lookupTimes: [],
        sortingStats: null, // Will be populated from DictionaryManager
      },
      rendering: {
        segmentComputeTime: 0,
        clickableRenderTime: 0,
        virtualizedRenderCount: 0,
        segmentPrecomputeTime: 0,
      },
      memory: {
        initialMemory: 0,
        currentMemory: 0,
        peakMemory: 0,
        cacheMemoryUsage: 0,
      },
      parallel: {
        chunkProcessingTime: 0,
        dictionaryLookupTime: 0,
        parallelEfficiency: 0, // Time saved vs sequential
        concurrencyLevel: 0, // Average parallel operations
        fallbackRate: 0, // Rate of fallback to sequential
        totalParallelOperations: 0,
        totalSequentialFallbacks: 0,
        avgParallelSpeedup: 0, // Speedup factor vs sequential
      },
      bottlenecks: [], // Array of detected performance issues
    };

    this.profilerStartTime = performance.now();
    this.activeProfiles = new Map(); // Track ongoing operations
    this.performanceHistory = []; // Historical data points
    this.detectionThresholds = {
      slowTranslation: 5000, // ms
      lowThroughput: 50, // chars/sec
      highMemoryUsage: 100 * 1024 * 1024, // 100MB
      lowCacheHitRate: 0.3, // 30%
    };
  }

  /**
   * Start profiling a translation operation
   * @param {string} operationId - Unique identifier for this operation
   * @param {string} inputText - Text being translated
   * @param {Object} options - Translation options
   */
  startTranslationProfile(operationId, inputText, options = {}) {
    // Use pooled performance metric object
    const perfMetric = getPerformanceMetric();
    perfMetric.operationId = operationId;
    perfMetric.startTime = performance.now();
    perfMetric.textLength = inputText.length;
    perfMetric.type = 'translation';
    perfMetric.metadata = options || {};

    this.activeProfiles.set(operationId, {
      type: 'translation',
      startTime: perfMetric.startTime,
      inputText,
      inputLength: inputText.length,
      options,
      phases: {},
      perfMetric, // Store reference to pooled object
    });
  }

  /**
   * Mark a specific phase within a translation
   * @param {string} operationId - Operation identifier
   * @param {string} phaseName - Name of the phase (e.g., 'tokenization', 'patterns', 'rendering')
   * @param {number} startTime - Phase start time
   * @param {number} endTime - Phase end time
   * @param {Object} metadata - Additional phase data
   */
  markTranslationPhase(operationId, phaseName, startTime, endTime, metadata = {}) {
    const profile = this.activeProfiles.get(operationId);
    if (profile) {
      profile.phases[phaseName] = {
        duration: endTime - startTime,
        metadata,
      };
    }
  }

  /**
   * Complete a translation operation and record metrics
   * @param {string} operationId - Operation identifier
   * @param {string} outputText - Translated text
   * @param {Object} result - Translation result with semantic arrays
   */
  endTranslationProfile(operationId, outputText, _result = {}) {
    const profile = this.activeProfiles.get(operationId);
    if (!profile) return;

    const endTime = performance.now();
    const totalTime = endTime - profile.startTime;
    const throughput = profile.inputLength / (totalTime / 1000); // chars per second

    // Update translation metrics
    this.metrics.translation.totalTranslations++;
    this.metrics.translation.totalTime += totalTime;
    this.metrics.translation.averageTime =
      this.metrics.translation.totalTime / this.metrics.translation.totalTranslations;
    this.metrics.translation.throughput =
      (this.metrics.translation.throughput * (this.metrics.translation.totalTranslations - 1) +
        throughput) /
      this.metrics.translation.totalTranslations;

    // Track extremes
    if (totalTime > this.metrics.translation.slowestTranslation.time) {
      this.metrics.translation.slowestTranslation = {
        time: totalTime,
        text: profile.inputText.substring(0, 100),
        length: profile.inputLength,
      };
    }
    if (totalTime < this.metrics.translation.fastestTranslation.time) {
      this.metrics.translation.fastestTranslation = {
        time: totalTime,
        text: profile.inputText.substring(0, 100),
        length: profile.inputLength,
      };
    }

    // Categorize by text size
    const sizeCategory = this.getTextSizeCategory(profile.inputLength);
    const sizeMetrics = this.metrics.translation.byTextSize[sizeCategory];
    sizeMetrics.count++;
    sizeMetrics.totalTime += totalTime;
    sizeMetrics.avgTime = sizeMetrics.totalTime / sizeMetrics.count;

    // Detect bottlenecks
    this.detectBottlenecks(operationId, profile, totalTime, throughput);

    // Add to performance history
    this.performanceHistory.push({
      timestamp: Date.now(),
      operationId,
      type: 'translation',
      duration: totalTime,
      inputLength: profile.inputLength,
      outputLength: outputText.length,
      throughput,
      phases: profile.phases,
      memoryUsage: this.getCurrentMemoryUsage(),
    });

    // Release pooled performance metric object back to pool
    if (profile && profile.perfMetric) {
      releasePerformanceMetric(profile.perfMetric);
    }

    // Cleanup
    this.activeProfiles.delete(operationId);

    // Keep history manageable (last 1000 operations)
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }
  }

  /**
   * Record dictionary operation metrics
   * @param {Object} cacheStats - Cache statistics from DictionaryManager
   * @param {Object} sortingStats - Sorting statistics from IncrementalDictionarySorter
   */
  updateDictionaryMetrics(cacheStats, sortingStats) {
    this.metrics.dictionary.cacheHitRate = cacheStats.hitRate || 0;
    this.metrics.dictionary.sortingStats = sortingStats;

    // Detect low cache hit rate
    if (this.metrics.dictionary.cacheHitRate < this.detectionThresholds.lowCacheHitRate) {
      this.addBottleneck('dictionary', 'Low cache hit rate', {
        hitRate: this.metrics.dictionary.cacheHitRate,
        threshold: this.detectionThresholds.lowCacheHitRate,
      });
    }
  }

  /**
   * Record rendering performance metrics
   * @param {string} renderType - Type of rendering ('static', 'optimized', 'virtualized')
   * @param {number} segmentCount - Number of segments rendered
   * @param {number} renderTime - Time taken to render
   * @param {Object} metadata - Additional rendering data
   */
  recordRenderingMetrics(renderType, segmentCount, renderTime, metadata = {}) {
    this.metrics.rendering.clickableRenderTime += renderTime;

    if (renderType === 'virtualized') {
      this.metrics.rendering.virtualizedRenderCount++;
    }

    if (metadata.segmentPrecomputeTime) {
      this.metrics.rendering.segmentPrecomputeTime += metadata.segmentPrecomputeTime;
    }
  }

  /**
   * Update memory usage metrics
   */
  updateMemoryMetrics() {
    const currentMemory = this.getCurrentMemoryUsage();
    this.metrics.memory.currentMemory = currentMemory;

    if (currentMemory > this.metrics.memory.peakMemory) {
      this.metrics.memory.peakMemory = currentMemory;
    }

    // Detect high memory usage
    if (currentMemory > this.detectionThresholds.highMemoryUsage) {
      this.addBottleneck('memory', 'High memory usage', {
        currentMemory: this.formatBytes(currentMemory),
        threshold: this.formatBytes(this.detectionThresholds.highMemoryUsage),
      });
    }
  }

  /**
   * Get comprehensive performance report
   * @returns {Object} Complete performance metrics and analysis
   */
  getPerformanceReport() {
    this.updateMemoryMetrics();

    const uptimeSeconds = (performance.now() - this.profilerStartTime) / 1000;

    return {
      summary: {
        uptime: `${Math.floor(uptimeSeconds / 60)}m ${Math.floor(uptimeSeconds % 60)}s`,
        totalTranslations: this.metrics.translation.totalTranslations,
        averageTranslationTime: `${this.metrics.translation.averageTime.toFixed(1)}ms`,
        throughput: `${this.metrics.translation.throughput.toFixed(1)} chars/sec`,
        cacheHitRate: `${(this.metrics.dictionary.cacheHitRate * 100).toFixed(1)}%`,
        memoryUsage: this.formatBytes(this.metrics.memory.currentMemory),
        peakMemory: this.formatBytes(this.metrics.memory.peakMemory),
      },
      translation: {
        ...this.metrics.translation,
        slowestTranslation: {
          ...this.metrics.translation.slowestTranslation,
          time: `${this.metrics.translation.slowestTranslation.time.toFixed(1)}ms`,
        },
        fastestTranslation: {
          ...this.metrics.translation.fastestTranslation,
          time:
            this.metrics.translation.fastestTranslation.time === Infinity
              ? 'N/A'
              : `${this.metrics.translation.fastestTranslation.time.toFixed(1)}ms`,
        },
      },
      dictionary: this.metrics.dictionary,
      rendering: this.metrics.rendering,
      memory: {
        ...this.metrics.memory,
        currentMemory: this.formatBytes(this.metrics.memory.currentMemory),
        peakMemory: this.formatBytes(this.metrics.memory.peakMemory),
        initialMemory: this.formatBytes(this.metrics.memory.initialMemory),
      },
      bottlenecks: this.metrics.bottlenecks,
      trends: this.getPerformanceTrends(),
    };
  }

  /**
   * Analyze performance trends from historical data
   * @returns {Object} Trend analysis
   */
  getPerformanceTrends() {
    if (this.performanceHistory.length < 10) {
      return {
        status: 'insufficient_data',
        message: 'Need at least 10 operations for trend analysis',
      };
    }

    const recent = this.performanceHistory.slice(-50); // Last 50 operations
    const older = this.performanceHistory.slice(-100, -50); // Previous 50 operations

    const recentAvgTime = recent.reduce((sum, op) => sum + op.duration, 0) / recent.length;
    const olderAvgTime =
      older.length > 0
        ? older.reduce((sum, op) => sum + op.duration, 0) / older.length
        : recentAvgTime;

    const trendDirection =
      recentAvgTime > olderAvgTime * 1.1
        ? 'degrading'
        : recentAvgTime < olderAvgTime * 0.9
          ? 'improving'
          : 'stable';

    return {
      averageTime: {
        recent: `${recentAvgTime.toFixed(1)}ms`,
        older: `${olderAvgTime.toFixed(1)}ms`,
        trend: trendDirection,
        change: `${(((recentAvgTime - olderAvgTime) / olderAvgTime) * 100).toFixed(1)}%`,
      },
      memoryTrend: this.analyzeMemoryTrend(recent),
      throughputTrend: this.analyzeThroughputTrend(recent, older),
    };
  }

  /**
   * Get real-time performance dashboard data
   * @returns {Object} Dashboard metrics
   */
  getDashboardMetrics() {
    return {
      currentOperations: this.activeProfiles.size,
      recentThroughput: this.getRecentThroughput(),
      memoryUsage: this.formatBytes(this.getCurrentMemoryUsage()),
      cacheEfficiency: `${(this.metrics.dictionary.cacheHitRate * 100).toFixed(1)}%`,
      avgResponseTime: `${this.metrics.translation.averageTime.toFixed(1)}ms`,
      activeBottlenecks: this.metrics.bottlenecks.length,
    };
  }

  // Helper methods

  getTextSizeCategory(length) {
    if (length < 500) return 'small';
    if (length < 2000) return 'medium';
    if (length < 8000) return 'large';
    return 'huge';
  }

  detectBottlenecks(operationId, profile, totalTime, throughput) {
    // Slow translation detection
    if (totalTime > this.detectionThresholds.slowTranslation) {
      this.addBottleneck('translation', 'Slow translation detected', {
        operationId,
        duration: `${totalTime.toFixed(1)}ms`,
        textLength: profile.inputLength,
        threshold: `${this.detectionThresholds.slowTranslation}ms`,
      });
    }

    // Low throughput detection
    if (throughput < this.detectionThresholds.lowThroughput) {
      this.addBottleneck('translation', 'Low throughput detected', {
        operationId,
        throughput: `${throughput.toFixed(1)} chars/sec`,
        threshold: `${this.detectionThresholds.lowThroughput} chars/sec`,
      });
    }
  }

  addBottleneck(category, issue, metadata) {
    this.metrics.bottlenecks.push({
      timestamp: Date.now(),
      category,
      issue,
      metadata,
    });

    // Keep bottlenecks list manageable
    if (this.metrics.bottlenecks.length > 100) {
      this.metrics.bottlenecks = this.metrics.bottlenecks.slice(-100);
    }
  }

  getCurrentMemoryUsage() {
    if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
      return window.performance.memory.usedJSHeapSize;
    }
    return 0; // Fallback for environments without memory API
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  getRecentThroughput() {
    const recent = this.performanceHistory.slice(-10);
    if (recent.length === 0) return 0;

    const avgThroughput = recent.reduce((sum, op) => sum + op.throughput, 0) / recent.length;
    return `${avgThroughput.toFixed(1)} chars/sec`;
  }

  analyzeMemoryTrend(recentOperations) {
    if (recentOperations.length < 5) return 'insufficient_data';

    const firstMemory = recentOperations[0].memoryUsage;
    const lastMemory = recentOperations[recentOperations.length - 1].memoryUsage;

    const changePercent = ((lastMemory - firstMemory) / firstMemory) * 100;

    return {
      trend: changePercent > 10 ? 'increasing' : changePercent < -10 ? 'decreasing' : 'stable',
      change: `${changePercent.toFixed(1)}%`,
    };
  }

  analyzeThroughputTrend(recent, older) {
    if (recent.length < 5 || older.length < 5) return 'insufficient_data';

    const recentThroughput = recent.reduce((sum, op) => sum + op.throughput, 0) / recent.length;
    const olderThroughput = older.reduce((sum, op) => sum + op.throughput, 0) / older.length;

    const changePercent = ((recentThroughput - olderThroughput) / olderThroughput) * 100;

    return {
      trend: changePercent > 5 ? 'improving' : changePercent < -5 ? 'degrading' : 'stable',
      change: `${changePercent.toFixed(1)}%`,
    };
  }

  /**
   * Reset all performance metrics
   */
  reset() {
    this.metrics = {
      translation: {
        totalTranslations: 0,
        totalTime: 0,
        averageTime: 0,
        throughput: 0,
        slowestTranslation: { time: 0, text: '', length: 0 },
        fastestTranslation: { time: Infinity, text: '', length: 0 },
        byTextSize: {
          small: { count: 0, totalTime: 0, avgTime: 0 },
          medium: { count: 0, totalTime: 0, avgTime: 0 },
          large: { count: 0, totalTime: 0, avgTime: 0 },
          huge: { count: 0, totalTime: 0, avgTime: 0 },
        },
      },
      dictionary: {
        cacheHitRate: 0,
        lookupTimes: [],
        sortingStats: null,
      },
      rendering: {
        segmentComputeTime: 0,
        clickableRenderTime: 0,
        virtualizedRenderCount: 0,
        segmentPrecomputeTime: 0,
      },
      memory: {
        initialMemory: this.getCurrentMemoryUsage(),
        currentMemory: 0,
        peakMemory: 0,
        cacheMemoryUsage: 0,
      },
      parallel: {
        chunkProcessingTime: 0,
        dictionaryLookupTime: 0,
        parallelEfficiency: 0,
        concurrencyLevel: 0,
        fallbackRate: 0,
        totalParallelOperations: 0,
        totalSequentialFallbacks: 0,
        avgParallelSpeedup: 0,
      },
      bottlenecks: [],
    };

    this.profilerStartTime = performance.now();
    this.activeProfiles.clear();
    this.performanceHistory = [];
  }

  /**
   * Record parallel processing performance metrics
   * @param {string} operationType - Type of parallel operation (chunk, dictionary)
   * @param {number} parallelTime - Time taken for parallel processing
   * @param {number} sequentialTime - Time taken for equivalent sequential processing
   * @param {number} concurrencyLevel - Number of parallel operations
   * @param {Object} metadata - Additional operation data
   */
  recordParallelPerformance(
    operationType,
    parallelTime,
    sequentialTime,
    concurrencyLevel,
    _metadata = {}
  ) {
    if (operationType === 'chunk') {
      this.metrics.parallel.chunkProcessingTime += parallelTime;
    } else if (operationType === 'dictionary') {
      this.metrics.parallel.dictionaryLookupTime += parallelTime;
    }

    // Calculate efficiency (time saved)
    const timeSaved = sequentialTime - parallelTime;
    const efficiency = sequentialTime > 0 ? timeSaved / sequentialTime : 0;

    // Update parallel metrics
    this.metrics.parallel.parallelEfficiency =
      (this.metrics.parallel.parallelEfficiency + efficiency) / 2;

    this.metrics.parallel.concurrencyLevel =
      (this.metrics.parallel.concurrencyLevel + concurrencyLevel) / 2;

    this.metrics.parallel.totalParallelOperations++;

    // Calculate speedup factor
    const speedup = sequentialTime > 0 ? sequentialTime / parallelTime : 1;
    this.metrics.parallel.avgParallelSpeedup =
      (this.metrics.parallel.avgParallelSpeedup + speedup) / 2;

    // Detect performance issues
    if (efficiency < 0) {
      this.addBottleneck(
        'parallel',
        `${operationType} parallel processing slower than sequential`,
        {
          parallelTime,
          sequentialTime,
          efficiency,
        }
      );
    }
  }

  /**
   * Record parallel processing fallback
   * @param {string} operationType - Type of operation that fell back
   * @param {Error} error - Error that caused the fallback
   */
  recordParallelFallback(operationType, error) {
    this.metrics.parallel.totalSequentialFallbacks++;

    // Calculate fallback rate
    const totalOperations =
      this.metrics.parallel.totalParallelOperations +
      this.metrics.parallel.totalSequentialFallbacks;
    this.metrics.parallel.fallbackRate =
      this.metrics.parallel.totalSequentialFallbacks / totalOperations;

    // Record as bottleneck if fallback rate is high
    if (this.metrics.parallel.fallbackRate > 0.1) {
      // >10% fallback rate
      this.addBottleneck('parallel', `High ${operationType} parallel processing fallback rate`, {
        fallbackRate: this.metrics.parallel.fallbackRate,
        error: error.message,
      });
    }
  }

  /**
   * Get parallel processing performance report
   * @returns {Object} Parallel processing metrics and analysis
   */
  getParallelPerformanceReport() {
    return {
      metrics: { ...this.metrics.parallel },
      recommendations: this.generateParallelRecommendations(),
      efficiency: {
        overall: this.metrics.parallel.parallelEfficiency,
        speedup: this.metrics.parallel.avgParallelSpeedup,
        reliability: 1 - this.metrics.parallel.fallbackRate,
      },
    };
  }

  /**
   * Generate recommendations for parallel processing optimization
   * @returns {Array} Array of optimization recommendations
   */
  generateParallelRecommendations() {
    const recommendations = [];

    if (this.metrics.parallel.parallelEfficiency < 0.2) {
      recommendations.push({
        type: 'efficiency',
        priority: 'high',
        message: 'Parallel processing shows low efficiency gains',
        suggestion: 'Consider increasing batch sizes or reducing parallel overhead',
      });
    }

    if (this.metrics.parallel.fallbackRate > 0.15) {
      recommendations.push({
        type: 'reliability',
        priority: 'medium',
        message: 'High fallback rate detected in parallel processing',
        suggestion: 'Investigate and fix common parallel processing failures',
      });
    }

    if (this.metrics.parallel.concurrencyLevel < 2) {
      recommendations.push({
        type: 'concurrency',
        priority: 'low',
        message: 'Low concurrency level in parallel operations',
        suggestion: 'Check device capabilities and parallel processing thresholds',
      });
    }

    return recommendations;
  }
}

// Export singleton instance for consistent state across the application
export const performanceProfiler = new PerformanceProfiler();
