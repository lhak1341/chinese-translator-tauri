import { logger } from '../logger.js';

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

export type PressureLevel = 'none' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export type CleanupPriority = 'urgent' | 'normal' | 'low';

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

export interface MemoryPressure {
  level: PressureLevel;
  ratio: number;
  available: number;
  used: number;
  total: number;
  limit: number;
  timestamp: number;
}

export interface CleanupEvent {
  type: 'cleanup-needed';
  urgency: PressureLevel;
  pressure: MemoryPressure;
  growthRate: number;
  timestamp: number;
}

export interface MemoryEventData {
  pressure: MemoryPressure;
  growthRate: number;
  shouldCleanup: boolean;
}

export type MemoryEventCallback = (data: MemoryEventData | CleanupEvent) => void;

export interface MemoryPressureStats {
  current: PressureLevel;
  ratio: number;
  availableMB: string;
  growthRateMB: string;
  samples: number;
  lastCleanup: number;
}

export class SmartMemoryPressureDetector {
  private static instances = new Set<SmartMemoryPressureDetector>();
  private static cleanupHandlerRegistered = false;

  private options: Required<MemoryPressureOptions>;
  private memoryHistory: MemoryPressure[];
  private historyWriteIndex: number;
  private lastCleanup: number;
  private samplingTimer: ReturnType<typeof setInterval> | null;
  private callbacks: Map<string, MemoryEventCallback>;

  constructor(options: MemoryPressureOptions = {}) {
    this.options = {
      lowPressure: options.lowPressure || 0.6,
      mediumPressure: options.mediumPressure || 0.75,
      highPressure: options.highPressure || 0.85,
      criticalPressure: options.criticalPressure || 0.95,
      samplingInterval: options.samplingInterval || 5000,
      historyLimit: options.historyLimit || 20,
      growthThreshold: options.growthThreshold || 10,
    };

    this.memoryHistory = [];
    this.historyWriteIndex = 0;
    this.lastCleanup = 0;
    this.samplingTimer = null;
    this.callbacks = new Map();

    SmartMemoryPressureDetector.instances.add(this);

    if (!SmartMemoryPressureDetector.cleanupHandlerRegistered && typeof window !== 'undefined') {
      SmartMemoryPressureDetector.cleanupHandlerRegistered = true;
      window.addEventListener('beforeunload', () => {
        logger.log(
          `🧹 Cleaning up ${SmartMemoryPressureDetector.instances.size} SmartMemoryPressureDetector instances`
        );
        SmartMemoryPressureDetector.instances.forEach((instance) => instance.stop());
      });
    }

    this.startSampling();

    if (process.env.NODE_ENV === 'development') {
      logger.log(
        '⚠️ SmartMemoryPressureDetector: Call stop() before destroying to prevent memory leak'
      );
    }
  }

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

  private getRecentSamples(count: number): MemoryPressure[] {
    const available = Math.min(count, this.memoryHistory.length);
    if (available === 0) return [];

    if (this.memoryHistory.length < this.options.historyLimit) {
      return this.memoryHistory.slice(-available);
    }

    const result: MemoryPressure[] = new Array(available);
    for (let i = 0; i < available; i++) {
      const idx =
        (this.historyWriteIndex - available + i + this.options.historyLimit) %
        this.options.historyLimit;
      result[i] = this.memoryHistory[idx];
    }
    return result;
  }

  getMemoryGrowthRate(): number {
    if (this.memoryHistory.length < 2) return 0;

    const recent = this.getRecentSamples(5);
    if (recent.length < 2) return 0;

    const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const memoryDiff = recent[recent.length - 1].used - recent[0].used;

    return (memoryDiff / (1024 * 1024)) * (60000 / timeDiff);
  }

  private startSampling(): void {
    const sample = () => {
      const pressure = this.getCurrentPressureLevel();

      if (this.memoryHistory.length < this.options.historyLimit) {
        this.memoryHistory.push(pressure);
      } else {
        this.memoryHistory[this.historyWriteIndex] = pressure;
        this.historyWriteIndex = (this.historyWriteIndex + 1) % this.options.historyLimit;
      }

      const growthRate = this.getMemoryGrowthRate();
      const shouldCleanup = this.shouldTriggerCleanup(pressure, growthRate);

      if (shouldCleanup) {
        this.triggerCleanup(pressure, growthRate);
      }

      this.callbacks.forEach((callback) => {
        try {
          callback({ pressure, growthRate, shouldCleanup });
        } catch (error) {
          logger.warn('Memory pressure callback error:', error);
        }
      });
    };

    sample();
    this.samplingTimer = setInterval(sample, this.options.samplingInterval);
  }

  private shouldTriggerCleanup(pressure: MemoryPressure, growthRate: number): boolean {
    const now = performance.now();
    const timeSinceLastCleanup = now - this.lastCleanup;

    if (timeSinceLastCleanup < 30000) return false;

    if (pressure.level === 'critical') return true;
    if (pressure.level === 'high' && timeSinceLastCleanup > 60000) return true;
    if (pressure.level === 'medium' && timeSinceLastCleanup > 120000) return true;

    if (growthRate > this.options.growthThreshold) return true;

    return false;
  }

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

  onMemoryEvent(type: string, callback: MemoryEventCallback): void {
    this.callbacks.set(type, callback);
  }

  stop(): void {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
    SmartMemoryPressureDetector.instances.delete(this);
  }

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
