/**
 * Batch Logger
 * High-performance logging system that reduces DevTools overhead
 *
 * Features:
 * - Batches high-frequency logs to reduce console overhead
 * - Frequency-gated logging for hot code paths
 * - Automatic log level filtering
 * - Development-only logging with zero production overhead
 * - Memory-efficient circular buffer for hot logs
 */

import { getLogEntry, releaseLogEntry } from './DebugObjectPool.js';

export class BatchLogger {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 50;
    this.flushInterval = options.flushInterval || 1000; // ms
    this.frequencyGate = options.frequencyGate || 20; // Only log every Nth call for hot paths
    this.maxHotPathCounters = options.maxHotPathCounters || 200; // Prevent unbounded Map growth

    // Batch storage
    this.logBatch = [];
    this.hotPathCounters = new Map(); // Track call frequency for gating (bounded to maxHotPathCounters)

    // Performance tracking
    this.stats = {
      totalLogs: 0,
      batchesFlushed: 0,
      gatedLogs: 0,
      overhead: 0,
    };

    // Auto-flush timer
    this.flushTimer = null;
    this.setupAutoFlush();
  }

  /**
   * Setup automatic batch flushing
   */
  setupAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.logBatch.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  /**
   * Log message with batching for high-frequency calls
   * @param {string} level - Log level (INFO, WARN, ERROR, VERBOSE)
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  log(level, message, ...args) {
    if (process.env.NODE_ENV !== 'development') {
      return; // Zero overhead in production
    }

    const startTime = performance.now();

    this.stats.totalLogs++;

    // Use pooled log entry object to reduce GC pressure
    const logEntry = getLogEntry();
    logEntry.timestamp = Date.now();
    logEntry.level = level;
    logEntry.message = message;
    logEntry.args = args.slice(); // Shallow copy args array
    logEntry.time = new Date().toISOString().split('T')[1].split('.')[0];

    this.logBatch.push(logEntry);

    // Auto-flush if batch is full
    if (this.logBatch.length >= this.batchSize) {
      this.flush();
    }

    this.stats.overhead += performance.now() - startTime;
  }

  /**
   * Log message with frequency gating for very hot paths
   * Only logs every Nth call to prevent console flooding
   * @param {string} hotPathKey - Unique identifier for the hot path
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  logHotPath(hotPathKey, level, message, ...args) {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    // CODE REVIEW FIX: Enforce size limit with LRU eviction to prevent unbounded Map growth
    // If we're at capacity and this is a new hot path, delete the oldest entry
    if (
      this.hotPathCounters.size >= this.maxHotPathCounters &&
      !this.hotPathCounters.has(hotPathKey)
    ) {
      const firstKey = this.hotPathCounters.keys().next().value;
      this.hotPathCounters.delete(firstKey);
    }

    // Increment counter for this hot path
    const count = (this.hotPathCounters.get(hotPathKey) || 0) + 1;
    this.hotPathCounters.set(hotPathKey, count);

    // Only log every Nth call
    if (count % this.frequencyGate === 0) {
      this.log(level, `[${count}/${this.frequencyGate}] ${message}`, ...args);
    } else {
      this.stats.gatedLogs++;
    }
  }

  /**
   * Immediate log (bypasses batching for critical messages)
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  immediate(level, message, ...args) {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const levelEmoji = {
      INFO: '📝',
      WARN: '⚠️',
      ERROR: '🚨',
      VERBOSE: '🔍',
    };

    console.log(`${levelEmoji[level] || '📝'} ${message}`, ...args);
  }

  /**
   * Flush all batched logs to console
   */
  flush() {
    if (this.logBatch.length === 0) {
      return;
    }

    const startTime = performance.now();

    // Group logs by level for better console presentation
    const groupedLogs = this.groupLogsByLevel(this.logBatch);

    // Output each group
    for (const [level, logs] of groupedLogs.entries()) {
      this.outputLogGroup(level, logs);
    }

    // Release pooled objects back to pool to reduce memory pressure
    if (process.env.NODE_ENV === 'development') {
      this.logBatch.forEach((logEntry) => {
        releaseLogEntry(logEntry);
      });
    }

    this.logBatch = [];
    this.stats.batchesFlushed++;
    this.stats.overhead += performance.now() - startTime;
  }

  /**
   * Group logs by level for cleaner output
   */
  groupLogsByLevel(logs) {
    const groups = new Map();

    for (const log of logs) {
      if (!groups.has(log.level)) {
        groups.set(log.level, []);
      }
      groups.get(log.level).push(log);
    }

    return groups;
  }

  /**
   * Output a group of logs with level-specific formatting
   */
  outputLogGroup(level, _logs) {
    const levelStyles = {
      INFO: { emoji: '📝', color: '#3b82f6' },
      WARN: { emoji: '⚠️', color: '#f59e0b' },
      ERROR: { emoji: '🚨', color: '#ef4444' },
      VERBOSE: { emoji: '🔍', color: '#6b7280' },
    };

    const _style = levelStyles[level] || levelStyles['INFO'];

    // PERFORMANCE OPTIMIZATION: Completely disable batch logging to prevent console spam
    // This logging was causing massive performance overhead during translation
    return;

    // Original logging code disabled:
    // if (logs.length === 1) {
    //   const log = logs[0];
    //   console.log(`${style.emoji} [${log.time}] ${log.message}`, ...log.args);
    // } else {
    //   console.group(`${style.emoji} ${level} (${logs.length} messages)`);
    //   for (const log of logs) {
    //     console.log(`[${log.time}] ${log.message}`, ...log.args);
    //   }
    //   console.groupEnd();
    // }
  }

  /**
   * Clear frequency counters for hot paths
   */
  resetHotPathCounters() {
    this.hotPathCounters.clear();
  }

  /**
   * Get logging performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageOverhead: this.stats.totalLogs > 0 ? this.stats.overhead / this.stats.totalLogs : 0,
      gatedPercentage:
        this.stats.totalLogs > 0
          ? (this.stats.gatedLogs / (this.stats.totalLogs + this.stats.gatedLogs)) * 100
          : 0,
      hotPathCounters: this.hotPathCounters.size,
      maxHotPathCounters: this.maxHotPathCounters,
    };
  }

  /**
   * Clear all statistics and batches
   */
  clear() {
    this.logBatch = [];
    this.hotPathCounters.clear();
    this.stats = {
      totalLogs: 0,
      batchesFlushed: 0,
      gatedLogs: 0,
      overhead: 0,
    };
  }

  /**
   * Cleanup resources including flush timer
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.clear();
  }
}

/**
 * Performance Logger
 * Extends BatchLogger with timing capabilities and bottleneck detection
 */
export class PerformanceLogger extends BatchLogger {
  constructor(options = {}) {
    super(options);
    this.slowOperationThreshold = options.slowThreshold || 200; // ms
    this.timingData = new Map(); // operationId -> { start, operation, context }
    this.bottlenecks = []; // Array of slow operations
    this.maxBottlenecks = options.maxBottlenecks || 20; // Keep last N bottlenecks
  }

  /**
   * Start timing an operation
   * @param {string} operationId - Unique identifier for this operation
   * @param {string} operation - Operation name/description
   * @param {Object} context - Additional context data
   */
  startTiming(operationId, operation, context = {}) {
    this.timingData.set(operationId, {
      start: performance.now(),
      operation,
      context,
    });
  }

  /**
   * End timing an operation and check for bottlenecks
   * @param {string} operationId - Operation identifier
   * @param {Object} additionalData - Additional data to include in bottleneck report
   * @returns {number} Duration in milliseconds
   */
  endTiming(operationId, additionalData = {}) {
    const timing = this.timingData.get(operationId);
    if (!timing) {
      this.log('WARN', `⚠️ EndTiming called for unknown operation: ${operationId}`);
      return 0;
    }

    const duration = performance.now() - timing.start;
    this.timingData.delete(operationId);

    // Check if this is a bottleneck
    if (duration > this.slowOperationThreshold) {
      const bottleneck = {
        operation: timing.operation,
        operationId,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
        context: timing.context,
        timestamp: Date.now(),
        ...additionalData,
      };

      this.recordBottleneck(bottleneck);
    }

    // Log performance data
    this.log('VERBOSE', `⏱️ ${timing.operation}: ${duration.toFixed(1)}ms`, {
      operationId,
      duration,
      context: timing.context,
    });

    return duration;
  }

  /**
   * Record a bottleneck and manage bottleneck history
   * @param {Object} bottleneck - Bottleneck data
   */
  recordBottleneck(bottleneck) {
    this.bottlenecks.push(bottleneck);

    // Keep only the most recent bottlenecks
    if (this.bottlenecks.length > this.maxBottlenecks) {
      this.bottlenecks.shift();
    }

    // Log the bottleneck
    this.log(
      'WARN',
      `🐌 Slow operation detected: ${bottleneck.operation} took ${bottleneck.duration}ms`,
      {
        operationId: bottleneck.operationId,
        context: bottleneck.context,
        threshold: this.slowOperationThreshold,
      }
    );
  }

  /**
   * Get recent bottlenecks
   * @param {number} count - Number of recent bottlenecks to return
   * @returns {Array} Recent bottlenecks
   */
  getBottlenecks(count = null) {
    const bottlenecks = count ? this.bottlenecks.slice(-count) : this.bottlenecks.slice();
    return bottlenecks.sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }

  /**
   * Get performance analysis
   * @returns {Object} Performance analysis data
   */
  getPerformanceAnalysis() {
    const now = Date.now();
    const recentBottlenecks = this.bottlenecks.filter((b) => now - b.timestamp < 300000); // Last 5 minutes

    const analysis = {
      totalBottlenecks: this.bottlenecks.length,
      recentBottlenecks: recentBottlenecks.length,
      threshold: this.slowOperationThreshold,
      activeTimings: this.timingData.size,
      timestamp: now,
    };

    // Calculate statistics if we have bottlenecks
    if (recentBottlenecks.length > 0) {
      const durations = recentBottlenecks.map((b) => b.duration);
      analysis.averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      analysis.maxDuration = Math.max(...durations);
      analysis.minDuration = Math.min(...durations);

      // Group by operation type
      const operationGroups = {};
      recentBottlenecks.forEach((b) => {
        if (!operationGroups[b.operation]) {
          operationGroups[b.operation] = [];
        }
        operationGroups[b.operation].push(b.duration);
      });

      analysis.operationBreakdown = Object.entries(operationGroups)
        .map(([operation, durations]) => ({
          operation,
          count: durations.length,
          averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
          maxDuration: Math.max(...durations),
        }))
        .sort((a, b) => b.averageDuration - a.averageDuration);
    }

    return analysis;
  }

  /**
   * Clear bottleneck history
   */
  clearBottlenecks() {
    this.bottlenecks = [];
    this.log('INFO', '🗑️ Bottleneck history cleared');
  }

  /**
   * Clear all performance data
   */
  clear() {
    super.clear();
    this.bottlenecks = [];
    this.timingData.clear();
  }

  /**
   * Cleanup resources
   */
  destroy() {
    super.destroy();
    this.bottlenecks = [];
    this.timingData.clear();
  }
}

/**
 * Global performance logger instance
 */
export const performanceLogger = new PerformanceLogger({
  slowThreshold: 200,
  maxBottlenecks: 20,
  batchSize: 30,
  flushInterval: 2000,
});

// Create singleton instance for app-wide usage
export const batchLogger = new BatchLogger({
  batchSize: 30, // Batch up to 30 logs
  flushInterval: 2000, // Flush every 2 seconds
  frequencyGate: 25, // Only log every 25th call for hot paths
});

// Convenience functions for common log levels
export const batchLog = {
  info: (message, ...args) => batchLogger.log('INFO', message, ...args),
  warn: (message, ...args) => batchLogger.log('WARN', message, ...args),
  error: (message, ...args) => batchLogger.log('ERROR', message, ...args),
  verbose: (message, ...args) => batchLogger.log('VERBOSE', message, ...args),

  // Hot path logging
  hotInfo: (key, message, ...args) => batchLogger.logHotPath(key, 'INFO', message, ...args),
  hotVerbose: (key, message, ...args) => batchLogger.logHotPath(key, 'VERBOSE', message, ...args),

  // Immediate logging
  immediate: (level, message, ...args) => batchLogger.immediate(level, message, ...args),

  // Utilities
  flush: () => batchLogger.flush(),
  getStats: () => batchLogger.getStats(),
  clear: () => batchLogger.clear(),
};

export default BatchLogger;
