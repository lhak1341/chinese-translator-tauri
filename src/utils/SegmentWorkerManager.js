/**
 * Web Worker Manager for Segment Position Processing
 * Handles communication with SegmentPositionWorker
 * Provides fallback to main thread if worker fails
 *
 * @import {
 *   SegmentWorkerManagerOptions,
 *   SegmentWorkerManager as ISegmentWorkerManager,
 *   WorkerStats,
 *   PendingTask,
 *   WorkerMessageData,
 *   WorkerResponseData,
 *   TextPositionMapping,
 *   SegmentComputationResult
 * } from '../types/WorkerTypes'
 */

export class SegmentWorkerManager {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.pendingTasks = new Map();
    this.taskIdCounter = 0;
    this.initializationPromise = null;
    this.fallbackMode = false;

    // Performance tracking
    this.stats = {
      workerTasks: 0,
      fallbackTasks: 0,
      totalWorkerTime: 0,
      totalFallbackTime: 0,
      errors: 0,
    };
  }

  /**
   * Initialize the worker
   * @returns {Promise<boolean>} True if worker initialized successfully
   */
  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeWorker();
    return this.initializationPromise;
  }

  async _initializeWorker() {
    try {
      // Check if Web Workers are supported
      if (typeof Worker === 'undefined') {
        console.warn('🚨 Web Workers not supported, using fallback mode');
        this.fallbackMode = true;
        return false;
      }

      // Create worker
      this.worker = new Worker('/src/workers/SegmentPositionWorker.js', {
        type: 'module',
      });

      // Set up message handling
      this.worker.onmessage = this._handleWorkerMessage.bind(this);
      this.worker.onerror = this._handleWorkerError.bind(this);

      // Wait for worker ready signal
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 5000);

        const messageHandler = (e) => {
          if (e.data.type === 'READY') {
            clearTimeout(timeout);
            this.worker.removeEventListener('message', messageHandler);
            this.isInitialized = true;
            console.log('✅ SegmentPositionWorker initialized successfully');
            resolve();
          }
        };

        this.worker.addEventListener('message', messageHandler);
      });

      return true;
    } catch (error) {
      console.warn('⚠️ Failed to initialize SegmentPositionWorker, using fallback:', error.message);
      this.fallbackMode = true;
      this.stats.errors++;

      // Clean up failed worker
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      return false;
    }
  }

  /**
   * Handle messages from worker
   */
  _handleWorkerMessage(e) {
    const { type, id, result, error } = e.data;

    if (!id || !this.pendingTasks.has(id)) {
      return;
    }

    const { resolve, reject, startTime } = this.pendingTasks.get(id);
    this.pendingTasks.delete(id);

    // Track performance
    const elapsed = performance.now() - startTime;
    this.stats.totalWorkerTime += elapsed;

    if (type === 'SUCCESS') {
      this.stats.workerTasks++;
      resolve(result);
    } else if (type === 'ERROR') {
      this.stats.errors++;
      reject(new Error(error.message));
    }
  }

  /**
   * Handle worker errors
   */
  _handleWorkerError(error) {
    console.error('🚨 SegmentPositionWorker error:', error);
    this.stats.errors++;

    // Reject all pending tasks
    for (const [id, { reject }] of this.pendingTasks) {
      reject(new Error('Worker error: ' + error.message));
    }
    this.pendingTasks.clear();
  }

  /**
   * Send task to worker or execute on main thread
   */
  async _executeTask(type, data, fallbackFunction) {
    // Use fallback if worker not available
    if (this.fallbackMode || !this.isInitialized) {
      const startTime = performance.now();
      try {
        const result = await fallbackFunction(data);
        this.stats.fallbackTasks++;
        this.stats.totalFallbackTime += performance.now() - startTime;
        return result;
      } catch (error) {
        this.stats.errors++;
        throw error;
      }
    }

    // Use worker
    return new Promise((resolve, reject) => {
      const id = ++this.taskIdCounter;
      const startTime = performance.now();

      this.pendingTasks.set(id, { resolve, reject, startTime });

      this.worker.postMessage({
        type,
        id,
        data,
      });
    });
  }

  /**
   * Create text position mapping (main expensive operation)
   */
  async createTextPositionMapping(text, semanticArrays) {
    await this.initialize();

    return this._executeTask(
      'CREATE_POSITION_MAPPING',
      { text, semanticArrays },
      // Fallback function
      async (data) => {
        const { ViewportSegmentComputer } = await import('./ViewportSegmentComputer.js');
        const computer = new ViewportSegmentComputer();
        return computer.createTextPositionMapping(data.text, data.semanticArrays);
      }
    );
  }

  /**
   * Compute segments for text range
   */
  async computeSegmentsForTextRange(semanticRangeMap, textStart, textEnd) {
    await this.initialize();

    return this._executeTask(
      'COMPUTE_SEGMENTS',
      { semanticRangeMap, textStart, textEnd },
      // Fallback function
      async (data) => {
        const { ViewportSegmentComputer } = await import('./ViewportSegmentComputer.js');
        const computer = new ViewportSegmentComputer();
        computer.semanticRangeMap = data.semanticRangeMap;
        return {
          segments: computer.computeSegmentsForTextRange(data.textStart, data.textEnd),
          stats: { computeTime: 0, segmentCount: 0 }, // Fallback doesn't track stats
        };
      }
    );
  }

  /**
   * Compute batch of segments (for pre-warming cache)
   */
  async computeBatchSegments(semanticRangeMap, viewportRanges) {
    await this.initialize();

    return this._executeTask(
      'COMPUTE_BATCH_SEGMENTS',
      { semanticRangeMap, viewportRanges },
      // Fallback function
      async (data) => {
        const { ViewportSegmentComputer } = await import('./ViewportSegmentComputer.js');
        const computer = new ViewportSegmentComputer();
        computer.semanticRangeMap = data.semanticRangeMap;

        const results = {};
        const startTime = performance.now();

        for (const range of data.viewportRanges) {
          const cacheKey = `${range.textStart}-${range.textEnd}`;
          results[cacheKey] = {
            segments: computer.computeSegmentsForTextRange(range.textStart, range.textEnd),
            stats: { computeTime: 0, segmentCount: 0 },
          };
        }

        return {
          results,
          batchStats: {
            totalTime: performance.now() - startTime,
            rangeCount: data.viewportRanges.length,
          },
        };
      }
    );
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const total = this.stats.workerTasks + this.stats.fallbackTasks;
    const avgWorkerTime =
      this.stats.workerTasks > 0 ? this.stats.totalWorkerTime / this.stats.workerTasks : 0;
    const avgFallbackTime =
      this.stats.fallbackTasks > 0 ? this.stats.totalFallbackTime / this.stats.fallbackTasks : 0;

    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      fallbackMode: this.fallbackMode,
      totalTasks: total,
      workerPercentage: total > 0 ? ((this.stats.workerTasks / total) * 100).toFixed(1) : 0,
      avgWorkerTime: avgWorkerTime.toFixed(2),
      avgFallbackTime: avgFallbackTime.toFixed(2),
      speedupFactor:
        avgFallbackTime > 0 && avgWorkerTime > 0
          ? (avgFallbackTime / avgWorkerTime).toFixed(2)
          : 'N/A',
    };
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.pendingTasks.clear();
  }
}

// Singleton instance
export const segmentWorkerManager = new SegmentWorkerManager();
