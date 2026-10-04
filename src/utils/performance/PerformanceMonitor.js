// @ts-check
/**
 * Optimized Performance Monitor
 * Running timing stats for translations, with sampled detail
 */

class PerformanceMonitor {
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
   * Record one finished operation. The running stats always update; the detailed sample is
   * kept only for the sampled fraction of operations.
   * @param {number} durationMs
   * @param {string} operationName
   */
  record(durationMs, operationName = 'operation') {
    if (!this.enabled) return;

    this.aggregatedStats.totalOperations++;
    this.aggregatedStats.totalTime += durationMs;
    this.aggregatedStats.avgTime =
      this.aggregatedStats.totalTime / this.aggregatedStats.totalOperations;
    this.aggregatedStats.minTime = Math.min(this.aggregatedStats.minTime, durationMs);
    this.aggregatedStats.maxTime = Math.max(this.aggregatedStats.maxTime, durationMs);

    // Metrics read the running stats, so a recorded operation always stales the cache
    this.cachedMetrics = null;

    if (this.shouldSample()) {
      this.samples.push({
        operation: operationName,
        duration: durationMs,
        timestamp: performance.now(),
      });

      // Prevent memory growth - keep only recent samples
      if (this.samples.length > this.maxSamples) {
        this.samples = this.samples.slice(-this.maxSamples);
      }
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
}

// Global instance for consistent monitoring across the app
export const globalPerformanceMonitor = new PerformanceMonitor({
  enabled: true,
  sampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.2,
});
