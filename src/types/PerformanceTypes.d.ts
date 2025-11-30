/**
 * TypeScript type definitions for performance monitoring system
 *
 * Defines interfaces for performance tracking, regression detection,
 * baseline analysis, and memory management used throughout the application.
 */

/**
 * Performance metrics for translation operations
 * Tracked by PerformanceMonitor and displayed in UI
 */
export interface PerformanceMetrics {
  /** Total number of operations performed */
  operations: number;

  /** Average operation time in milliseconds */
  avgTime: number;

  /** Cache hit rate (0-1 or 0-100) */
  cacheHitRate: number;

  /** Total time across all operations */
  totalTime?: number;

  /** Minimum operation time */
  minTime?: number;

  /** Maximum operation time */
  maxTime?: number;

  /** Standard deviation of operation times */
  stdDev?: number;

  /** 95th percentile time */
  p95?: number;

  /** 99th percentile time */
  p99?: number;
}

/**
 * Regression detection health status
 * Monitors for performance degradation over time
 */
export interface RegressionHealth {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'critical';

  /** Number of critical alerts active */
  criticalAlerts: number;

  /** Number of warning alerts active */
  warningAlerts: number;

  /** Number of established performance baselines */
  baselines: number;

  /** Recent alerts (last 24 hours) */
  recentAlerts?: number;

  /** Timestamp of last health check */
  lastCheck?: number;
}

/**
 * Performance timer for tracking operation duration
 * Used by PerformanceMonitor.startTimer() / endTimer()
 */
export interface PerformanceTimer {
  /** Start time from performance.now() */
  startTime: number;

  /** Whether this timer was sampled (for performance) */
  sampled?: boolean;

  /** Operation metadata */
  metadata?: Record<string, any>;

  /** Timer ID for correlation */
  timerId?: string;
}

/**
 * Performance data point for baseline tracking
 * Recorded by PerformanceBaselineTracker
 */
export interface PerformanceDataPoint {
  /** Type of operation (translation_engine, position_cache, etc.) */
  operationType: string;

  /** Timestamp of measurement */
  timestamp: number;

  /** Duration in milliseconds */
  duration?: number;

  /** Memory usage in bytes */
  memoryBytes?: number;

  /** Cache hit rate (0-1) */
  cacheHitRate?: number;

  /** Session age in milliseconds */
  sessionAge?: number;

  /** Additional metrics */
  [key: string]: any;
}

/**
 * Performance baseline for operation type
 * Established baseline used for regression detection
 */
export interface PerformanceBaseline {
  /** Baseline operation type */
  operationType: string;

  /** Median duration in milliseconds */
  medianDuration: number;

  /** Average duration in milliseconds */
  avgDuration: number;

  /** 95th percentile duration */
  p95Duration: number;

  /** Baseline memory usage in bytes */
  memoryBytes?: number;

  /** Baseline cache hit rate */
  cacheHitRate?: number;

  /** When baseline was established */
  establishedAt: number;

  /** Last update timestamp */
  lastUpdate: number;

  /** Number of samples used for baseline */
  sampleCount: number;

  /** Standard deviation */
  stdDev?: number;
}

/**
 * Performance alert for degradation detection
 * Generated when performance exceeds baseline thresholds
 */
export interface PerformanceAlert {
  /** Alert severity level */
  level: 'warning' | 'critical';

  /** Alert type (duration, memory, cacheHitRate) */
  type: 'duration' | 'memory' | 'cacheHitRate';

  /** Operation type that triggered alert */
  operationType: string;

  /** Alert message */
  message: string;

  /** Current value */
  currentValue: number;

  /** Baseline value */
  baselineValue: number;

  /** Degradation ratio (current / baseline) */
  degradationRatio: number;

  /** Timestamp when alert was created */
  timestamp: number;

  /** Whether alert is still active */
  active?: boolean;

  /** Suggested actions to resolve */
  suggestions?: string[];
}

/**
 * Performance trend analysis
 * Analyzes performance over different time windows
 */
export interface PerformanceTrend {
  /** Trend direction ('improving', 'stable', 'degrading') */
  direction: 'improving' | 'stable' | 'degrading';

  /** Slope of trend line (positive = getting slower) */
  slope: number;

  /** Time window analyzed in minutes */
  windowMinutes: number;

  /** Data points in trend */
  dataPoints: number;

  /** Average value in window */
  avgValue: number;

  /** Trend confidence (0-1) */
  confidence?: number;
}

/**
 * System health report
 * Comprehensive status from systemPerformanceMonitor
 */
export interface SystemHealthReport {
  /** Overall system status */
  status: 'healthy' | 'warning' | 'critical';

  /** Total established baselines */
  totalBaselines: number;

  /** Recent alerts count */
  recentAlerts: number;

  /** Critical alerts count */
  criticalAlerts: number;

  /** Warning alerts count */
  warningAlerts: number;

  /** Actionable recommendations */
  recommendations: string[];

  /** Detailed alerts */
  alerts?: PerformanceAlert[];

  /** Baseline summaries */
  baselines?: Record<string, PerformanceBaseline>;

  /** Trend analysis */
  trends?: Record<string, PerformanceTrend>;

  /** Report timestamp */
  timestamp?: number;
}

/**
 * Memory usage statistics
 * Tracked for memory leak detection
 */
export interface MemoryStats {
  /** Used heap size in bytes */
  usedHeapSize: number;

  /** Total heap size in bytes */
  totalHeapSize: number;

  /** Heap size limit in bytes */
  heapSizeLimit: number;

  /** Heap usage percentage (0-100) */
  usagePercent: number;

  /** External memory in bytes (WASM, etc.) */
  externalMemory?: number;

  /** ArrayBuffer memory in bytes */
  arrayBuffers?: number;
}

/**
 * Performance profiler options
 * Configuration for PerformanceProfiler
 */
export interface PerformanceProfilerOptions {
  /** Enable profiling (default: false in production) */
  enabled?: boolean;

  /** Sample rate (0-1, default: 0.1 for 10%) */
  sampleRate?: number;

  /** Enable memory tracking */
  trackMemory?: boolean;

  /** Enable detailed timing */
  detailedTiming?: boolean;

  /** Maximum history entries to keep */
  maxHistorySize?: number;

  /** Auto-flush interval in milliseconds */
  autoFlushInterval?: number;
}

/**
 * Performance monitoring configuration
 * Used by globalPerformanceMonitor
 */
export interface PerformanceMonitorConfig {
  /** Enable monitoring */
  enabled?: boolean;

  /** Sampling rate for operations (0-1) */
  sampleRate?: number;

  /** Maximum samples to keep in memory */
  maxSamples?: number;

  /** Enable automatic baseline tracking */
  enableBaselines?: boolean;

  /** Alert thresholds configuration */
  alertThresholds?: {
    warningDegradation?: number;
    criticalDegradation?: number;
    memoryWarning?: number;
    memoryCritical?: number;
    cacheHitRateWarning?: number;
    cacheHitRateCritical?: number;
  };
}

/**
 * Performance baseline tracker options
 * Configuration for PerformanceBaselineTracker
 */
export interface PerformanceBaselineOptions {
  /** Baseline establishment window in milliseconds (default: 24 hours) */
  baselineWindowMs?: number;

  /** Trend analysis windows in minutes (default: [5, 15, 30, 60]) */
  trendAnalysisWindows?: number[];

  /** Alert thresholds */
  alertThresholds?: {
    warningDegradation?: number;
    criticalDegradation?: number;
    memoryWarning?: number;
    memoryCritical?: number;
    cacheHitRateWarning?: number;
    cacheHitRateCritical?: number;
  };

  /** Maximum history size */
  maxHistorySize?: number;

  /** Minimum samples for baseline establishment */
  minSamplesForBaseline?: number;
}

/**
 * WASM memory pool statistics
 * Tracks WASM memory pool efficiency
 */
export interface WasmMemoryPoolStats {
  /** Total allocations requested */
  totalAllocations: number;

  /** Pool hits (reused buffers) */
  poolHits: number;

  /** Pool misses (new allocations) */
  poolMisses: number;

  /** Pool hit rate (0-1) */
  hitRate: number;

  /** Current pool size (number of buffers) */
  currentPoolSize: number;

  /** Total memory in pool (bytes) */
  totalPoolMemory: number;

  /** Active buffers checked out */
  activeBuffers: number;

  /** Available buffers in pool */
  availableBuffers: number;
}

/**
 * Translation performance snapshot
 * Captured during translation operations
 */
export interface TranslationPerformanceSnapshot {
  /** Translation duration in milliseconds */
  duration: number;

  /** Number of characters translated */
  charactersProcessed: number;

  /** Tokens per second */
  tokensPerSecond: number;

  /** Memory used during translation */
  memoryDelta?: number;

  /** Cache statistics during operation */
  cacheStats?: {
    hits: number;
    misses: number;
    hitRate: number;
  };

  /** WASM usage */
  wasmUsed?: boolean;

  /** Number of chunks processed */
  chunksProcessed?: number;

  /** Timestamp */
  timestamp?: number;
}

/**
 * Viewport rendering performance
 * Tracks virtualized scrolling performance
 */
export interface ViewportPerformance {
  /** Render time in milliseconds */
  renderTime: number;

  /** Segments computed */
  segmentsComputed: number;

  /** Acceleration method used */
  accelerationMethod?: 'javascript' | 'worker' | 'wasm';

  /** Viewport height in pixels */
  viewportHeight?: number;

  /** Total content height */
  contentHeight?: number;

  /** Frame rate during scroll */
  fps?: number;
}
