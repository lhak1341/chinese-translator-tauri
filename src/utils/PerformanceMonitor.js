// @ts-check
/**
 * Optimized Performance Monitor
 * Reduces monitoring overhead through sampling and environment-aware logging
 */

import { logger } from './logger.js';

export class PerformanceMonitor {
  /**
   * @param {{ sampleRate?: number, maxSamples?: number, enabled?: boolean }} [options]
   */
  constructor(options = {}) {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.sampleRate = options.sampleRate || (this.isProduction ? 0.05 : 0.2); // 5% prod, 20% dev
    this.maxSamples = options.maxSamples || 100;
    this.enabled = options.enabled !== false;

    // Performance data storage
    /** @type {Array<*>} */
    this.samples = [];
    this.lastResetTime = performance.now();
    this.aggregatedStats = {
      totalOperations: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0,
      lastResetTime: Date.now(),
    };

    // Cache for expensive calculations
    this.cachedMetrics = null;
    this.lastCacheTime = 0;
    this.cacheValidityMs = 1000; // Cache metrics for 1 second
  }

  /**
   * Determine if this operation should be sampled for detailed metrics
   */
  shouldSample() {
    if (!this.enabled) return false;
    return Math.random() < this.sampleRate;
  }

  /**
   * Start timing an operation (only if sampling)
   * @param {string} operationId
   */
  startTimer(operationId) {
    if (!this.shouldSample()) return null;

    return {
      id: operationId,
      startTime: performance.now(),
      sampled: true,
    };
  }

  /**
   * End timing and record results (lightweight for non-sampled operations)
   * @param {{ id: string, startTime: number, sampled: boolean }|null} timer
   * @param {string} operationName
   */
  endTimer(timer, operationName = 'operation') {
    if (!timer || !this.enabled) return;

    const endTime = performance.now();
    const duration = endTime - timer.startTime;

    // Always update basic aggregated stats (very fast)
    this.aggregatedStats.totalOperations++;
    this.aggregatedStats.totalTime += duration;
    this.aggregatedStats.avgTime =
      this.aggregatedStats.totalTime / this.aggregatedStats.totalOperations;
    this.aggregatedStats.minTime = Math.min(this.aggregatedStats.minTime, duration);
    this.aggregatedStats.maxTime = Math.max(this.aggregatedStats.maxTime, duration);

    // Only store detailed samples if this operation was sampled
    if (timer.sampled) {
      this.samples.push({
        operation: operationName,
        duration,
        timestamp: endTime,
      });

      // Prevent memory growth - keep only recent samples
      if (this.samples.length > this.maxSamples) {
        this.samples = this.samples.slice(-this.maxSamples);
      }

      // Invalidate cached metrics
      this.cachedMetrics = null;
    }
  }

  /**
   * Get current performance metrics (cached for efficiency)
   */
  getMetrics() {
    if (!this.enabled) {
      return {
        avgTime: 0,
        totalOperations: 0,
        opsPerSecond: 0,
        sampleRate: 0,
      };
    }

    const now = performance.now();

    // Return cached metrics if still valid
    if (this.cachedMetrics && now - this.lastCacheTime < this.cacheValidityMs) {
      return this.cachedMetrics;
    }

    // Calculate fresh metrics
    const timeSinceReset = now - this.lastResetTime;
    const opsPerSecond =
      timeSinceReset > 0 ? (this.aggregatedStats.totalOperations * 1000) / timeSinceReset : 0;

    this.cachedMetrics = {
      avgTime: this.aggregatedStats.avgTime,
      totalOperations: this.aggregatedStats.totalOperations,
      opsPerSecond: opsPerSecond,
      sampleRate: this.sampleRate * 100, // Convert to percentage
      minTime: this.aggregatedStats.minTime === Infinity ? 0 : this.aggregatedStats.minTime,
      maxTime: this.aggregatedStats.maxTime,
      sampleCount: this.samples.length,
    };

    this.lastCacheTime = now;
    return this.cachedMetrics;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.samples = [];
    this.aggregatedStats = {
      totalOperations: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0,
      lastResetTime: performance.now(),
    };
    this.cachedMetrics = null;
  }

  /**
   * Environment-aware logging with levels
   * @param {number} level
   * @param {string} message
   * @param {...any} args
   */
  log(level, message, ...args) {
    // ULTRA-AGGRESSIVE PERFORMANCE OPTIMIZATION: Disable almost all logging
    // Only show actual errors (level 0) to prevent console spam completely
    if (level === 0) {
      logger.error('🚨 ERROR:', message, ...args);
    }
    // Everything else (warnings, info, debug, verbose) is completely silenced
  }

  /**
   * Batch log performance summary (reduced frequency)
   */
  logSummary() {
    if (!this.enabled || this.aggregatedStats.totalOperations === 0) return;

    // Only log summary every 10 operations or more
    if (this.aggregatedStats.totalOperations % 10 === 0) {
      const metrics = this.getMetrics();
      this.log(
        2,
        `Performance Summary: ${metrics.totalOperations} ops, ${metrics.avgTime.toFixed(1)}ms avg, ${metrics.opsPerSecond.toFixed(1)} ops/sec`
      );
    }
  }
}

// Global instance for consistent monitoring across the app
export const globalPerformanceMonitor = new PerformanceMonitor({
  enabled: true,
  sampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.2,
});

// Convenience wrapper for simple timing
export const timeOperation = async (
  /** @type {string} */ operationName,
  /** @type {() => Promise<any>} */ asyncOperation
) => {
  const timer = globalPerformanceMonitor.startTimer(operationName);
  try {
    const result = await asyncOperation();
    globalPerformanceMonitor.endTimer(timer, operationName);
    return result;
  } catch (error) {
    globalPerformanceMonitor.endTimer(timer, operationName);
    throw error;
  }
};
