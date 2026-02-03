/**
 * Memory Management Refinements
 *
 * Advanced memory monitoring and cleanup system that works alongside existing
 * MemoryLeakDetector without affecting core translation functionality.
 *
 * Key Features:
 * - Real memory pressure detection using performance.memory API
 * - Background cleanup using requestIdleCallback()
 * - Component-specific memory profiling and tracking
 * - Non-intrusive operation that preserves translation quality
 */

import { logger } from './logger.js';

/**
 * Chrome-specific performance.memory API
 * Extends standard Performance interface
 */
declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

/**
 * Memory pressure level types
 */
export type PressureLevel = 'none' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';

/**
 * Cleanup task priority levels
 */
export type CleanupPriority = 'urgent' | 'normal' | 'low';

/**
 * Options for SmartMemoryPressureDetector
 */
export interface MemoryPressureOptions {
  /** Low memory pressure threshold (default: 0.6 = 60%) */
  lowPressure?: number;

  /** Medium memory pressure threshold (default: 0.75 = 75%) */
  mediumPressure?: number;

  /** High memory pressure threshold (default: 0.85 = 85%) */
  highPressure?: number;

  /** Critical memory pressure threshold (default: 0.95 = 95%) */
  criticalPressure?: number;

  /** Sampling interval in milliseconds (default: 5000) */
  samplingInterval?: number;

  /** Maximum number of history samples to keep (default: 20) */
  historyLimit?: number;

  /** Memory growth threshold in MB/minute (default: 10) */
  growthThreshold?: number;
}

/**
 * Memory pressure information
 */
export interface MemoryPressure {
  /** Pressure level */
  level: PressureLevel;

  /** Memory usage ratio (0-1) */
  ratio: number;

  /** Available memory in bytes */
  available: number;

  /** Used memory in bytes */
  used: number;

  /** Total allocated memory in bytes */
  total: number;

  /** Heap size limit in bytes */
  limit: number;

  /** Timestamp of measurement */
  timestamp: number;
}

/**
 * Cleanup event data
 */
export interface CleanupEvent {
  /** Event type */
  type: 'cleanup-needed';

  /** Urgency level */
  urgency: PressureLevel;

  /** Memory pressure at time of event */
  pressure: MemoryPressure;

  /** Memory growth rate in MB/minute */
  growthRate: number;

  /** Timestamp of event */
  timestamp: number;
}

/**
 * Memory event callback data
 */
export interface MemoryEventData {
  /** Current memory pressure */
  pressure: MemoryPressure;

  /** Memory growth rate */
  growthRate: number;

  /** Whether cleanup should be triggered */
  shouldCleanup: boolean;
}

/**
 * Memory event callback type
 */
export type MemoryEventCallback = (data: MemoryEventData | CleanupEvent) => void;

/**
 * Memory pressure statistics
 */
export interface MemoryPressureStats {
  /** Current pressure level */
  current: PressureLevel;

  /** Current memory usage ratio */
  ratio: number;

  /** Available memory in MB */
  availableMB: string;

  /** Growth rate in MB/minute */
  growthRateMB: string;

  /** Number of samples collected */
  samples: number;

  /** Timestamp of last cleanup */
  lastCleanup: number;
}

/**
 * Smart Cleanup Trigger System
 * Uses actual memory pressure instead of fixed thresholds
 */
export class SmartMemoryPressureDetector {
  private options: Required<MemoryPressureOptions>;
  private memoryHistory: MemoryPressure[];
  private historyWriteIndex: number;
  private lastCleanup: number;
  private samplingTimer: ReturnType<typeof setInterval> | null;
  private callbacks: Map<string, MemoryEventCallback>;

  constructor(options: MemoryPressureOptions = {}) {
    this.options = {
      // Memory pressure thresholds (percentage of heap limit)
      lowPressure: options.lowPressure || 0.6, // 60% - light cleanup
      mediumPressure: options.mediumPressure || 0.75, // 75% - moderate cleanup
      highPressure: options.highPressure || 0.85, // 85% - aggressive cleanup
      criticalPressure: options.criticalPressure || 0.95, // 95% - emergency cleanup

      // Sampling and history
      samplingInterval: options.samplingInterval || 5000, // 5 seconds
      historyLimit: options.historyLimit || 20,

      // Growth rate detection
      growthThreshold: options.growthThreshold || 10, // MB/minute
    };

    this.memoryHistory = [];
    this.historyWriteIndex = 0;
    this.lastCleanup = 0;
    this.samplingTimer = null;
    this.callbacks = new Map();

    // Start memory sampling
    this.startSampling();
  }

  /**
   * Get current memory pressure level
   */
  getCurrentPressureLevel(): MemoryPressure {
    if (!performance.memory) {
      return {
        level: 'unknown',
        ratio: 0,
        available: 0,
        used: 0,
        total: 0,
        limit: 0,
        timestamp: performance.now(),
      };
    }

    const memory = performance.memory;
    const ratio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    const availableMemory = memory.jsHeapSizeLimit - memory.usedJSHeapSize;

    let level: PressureLevel = 'low';
    if (ratio >= this.options.criticalPressure) level = 'critical';
    else if (ratio >= this.options.highPressure) level = 'high';
    else if (ratio >= this.options.mediumPressure) level = 'medium';
    else if (ratio >= this.options.lowPressure) level = 'low';
    else level = 'none';

    return {
      level,
      ratio,
      available: availableMemory,
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
      timestamp: performance.now(),
    };
  }

  /**
   * Get the most recent N samples in chronological order,
   * correctly handling the circular buffer layout.
   */
  private getRecentSamples(count: number): MemoryPressure[] {
    const available = Math.min(count, this.memoryHistory.length);
    if (available === 0) return [];

    if (this.memoryHistory.length < this.options.historyLimit) {
      // Still filling — array is in chronological order
      return this.memoryHistory.slice(-available);
    }

    // Circular buffer: most recent is at (historyWriteIndex - 1), wrap around
    const result: MemoryPressure[] = new Array(available);
    for (let i = 0; i < available; i++) {
      const idx =
        (this.historyWriteIndex - available + i + this.options.historyLimit) %
        this.options.historyLimit;
      result[i] = this.memoryHistory[idx];
    }
    return result;
  }

  /**
   * Calculate memory growth rate over time
   */
  getMemoryGrowthRate(): number {
    if (this.memoryHistory.length < 2) return 0;

    const recent = this.getRecentSamples(5);
    if (recent.length < 2) return 0;

    const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const memoryDiff = recent[recent.length - 1].used - recent[0].used;

    // Convert to MB per minute
    const growthRate = (memoryDiff / (1024 * 1024)) * (60000 / timeDiff);
    return growthRate;
  }

  /**
   * Start memory pressure sampling
   */
  private startSampling(): void {
    const sample = () => {
      const pressure = this.getCurrentPressureLevel();

      // Update history using circular write to avoid O(n) shift
      if (this.memoryHistory.length < this.options.historyLimit) {
        this.memoryHistory.push(pressure);
      } else {
        this.memoryHistory[this.historyWriteIndex] = pressure;
        this.historyWriteIndex = (this.historyWriteIndex + 1) % this.options.historyLimit;
      }

      // Check if cleanup is needed
      const growthRate = this.getMemoryGrowthRate();
      const shouldCleanup = this.shouldTriggerCleanup(pressure, growthRate);

      if (shouldCleanup) {
        this.triggerCleanup(pressure, growthRate);
      }

      // Trigger callbacks for monitoring
      this.callbacks.forEach((callback) => {
        try {
          callback({ pressure, growthRate, shouldCleanup });
        } catch (error) {
          logger.warn('Memory pressure callback error:', error);
        }
      });
    };

    // Initial sample
    sample();

    // Set up recurring sampling
    this.samplingTimer = setInterval(sample, this.options.samplingInterval);
  }

  /**
   * Determine if cleanup should be triggered
   */
  private shouldTriggerCleanup(pressure: MemoryPressure, growthRate: number): boolean {
    const now = performance.now();
    const timeSinceLastCleanup = now - this.lastCleanup;

    // Don't cleanup too frequently (minimum 30 seconds)
    if (timeSinceLastCleanup < 30000) return false;

    // Trigger based on pressure level
    if (pressure.level === 'critical') return true;
    if (pressure.level === 'high' && timeSinceLastCleanup > 60000) return true;
    if (pressure.level === 'medium' && timeSinceLastCleanup > 120000) return true;

    // Trigger based on growth rate
    if (growthRate > this.options.growthThreshold) return true;

    return false;
  }

  /**
   * Trigger cleanup with appropriate urgency
   */
  private triggerCleanup(pressure: MemoryPressure, growthRate: number): void {
    this.lastCleanup = performance.now();

    const urgency = pressure.level;
    const cleanupEvent: CleanupEvent = {
      type: 'cleanup-needed',
      urgency,
      pressure,
      growthRate,
      timestamp: performance.now(),
    };

    // Notify all cleanup handlers
    this.callbacks.forEach((callback, type) => {
      if (type === 'cleanup') {
        try {
          callback(cleanupEvent);
        } catch (error) {
          logger.warn('Cleanup callback error:', error);
        }
      }
    });
  }

  /**
   * Register callback for memory events
   */
  onMemoryEvent(type: string, callback: MemoryEventCallback): void {
    this.callbacks.set(type, callback);
  }

  /**
   * Stop memory sampling
   */
  stop(): void {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
  }

  /**
   * Get memory pressure statistics
   */
  getStats(): MemoryPressureStats | null {
    if (this.memoryHistory.length === 0) return null;

    const current = this.getCurrentPressureLevel();
    const growthRate = this.getMemoryGrowthRate();

    return {
      current: current.level,
      ratio: current.ratio,
      availableMB: (current.available / (1024 * 1024)).toFixed(1),
      growthRateMB: growthRate.toFixed(2),
      samples: this.memoryHistory.length,
      lastCleanup: this.lastCleanup,
    };
  }
}

/**
 * Cleanup task structure
 */
export interface CleanupTask {
  /** Unique task identifier */
  id: string;

  /** Task function to execute */
  task: () => any;

  /** Task priority level */
  priority: CleanupPriority;

  /** Timestamp when task was queued */
  queued: number;

  /** Number of execution attempts */
  attempts: number;

  /** Maximum allowed attempts */
  maxAttempts: number;
}

/**
 * Background cleanup statistics
 */
export interface BackgroundCleanupStats {
  /** Current queue length */
  queueLength: number;

  /** Total tasks processed */
  tasksProcessed: number;

  /** Total tasks queued */
  tasksQueued: number;

  /** Total idle time used (formatted string) */
  idleTimeUsedMs: string;

  /** Average task processing time (formatted string) */
  averageTaskTimeMs: string;

  /** Whether currently processing tasks */
  isProcessing: boolean;
}

/**
 * Idle deadline interface for requestIdleCallback
 */
interface IdleDeadline {
  timeRemaining(): number;
}

/**
 * Background Cleanup Manager
 * Uses requestIdleCallback() for non-urgent memory cleanup
 */
export class BackgroundCleanupManager {
  private cleanupQueue: CleanupTask[];
  private isProcessing: boolean;
  private stats: {
    tasksProcessed: number;
    tasksQueued: number;
    idleTimeUsed: number;
    averageTaskTime: number;
  };

  constructor() {
    this.cleanupQueue = [];
    this.isProcessing = false;
    this.stats = {
      tasksProcessed: 0,
      tasksQueued: 0,
      idleTimeUsed: 0,
      averageTaskTime: 0,
    };
  }

  /**
   * Queue cleanup task for background processing
   */
  queueCleanup(task: () => any, priority: CleanupPriority = 'normal'): void {
    const cleanupTask: CleanupTask = {
      id: `cleanup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      task,
      priority,
      queued: performance.now(),
      attempts: 0,
      maxAttempts: 3,
    };

    // Insert based on priority
    if (priority === 'urgent') {
      this.cleanupQueue.unshift(cleanupTask);
    } else {
      this.cleanupQueue.push(cleanupTask);
    }

    this.stats.tasksQueued++;
    this.processQueue();
  }

  /**
   * Process cleanup queue using requestIdleCallback
   */
  private processQueue(): void {
    if (this.isProcessing || this.cleanupQueue.length === 0) return;

    this.isProcessing = true;

    const processNextTask = (deadline: IdleDeadline) => {
      const startTime = performance.now();

      while (deadline.timeRemaining() > 5 && this.cleanupQueue.length > 0) {
        const task = this.cleanupQueue.shift();

        if (!task) continue;

        try {
          const taskStartTime = performance.now();

          // Execute the cleanup task
          const result = task.task();

          const taskDuration = performance.now() - taskStartTime;

          // Update statistics
          this.stats.tasksProcessed++;
          this.updateAverageTaskTime(taskDuration);

          // Log success for urgent tasks
          if (task.priority === 'urgent') {
            logger.log(
              `🧹 Background cleanup: ${task.id} completed in ${taskDuration.toFixed(1)}ms`
            );
          }
        } catch (error) {
          task.attempts++;

          if (task.attempts < task.maxAttempts) {
            // Retry later with lower priority
            task.priority = 'low';
            this.cleanupQueue.push(task);
          } else {
            logger.warn(`🚨 Background cleanup failed after ${task.maxAttempts} attempts:`, error);
          }
        }
      }

      const totalTime = performance.now() - startTime;
      this.stats.idleTimeUsed += totalTime;

      // Continue processing if there are more tasks
      if (this.cleanupQueue.length > 0) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(processNextTask, { timeout: 10000 });
        } else {
          // Fallback for environments without requestIdleCallback
          setTimeout(() => processNextTask({ timeRemaining: () => 10 }), 100);
        }
      } else {
        this.isProcessing = false;
      }
    };

    // Start processing
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(processNextTask, { timeout: 5000 });
    } else {
      // Fallback for environments without requestIdleCallback
      setTimeout(() => processNextTask({ timeRemaining: () => 16 }), 0);
    }
  }

  /**
   * Update average task processing time
   */
  private updateAverageTaskTime(taskTime: number): void {
    const currentAvg = this.stats.averageTaskTime;
    const count = this.stats.tasksProcessed;
    this.stats.averageTaskTime = (currentAvg * (count - 1) + taskTime) / count;
  }

  /**
   * Force process urgent tasks immediately
   */
  processUrgentTasks(): void {
    const urgentSet = new Set<CleanupTask>();

    for (const task of this.cleanupQueue) {
      if (task.priority !== 'urgent') continue;
      try {
        task.task();
        this.stats.tasksProcessed++;
        urgentSet.add(task);
      } catch (error) {
        logger.warn('Urgent cleanup task failed:', error);
        urgentSet.add(task); // Remove failed urgent tasks too — they'll be retried via normal queue
      }
    }

    // Single-pass removal instead of repeated indexOf + splice
    if (urgentSet.size > 0) {
      this.cleanupQueue = this.cleanupQueue.filter((task) => !urgentSet.has(task));
    }
  }

  /**
   * Get background cleanup statistics
   */
  getStats(): BackgroundCleanupStats {
    return {
      queueLength: this.cleanupQueue.length,
      tasksProcessed: this.stats.tasksProcessed,
      tasksQueued: this.stats.tasksQueued,
      idleTimeUsedMs: this.stats.idleTimeUsed.toFixed(1),
      averageTaskTimeMs: this.stats.averageTaskTime.toFixed(1),
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Clear all pending tasks
   */
  clear(): void {
    this.cleanupQueue = [];
    this.isProcessing = false;
  }
}

/**
 * Memory information snapshot
 */
export interface MemorySnapshot {
  /** Used heap size in bytes */
  used: number;

  /** Total allocated heap size in bytes */
  total: number;

  /** Heap size limit in bytes */
  limit: number;

  /** Timestamp of snapshot */
  timestamp: number;
}

/**
 * Memory sample during profiling
 */
export interface MemorySample {
  /** Sample label */
  label: string;

  /** Memory snapshot at sample time */
  memory: MemorySnapshot;

  /** Timestamp of sample */
  timestamp: number;

  /** Memory delta from start */
  memoryDelta: number;
}

/**
 * Component profiling data
 */
export interface ComponentProfile {
  /** Component name */
  componentName: string;

  /** Operation identifier */
  operationId: string;

  /** Unique profile ID */
  profileId: string;

  /** Starting memory snapshot */
  startMemory: MemorySnapshot;

  /** Starting timestamp */
  startTime: number;

  /** Memory samples collected */
  samples: MemorySample[];

  /** Whether profiling is completed */
  completed: boolean;

  /** Ending memory snapshot (if completed) */
  endMemory?: MemorySnapshot;

  /** Ending timestamp (if completed) */
  endTime?: number;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Component memory metrics
 */
export interface ComponentMetrics {
  /** Component name */
  componentName: string;

  /** Operation identifier */
  operationId: string;

  /** Operation duration in milliseconds */
  duration: number;

  /** Memory used in bytes */
  memoryUsed: number;

  /** Memory used in megabytes */
  memoryUsedMB: number;

  /** Peak memory delta in bytes */
  peakMemoryDelta: number;

  /** Number of samples collected */
  sampleCount: number;

  /** Additional metadata */
  metadata: Record<string, any>;
}

/**
 * Component statistics aggregate
 */
export interface ComponentStats {
  /** Component name */
  componentName: string;

  /** All operation metrics for this component */
  operations: ComponentMetrics[];

  /** Total memory used across all operations */
  totalMemoryUsed: number;

  /** Average memory used per operation */
  averageMemoryUsed: number;

  /** Number of operations tracked */
  operationCount: number;
}

/**
 * Top memory consumer information
 */
export interface TopMemoryConsumer {
  /** Component name */
  component: string;

  /** Average memory usage in MB */
  averageMemoryMB: string;

  /** Total memory usage in MB */
  totalMemoryMB: string;

  /** Number of operations */
  operationCount: number;

  /** Recent operations (up to 5) */
  recentOperations: ComponentMetrics[];
}

/**
 * Profiler statistics
 */
export interface ProfilerStats {
  /** Whether profiling is enabled */
  enabled: boolean;

  /** Number of active profiles */
  activeProfiles: number;

  /** Number of components tracked */
  componentCount: number;

  /** Total operations tracked across all components */
  totalOperationsTracked: number;
}

/**
 * Component Memory Profiler
 * Tracks memory usage by component/operation type
 */
export class ComponentMemoryProfiler {
  private profiles: Map<string, ComponentProfile | ComponentStats>;
  private globalBaseline: MemorySnapshot | null;
  private samplingEnabled: boolean;

  constructor() {
    this.profiles = new Map();
    this.globalBaseline = null;
    this.samplingEnabled = true;
  }

  /**
   * Start profiling a component/operation
   */
  startProfiling(componentName: string, operationId: string = 'default'): string | null {
    if (!this.samplingEnabled) return null;

    const profileId = `${componentName}:${operationId}`;
    const currentMemory = this.getCurrentMemory();

    if (!currentMemory) return null;

    const profile: ComponentProfile = {
      componentName,
      operationId,
      profileId,
      startMemory: currentMemory,
      startTime: performance.now(),
      samples: [],
      completed: false,
    };

    this.profiles.set(profileId, profile);
    return profileId;
  }

  /**
   * Record intermediate memory sample
   */
  sample(profileId: string | null, label: string = 'sample'): void {
    if (!this.samplingEnabled || !profileId) return;

    const profile = this.profiles.get(profileId) as ComponentProfile | undefined;
    if (!profile || profile.completed) return;

    const currentMemory = this.getCurrentMemory();
    if (!currentMemory) return;

    profile.samples.push({
      label,
      memory: currentMemory,
      timestamp: performance.now(),
      memoryDelta: currentMemory.used - profile.startMemory.used,
    });
  }

  /**
   * Complete profiling and calculate metrics
   */
  completeProfiling(
    profileId: string | null,
    metadata: Record<string, any> = {}
  ): ComponentMetrics | null {
    if (!this.samplingEnabled || !profileId) return null;

    const profile = this.profiles.get(profileId) as ComponentProfile | undefined;
    if (!profile || profile.completed) return null;

    const endMemory = this.getCurrentMemory();
    const endTime = performance.now();

    if (!endMemory) return null;

    profile.endMemory = endMemory;
    profile.endTime = endTime;
    profile.completed = true;
    profile.metadata = metadata;

    // Calculate metrics
    const metrics: ComponentMetrics = {
      componentName: profile.componentName,
      operationId: profile.operationId,
      duration: endTime - profile.startTime,
      memoryUsed: endMemory.used - profile.startMemory.used,
      memoryUsedMB: (endMemory.used - profile.startMemory.used) / (1024 * 1024),
      peakMemoryDelta: Math.max(...profile.samples.map((s) => s.memoryDelta), 0),
      sampleCount: profile.samples.length,
      metadata,
    };

    // Store metrics and remove from active profiles
    this.storeMetrics(profile.componentName, metrics);
    this.profiles.delete(profileId);

    return metrics;
  }

  /**
   * Store metrics for component
   */
  private storeMetrics(componentName: string, metrics: ComponentMetrics): void {
    if (!this.profiles.has(componentName)) {
      this.profiles.set(componentName, {
        componentName,
        operations: [],
        totalMemoryUsed: 0,
        averageMemoryUsed: 0,
        operationCount: 0,
      });
    }

    const componentProfile = this.profiles.get(componentName) as ComponentStats;
    componentProfile.operations.push(metrics);
    componentProfile.totalMemoryUsed += metrics.memoryUsed;
    componentProfile.operationCount++;
    componentProfile.averageMemoryUsed =
      componentProfile.totalMemoryUsed / componentProfile.operationCount;

    // Keep only recent operations to prevent memory accumulation
    if (componentProfile.operations.length > 50) {
      const removed = componentProfile.operations.shift();
      if (removed) {
        componentProfile.totalMemoryUsed -= removed.memoryUsed;
        componentProfile.operationCount--;
        componentProfile.averageMemoryUsed =
          componentProfile.totalMemoryUsed / componentProfile.operationCount;
      }
    }
  }

  /**
   * Get current memory information
   */
  private getCurrentMemory(): MemorySnapshot | null {
    if (!performance.memory) return null;

    return {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      timestamp: performance.now(),
    };
  }

  /**
   * Get memory usage by component
   */
  getComponentStats(componentName: string | null = null): ComponentStats | ComponentStats[] | null {
    if (componentName) {
      const stats = this.profiles.get(componentName);
      return stats && 'averageMemoryUsed' in stats ? stats : null;
    }

    // Return all component stats sorted by memory usage
    const stats = Array.from(this.profiles.values())
      .filter((profile): profile is ComponentStats => 'averageMemoryUsed' in profile)
      .sort((a, b) => b.averageMemoryUsed - a.averageMemoryUsed);

    return stats;
  }

  /**
   * Get top memory consuming components
   */
  getTopMemoryConsumers(limit: number = 10): TopMemoryConsumer[] {
    const stats = this.getComponentStats() as ComponentStats[];
    return stats.slice(0, limit).map((profile) => ({
      component: profile.componentName,
      averageMemoryMB: (profile.averageMemoryUsed / (1024 * 1024)).toFixed(2),
      totalMemoryMB: (profile.totalMemoryUsed / (1024 * 1024)).toFixed(2),
      operationCount: profile.operationCount,
      recentOperations: profile.operations.slice(-5),
    }));
  }

  /**
   * Enable/disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.samplingEnabled = enabled;
    if (!enabled) {
      // Clear active profiles but keep completed stats
      Array.from(this.profiles.keys()).forEach((key) => {
        if (key.includes(':')) {
          // Active profile IDs contain ':'
          this.profiles.delete(key);
        }
      });
    }
  }

  /**
   * Get profiler statistics
   */
  getProfilerStats(): ProfilerStats {
    const activeProfiles = Array.from(this.profiles.keys()).filter((key) => key.includes(':'));
    const componentStats = Array.from(this.profiles.values()).filter(
      (p): p is ComponentStats => 'averageMemoryUsed' in p
    );

    return {
      enabled: this.samplingEnabled,
      activeProfiles: activeProfiles.length,
      componentCount: componentStats.length,
      totalOperationsTracked: componentStats.reduce((sum, p) => sum + p.operationCount, 0),
    };
  }
}
