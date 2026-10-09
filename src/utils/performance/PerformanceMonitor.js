// @ts-check
/**
 * Running timing stats for translations: count, mean, min, max and operations per second.
 */

class PerformanceMonitor {
  constructor() {
    this.lastResetTime = performance.now();
    this.totalOperations = 0;
    this.totalTime = 0;
    this.minTime = Infinity;
    this.maxTime = 0;
  }

  /**
   * Record one finished operation.
   * @param {number} durationMs
   */
  record(durationMs) {
    this.totalOperations++;
    this.totalTime += durationMs;
    this.minTime = Math.min(this.minTime, durationMs);
    this.maxTime = Math.max(this.maxTime, durationMs);
  }

  getMetrics() {
    const timeSinceReset = performance.now() - this.lastResetTime;
    return {
      avgTime: this.totalOperations > 0 ? this.totalTime / this.totalOperations : 0,
      totalOperations: this.totalOperations,
      opsPerSecond: timeSinceReset > 0 ? (this.totalOperations * 1000) / timeSinceReset : 0,
      minTime: this.minTime === Infinity ? 0 : this.minTime,
      maxTime: this.maxTime,
    };
  }

  reset() {
    this.lastResetTime = performance.now();
    this.totalOperations = 0;
    this.totalTime = 0;
    this.minTime = Infinity;
    this.maxTime = 0;
  }
}

// Global instance for consistent monitoring across the app
export const globalPerformanceMonitor = new PerformanceMonitor();
