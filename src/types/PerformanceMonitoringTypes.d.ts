/**
 * PerformanceMonitoringTypes.d.ts
 *
 * Comprehensive TypeScript type definitions for Performance Monitoring, Regression Detection, and Profiling.
 *
 * Covers:
 * - Baseline tracking and trend analysis
 * - Automated alerts and health reporting
 * - Performance profiling and bottleneck detection
 * - WASM vs JavaScript benchmarking
 * - Memory monitoring and optimization
 *
 * @module PerformanceMonitoringTypes
 */

// ============================================================================
// PerformanceBaselineTracker + SystemPerformanceMonitor
// ============================================================================

/**
 * Configuration options for PerformanceBaselineTracker
 */
export interface BaselineTrackerOptions {
  /** Time window for baseline establishment (ms) */
  baselineWindowMs?: number;

  /** Windows for trend analysis (minutes) */
  trendAnalysisWindows?: number[];

  /** Alert threshold configuration */
  alertThresholds?: AlertThresholds;

  /** Maximum history size to maintain */
  maxHistorySize?: number;
}

/**
 * Alert thresholds for performance regression detection
 */
export interface AlertThresholds {
  /** Warning threshold for performance degradation (1.2 = 20% slower) */
  warningDegradation?: number;

  /** Critical threshold for performance degradation (1.5 = 50% slower) */
  criticalDegradation?: number;

  /** Warning threshold for memory increase (1.3 = 30% more) */
  memoryWarning?: number;

  /** Critical threshold for memory increase (1.5 = 50% more) */
  memoryCritical?: number;

  /** Warning threshold for cache hit rate (<0.8 = <80%) */
  cacheHitRateWarning?: number;

  /** Critical threshold for cache hit rate (<0.6 = <60%) */
  cacheHitRateCritical?: number;
}

/**
 * Performance data point recorded for analysis
 */
export interface PerformanceDataPoint {
  /** Type of operation being measured */
  operationType: string;

  /** Timestamp of measurement */
  timestamp: number;

  /** Duration of operation (ms) */
  duration?: number;

  /** Memory used (bytes) */
  memoryUsed?: number;

  /** Cache hit rate (0-1) */
  cacheHitRate?: number;

  /** Session age when recorded (ms) */
  sessionAge: number;

  /** Additional metadata */
  [key: string]: any;
}

/**
 * Performance baseline for an operation type
 */
export interface PerformanceBaseline {
  /** Operation type */
  operationType: string;

  /** Timestamp when baseline was established */
  establishedAt: number;

  /** Timestamp of last update */
  lastUpdate: number;

  /** Number of samples used */
  sampleCount: number;

  /** Average duration (ms) */
  avgDuration: number;

  /** Median duration (ms) */
  medianDuration: number;

  /** Standard deviation of duration */
  durationStdDev: number;

  /** Average memory used (bytes) */
  avgMemoryUsed: number;

  /** Median memory used (bytes) */
  medianMemoryUsed: number;

  /** Average cache hit rate (0-1) */
  avgCacheHitRate: number;

  /** Median cache hit rate (0-1) */
  medianCacheHitRate: number;

  /** Operations per second */
  operationsPerSecond: number;
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  /** Alert severity level */
  level: 'warning' | 'critical';

  /** Type of alert */
  type: 'duration_regression' | 'memory_regression' | 'cache_degradation';

  /** Alert message */
  message: string;

  /** Performance ratio (current / baseline) */
  ratio?: number;

  /** Current value */
  current?: number;

  /** Baseline value */
  baseline?: number;

  /** Timestamp when alert was created */
  timestamp: number;

  /** Operation type that triggered alert */
  operationType: string;

  /** Investigation suggestions (for memory alerts) */
  investigation?: string[];
}

/**
 * Trend analysis for a time window
 */
export interface TrendAnalysis {
  /** Trend slope (positive = degrading, negative = improving) */
  slope: number;

  /** Trend direction */
  direction: 'degrading' | 'improving' | 'stable';

  /** Number of samples analyzed */
  samples: number;

  /** Average duration in window (ms) */
  avgDuration: number;

  /** Total change over window (ms) */
  change: number;
}

/**
 * Trend analysis results by time window
 */
export interface TrendAnalysisResults {
  /** Trend over 5 minutes */
  '5min'?: TrendAnalysis;

  /** Trend over 15 minutes */
  '15min'?: TrendAnalysis;

  /** Trend over 30 minutes */
  '30min'?: TrendAnalysis;

  /** Trend over 60 minutes */
  '60min'?: TrendAnalysis;

  /** Timestamp when analysis was performed */
  analyzedAt: number;
}

/**
 * Baseline summary for health reporting
 */
export interface BaselineSummary {
  /** Operation type */
  operationType: string;

  /** Average duration (ms) */
  avgDuration: number;

  /** Average memory used (bytes) */
  avgMemoryUsed: number;

  /** Average cache hit rate (0-1) */
  avgCacheHitRate: number;

  /** Number of samples */
  sampleCount: number;

  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Performance health summary
 */
export interface PerformanceHealthSummary {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'critical';

  /** Number of established baselines */
  totalBaselines: number;

  /** Total samples recorded */
  totalSamples: number;

  /** Recent alerts (last hour) */
  recentAlerts: number;

  /** Critical alerts count */
  criticalAlerts: number;

  /** Warning alerts count */
  warningAlerts: number;

  /** Monitoring uptime (ms) */
  monitoringUptimeMs: number;

  /** Baseline summaries */
  baselines: BaselineSummary[];

  /** Recommendations for improving health */
  recommendations?: string[];
}

// ============================================================================
// Performance Profiling (PerformanceProfiler.js)
// ============================================================================

/**
 * Translation metrics
 */
export interface TranslationMetrics {
  /** Total translations performed */
  totalTranslations: number;

  /** Total time spent translating (ms) */
  totalTime: number;

  /** Average translation time (ms) */
  averageTime: number;

  /** Throughput (characters per second) */
  throughput: number;

  /** Slowest translation details */
  slowestTranslation: ExtremeTranslation;

  /** Fastest translation details */
  fastestTranslation: ExtremeTranslation;

  /** Metrics by text size category */
  byTextSize: {
    small: TextSizeMetrics; // <500 chars
    medium: TextSizeMetrics; // 500-2000 chars
    large: TextSizeMetrics; // 2000-8000 chars
    huge: TextSizeMetrics; // >8000 chars
  };
}

/**
 * Extreme translation record (slowest/fastest)
 */
export interface ExtremeTranslation {
  /** Translation time (ms) */
  time: number;

  /** Text sample (first 100 chars) */
  text: string;

  /** Text length */
  length: number;
}

/**
 * Metrics for a text size category
 */
export interface TextSizeMetrics {
  /** Number of translations in category */
  count: number;

  /** Total time for category (ms) */
  totalTime: number;

  /** Average time for category (ms) */
  avgTime: number;
}

/**
 * Dictionary performance metrics
 */
export interface DictionaryMetrics {
  /** Cache hit rate (0-1) */
  cacheHitRate: number;

  /** Lookup times array */
  lookupTimes: number[];

  /** Sorting statistics */
  sortingStats: any | null;
}

/**
 * Rendering performance metrics
 */
export interface RenderingMetrics {
  /** Time spent computing segments (ms) */
  segmentComputeTime: number;

  /** Time spent rendering clickable elements (ms) */
  clickableRenderTime: number;

  /** Number of virtualized renders */
  virtualizedRenderCount: number;

  /** Time spent precomputing segments (ms) */
  segmentPrecomputeTime: number;
}

/**
 * Memory usage metrics
 */
export interface MemoryMetrics {
  /** Initial memory at profiler start (bytes) */
  initialMemory: number;

  /** Current memory usage (bytes) */
  currentMemory: number;

  /** Peak memory usage (bytes) */
  peakMemory: number;

  /** Cache memory usage (bytes) */
  cacheMemoryUsage: number;
}

/**
 * Parallel processing metrics
 */
export interface ParallelMetrics {
  /** Time spent processing chunks (ms) */
  chunkProcessingTime: number;

  /** Time spent on dictionary lookups (ms) */
  dictionaryLookupTime: number;

  /** Parallel efficiency (time saved vs sequential) */
  parallelEfficiency: number;

  /** Average concurrency level */
  concurrencyLevel: number;

  /** Fallback rate to sequential */
  fallbackRate: number;

  /** Total parallel operations */
  totalParallelOperations: number;

  /** Total sequential fallbacks */
  totalSequentialFallbacks: number;

  /** Average speedup factor vs sequential */
  avgParallelSpeedup: number;
}

/**
 * Performance bottleneck
 */
export interface PerformanceBottleneck {
  /** Bottleneck category */
  category: string;

  /** Description */
  description: string;

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Timestamp when detected */
  timestamp: number;

  /** Additional data */
  data?: Record<string, any>;
}

/**
 * Translation profile for active operation
 */
export interface TranslationProfile {
  /** Profile type */
  type: 'translation';

  /** Start time */
  startTime: number;

  /** Input text */
  inputText: string;

  /** Input length */
  inputLength: number;

  /** Translation options */
  options: Record<string, any>;

  /** Phase timings */
  phases: Record<string, PhaseMetrics>;

  /** Pooled performance metric object */
  perfMetric?: any;
}

/**
 * Phase metrics within a translation
 */
export interface PhaseMetrics {
  /** Phase duration (ms) */
  duration: number;

  /** Additional phase metadata */
  metadata: Record<string, any>;
}

/**
 * Performance history entry
 */
export interface PerformanceHistoryEntry {
  /** Timestamp */
  timestamp: number;

  /** Operation ID */
  operationId: string;

  /** Operation type */
  type: string;

  /** Duration (ms) */
  duration: number;

  /** Input length */
  inputLength: number;

  /** Output length */
  outputLength: number;

  /** Throughput (chars/sec) */
  throughput: number;

  /** Phase timings */
  phases: Record<string, PhaseMetrics>;

  /** Memory usage at completion (bytes) */
  memoryUsage: number;
}

/**
 * Detection thresholds for bottlenecks
 */
export interface DetectionThresholds {
  /** Slow translation threshold (ms) */
  slowTranslation: number;

  /** Low throughput threshold (chars/sec) */
  lowThroughput: number;

  /** High memory usage threshold (bytes) */
  highMemoryUsage: number;

  /** Low cache hit rate threshold (0-1) */
  lowCacheHitRate: number;
}

/**
 * Performance report summary
 */
export interface PerformanceSummary {
  /** Uptime string */
  uptime: string;

  /** Total translations */
  totalTranslations: number;

  /** Average translation time */
  averageTranslationTime: string;

  /** Throughput */
  throughput: string;

  /** Cache hit rate */
  cacheHitRate: string;

  /** Memory usage */
  memoryUsage: string;

  /** Peak memory */
  peakMemory: string;
}

/**
 * Complete performance report
 */
export interface PerformanceReport {
  /** Summary statistics */
  summary: PerformanceSummary;

  /** Translation metrics */
  translation: TranslationMetrics;

  /** Dictionary metrics */
  dictionary: DictionaryMetrics;

  /** Rendering metrics */
  rendering: RenderingMetrics;

  /** Memory metrics */
  memory: MemoryMetrics & {
    currentMemory: string;
    peakMemory: string;
    initialMemory: string;
  };

  /** Parallel processing metrics */
  parallel?: ParallelMetrics;

  /** Detected bottlenecks */
  bottlenecks: PerformanceBottleneck[];

  /** Performance trends */
  trends: any;
}

// ============================================================================
// Performance Monitor (PerformanceMonitor.js)
// ============================================================================

/**
 * Performance monitor configuration
 */
export interface PerformanceMonitorOptions {
  /** Sample rate (0-1) for detailed metrics */
  sampleRate?: number;

  /** Maximum samples to keep */
  maxSamples?: number;

  /** Whether monitoring is enabled */
  enabled?: boolean;
}

/**
 * Performance sample
 */
export interface PerformanceSample {
  /** Operation name */
  operation: string;

  /** Duration (ms) */
  duration: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Aggregated statistics
 */
export interface AggregatedStats {
  /** Total operations counted */
  totalOperations: number;

  /** Total time across all operations (ms) */
  totalTime: number;

  /** Average time (ms) */
  avgTime: number;

  /** Minimum time (ms) */
  minTime: number;

  /** Maximum time (ms) */
  maxTime: number;

  /** Last reset timestamp */
  lastResetTime: number;
}

/**
 * Performance timer
 */
export interface PerformanceTimer {
  /** Timer ID */
  id: string;

  /** Start time */
  startTime: number;

  /** Whether this operation was sampled */
  sampled: boolean;
}

/**
 * Performance metrics from monitor
 */
export interface PerformanceMonitorMetrics {
  /** Average time (ms) */
  avgTime: number;

  /** Total operations */
  totalOperations: number;

  /** Operations per second */
  opsPerSecond: number;

  /** Sample rate percentage */
  sampleRate: number;

  /** Minimum time (ms) */
  minTime?: number;

  /** Maximum time (ms) */
  maxTime?: number;

  /** Number of detailed samples */
  sampleCount?: number;
}

// ============================================================================
// WASM Performance Benchmark (WasmPerformanceBenchmark.js)
// ============================================================================

/**
 * Benchmark scenario configuration
 */
export interface BenchmarkScenario {
  /** Scenario name */
  name: string;

  /** Test text */
  text: string;

  /** Number of iterations */
  iterations: number;

  /** Scenario description */
  description: string;
}

/**
 * Performance measurement results
 */
export interface PerformanceMeasurement {
  /** Average time (ms) */
  averageTime: number;

  /** Median time (ms) */
  medianTime: number;

  /** 95th percentile time (ms) */
  p95Time: number;

  /** Minimum time (ms) */
  minTime: number;

  /** Maximum time (ms) */
  maxTime: number;

  /** Memory usage (bytes) */
  memoryUsage: number;

  /** Peak memory (bytes) */
  memoryPeak: number;

  /** Standard deviation */
  standardDeviation: number;

  /** Number of iterations */
  iterations: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Baseline metrics for a scenario
 */
export interface BaselineMetrics extends PerformanceMeasurement {
  /** Scenario description */
  scenario: string;

  /** Test configuration */
  testConfig: BenchmarkScenario;
}

/**
 * Regression thresholds
 */
export interface RegressionThresholds {
  /** Minimum speedup required for WASM */
  minimumSpeedupRequired: number;

  /** Target memory reduction (0-1) */
  memoryReductionTarget: number;

  /** Maximum regression tolerance (0-1) */
  maxRegressionTolerance: number;
}

/**
 * Environment capture
 */
export interface BenchmarkEnvironment {
  /** User agent */
  userAgent?: string;

  /** Platform */
  platform?: string;

  /** Available memory */
  memory?: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
  };

  /** Hardware concurrency */
  hardwareConcurrency?: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Benchmark session
 */
export interface BenchmarkSession {
  /** Session start time */
  startTime: number;

  /** Measurements */
  measurements: any[];

  /** Environment details */
  environment: BenchmarkEnvironment;
}

/**
 * Scenario comparison
 */
export interface ScenarioComparison {
  /** Scenario description */
  scenario: string;

  /** Baseline results */
  baseline: {
    avgTime: number;
    memory: number;
    consistency: number;
  };

  /** WASM results */
  wasm: {
    avgTime: number;
    memory: number;
    consistency: number;
  };

  /** Improvements */
  improvements: {
    speedup: number;
    memoryReduction: number;
    consistencyImprovement: number;
  };

  /** Whether targets are met */
  meetsTargets: {
    speed: boolean;
    memory: boolean;
  };
}

/**
 * Regression issue
 */
export interface RegressionIssue {
  /** Scenario name */
  scenario: string;

  /** Issue type */
  issue: 'insufficient_speedup' | 'memory_regression' | 'consistency_regression';

  /** Actual value */
  actual: number;

  /** Required value */
  required: number;
}

/**
 * Benchmark summary
 */
export interface BenchmarkSummary {
  /** Total speedup across scenarios */
  totalSpeedup: number;

  /** Average speedup */
  averageSpeedup: number;

  /** Memory improvement percentage */
  memoryImprovement: number;

  /** Detected regressions */
  regressions: RegressionIssue[];

  /** Whether benchmarks are met */
  meetsBenchmarks: boolean;

  /** Timestamp */
  timestamp: number;

  /** Environment details */
  environment: BenchmarkEnvironment;
}

/**
 * Complete benchmark results
 */
export interface BenchmarkResults {
  /** Scenario comparisons */
  scenarios: Record<string, ScenarioComparison>;

  /** Summary */
  summary: BenchmarkSummary;

  /** Raw data */
  rawData: {
    baseline: Record<string, BaselineMetrics>;
    wasm: Record<string, PerformanceMeasurement>;
  };
}

// ============================================================================
// Class Interfaces
// ============================================================================

/**
 * PerformanceBaselineTracker class interface
 */
export interface PerformanceBaselineTrackerInterface {
  options: Required<BaselineTrackerOptions>;
  performanceHistory: PerformanceDataPoint[];
  baselines: Map<string, PerformanceBaseline>;
  alerts: PerformanceAlert[];
  trends: Map<string, TrendAnalysisResults>;
  isActive: boolean;
  lastBaselineUpdate: number;
  monitoringStartTime: number;

  recordPerformance(operationType: string, metrics: Partial<PerformanceDataPoint>): void;
  updateBaselinesIfNeeded(operationType: string, dataPoint: PerformanceDataPoint): void;
  establishBaseline(operationType: string): void;
  updateBaseline(operationType: string): void;
  checkImmediateAlerts(operationType: string, dataPoint: PerformanceDataPoint): void;
  analyzeTrends(operationType: string): TrendAnalysisResults | null;
  getOperationHistory(operationType: string, limit?: number | null): PerformanceDataPoint[];
  getHealthSummary(): PerformanceHealthSummary;
  setupPeriodicAnalysis(): void;
  runPeriodicAnalysis(): void;
  calculateMean(values: number[]): number;
  calculateMedian(values: number[]): number;
  calculateStdDev(values: number[]): number;
  calculateTrendSlope(points: { x: number; y: number }[]): number;
}

/**
 * PerformanceProfiler class interface
 */
export interface PerformanceProfilerInterface {
  metrics: {
    translation: TranslationMetrics;
    dictionary: DictionaryMetrics;
    rendering: RenderingMetrics;
    memory: MemoryMetrics;
    parallel: ParallelMetrics;
    bottlenecks: PerformanceBottleneck[];
  };
  profilerStartTime: number;
  activeProfiles: Map<string, TranslationProfile>;
  performanceHistory: PerformanceHistoryEntry[];
  detectionThresholds: DetectionThresholds;

  startTranslationProfile(
    operationId: string,
    inputText: string,
    options?: Record<string, any>
  ): void;
  markTranslationPhase(
    operationId: string,
    phaseName: string,
    startTime: number,
    endTime: number,
    metadata?: Record<string, any>
  ): void;
  endTranslationProfile(
    operationId: string,
    outputText: string,
    result?: Record<string, any>
  ): void;
  updateDictionaryMetrics(cacheStats: any, sortingStats: any): void;
  recordRenderingMetrics(
    renderType: string,
    segmentCount: number,
    renderTime: number,
    metadata?: Record<string, any>
  ): void;
  updateMemoryMetrics(): void;
  getPerformanceReport(): PerformanceReport;
  detectBottlenecks(
    operationId: string,
    profile: TranslationProfile,
    totalTime: number,
    throughput: number
  ): void;
  addBottleneck(category: string, description: string, data?: Record<string, any>): void;
  getCurrentMemoryUsage(): number;
  formatBytes(bytes: number): string;
  getTextSizeCategory(length: number): 'small' | 'medium' | 'large' | 'huge';
}

/**
 * PerformanceMonitor class interface
 */
export interface PerformanceMonitorInterface {
  isProduction: boolean;
  sampleRate: number;
  maxSamples: number;
  enabled: boolean;
  samples: PerformanceSample[];
  aggregatedStats: AggregatedStats;
  cachedMetrics: PerformanceMonitorMetrics | null;
  lastCacheTime: number;
  cacheValidityMs: number;
  lastResetTime: number;

  shouldSample(): boolean;
  startTimer(operationId: string): PerformanceTimer | null;
  endTimer(timer: PerformanceTimer | null, operationName?: string): void;
  getMetrics(): PerformanceMonitorMetrics;
  reset(): void;
  log(level: number, message: string, ...args: any[]): void;
}

/**
 * WasmPerformanceBenchmark class interface
 */
export interface WasmPerformanceBenchmarkInterface {
  baselineMetrics: Map<string, BaselineMetrics>;
  wasmMetrics: Map<string, PerformanceMeasurement>;
  regressionThresholds: RegressionThresholds;
  performanceHistory: any[];
  currentSession: BenchmarkSession;

  establishBaseline(dictionaryManager: any): Promise<Map<string, BaselineMetrics>>;
  measureJavaScriptPerformance(
    dictionaryManager: any,
    scenario: BenchmarkScenario
  ): Promise<PerformanceMeasurement>;
  measureWasmPerformance(
    dictionaryManager: any,
    scenario: BenchmarkScenario
  ): Promise<PerformanceMeasurement>;
  performJSDictionaryLookup(dictionaryManager: any, text: string): Promise<any>;
  performWASMDictionaryLookup(dictionaryManager: any, text: string): Promise<any>;
  runCompleteBenchmarkSuite(dictionaryManager: any): Promise<BenchmarkResults>;
  captureEnvironment(): BenchmarkEnvironment;
  getCurrentMemoryUsage(): number;
  calculateAverage(values: number[]): number;
  calculateMedian(values: number[]): number;
  calculatePercentile(values: number[], percentile: number): number;
  calculateStandardDeviation(values: number[]): number;
  delay(ms: number): Promise<void>;
}
