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
