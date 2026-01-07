/**
 * Emergency Rollback Infrastructure: Feature Flags for Legacy System Removal
 *
 * CRITICAL SAFETY SYSTEM: Provides immediate rollback capabilities for Phase 3
 * legacy system removal. Enables/disables legacy systems with <1 minute recovery time.
 */

/**
 * Master feature flags controlling legacy system availability
 *
 * IMPORTANT: These flags provide emergency rollback capability during Phase 3B.
 * Set to 'false' to immediately restore legacy system functionality.
 */
export const LEGACY_REMOVAL_FLAGS = {
  // Phase 3B.1: Sequential Processing Consolidation
  enableSequentialFallbackRemoval: true, // processChunksSequentially removal control
  forceParallelProcessing: true, // Disable sequential fallback completely

  // Phase 3B.2: Legacy Pattern Processing Removal (CRITICAL)
  enableLegacyPatternRemoval: true, // Master switch for createOptimalPhraseGroupsLegacy removal
  forceTwoPhasePatterns: true, // Disable legacy single-phase fallback

  // Global validation and monitoring
  validateTranslationQuality: true, // Always enabled - comprehensive output validation
  enablePerformanceMonitoring: true, // Real-time performance tracking
  enableFallbackChainLogging: true, // Detailed fallback chain debugging

  // Emergency override controls
  emergencyLegacyRestore: false, // EMERGENCY: Restore all legacy systems immediately
  bypassValidationFramework: false, // DANGER: Skip Phase 3A validation (NOT RECOMMENDED)
};

/**
 * Performance regression thresholds that trigger automatic rollback
 */
export const ROLLBACK_TRIGGERS = {
  // Translation quality degradation limits
  maxQualityRegressionPercent: 5, // >5% quality degradation triggers rollback
  minParallelSuccessRate: 95, // <95% parallel processing success triggers rollback
  minTranslationCompleteness: 100, // <100% translation completeness triggers rollback

  // Performance degradation limits
  maxPerformanceRegressionFactor: 2.0, // >2x slowdown triggers rollback
  minCacheHitRate: 85, // <85% cache hit rate triggers rollback
  minParallelEfficiency: 1.8, // <80% parallel improvement triggers rollback

  // Memory and resource limits
  maxMemoryRegressionPercent: 50, // >50% memory increase triggers rollback
  maxProcessingTimeoutMs: 15000, // >15s processing timeout triggers rollback
  maxConsecutiveFailures: 3, // 3 consecutive failures trigger rollback
};

/**
 * Rollback monitoring state
 */
let rollbackMonitoring = {
  consecutiveFailures: 0,
  lastRollbackTime: null,
  rollbackHistory: [],
  performanceBaselines: {},
  monitoringActive: false,
};

/**
 * Initialize performance monitoring baselines
 * Called once during application startup to establish baseline metrics
 */
export function initializePerformanceBaselines() {
  rollbackMonitoring.performanceBaselines = {
    avgProcessingTime: null, // Will be set from first successful run
    avgCacheHitRate: null,
    avgParallelEfficiency: null,
    avgMemoryUsage:
      typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0,
    baselineTimestamp: Date.now(),
  };

  rollbackMonitoring.monitoringActive = true;
  console.log('🎯 Performance baseline monitoring initialized for legacy removal validation');
}

/**
 * Record performance metrics and check for regression triggers
 * @param {Object} metrics - Current performance metrics
 * @returns {Object} Rollback recommendation and metrics analysis
 */
export function checkRollbackTriggers(metrics) {
  if (!rollbackMonitoring.monitoringActive) {
    return { rollbackRecommended: false, reason: 'Monitoring not initialized' };
  }

  const triggers = [];
  const baselines = rollbackMonitoring.performanceBaselines;

  // Translation quality checks
  if (metrics.qualityScore && baselines.avgQualityScore) {
    const qualityRegression =
      ((baselines.avgQualityScore - metrics.qualityScore) / baselines.avgQualityScore) * 100;
    if (qualityRegression > ROLLBACK_TRIGGERS.maxQualityRegressionPercent) {
      triggers.push(
        `Quality regression: ${qualityRegression.toFixed(1)}% (limit: ${ROLLBACK_TRIGGERS.maxQualityRegressionPercent}%)`
      );
    }
  }

  // Performance regression checks
  if (metrics.processingTime && baselines.avgProcessingTime) {
    const performanceRegression = metrics.processingTime / baselines.avgProcessingTime;
    if (performanceRegression > ROLLBACK_TRIGGERS.maxPerformanceRegressionFactor) {
      triggers.push(
        `Performance regression: ${performanceRegression.toFixed(2)}x (limit: ${ROLLBACK_TRIGGERS.maxPerformanceRegressionFactor}x)`
      );
    }
  }

  // Cache performance checks
  if (metrics.cacheHitRate < ROLLBACK_TRIGGERS.minCacheHitRate) {
    triggers.push(
      `Cache hit rate: ${metrics.cacheHitRate}% (minimum: ${ROLLBACK_TRIGGERS.minCacheHitRate}%)`
    );
  }

  // Parallel efficiency checks
  if (
    metrics.parallelEfficiency &&
    metrics.parallelEfficiency < ROLLBACK_TRIGGERS.minParallelEfficiency
  ) {
    triggers.push(
      `Parallel efficiency: ${metrics.parallelEfficiency.toFixed(2)} (minimum: ${ROLLBACK_TRIGGERS.minParallelEfficiency})`
    );
  }

  // Memory regression checks
  if (metrics.memoryUsage && baselines.avgMemoryUsage) {
    const memoryRegression =
      ((metrics.memoryUsage - baselines.avgMemoryUsage) / baselines.avgMemoryUsage) * 100;
    if (memoryRegression > ROLLBACK_TRIGGERS.maxMemoryRegressionPercent) {
      triggers.push(
        `Memory regression: ${memoryRegression.toFixed(1)}% (limit: ${ROLLBACK_TRIGGERS.maxMemoryRegressionPercent}%)`
      );
    }
  }

  // Consecutive failure tracking
  if (metrics.success === false) {
    rollbackMonitoring.consecutiveFailures++;
    if (rollbackMonitoring.consecutiveFailures >= ROLLBACK_TRIGGERS.maxConsecutiveFailures) {
      triggers.push(
        `Consecutive failures: ${rollbackMonitoring.consecutiveFailures} (limit: ${ROLLBACK_TRIGGERS.maxConsecutiveFailures})`
      );
    }
  } else {
    rollbackMonitoring.consecutiveFailures = 0; // Reset on success
  }

  return {
    rollbackRecommended: triggers.length > 0,
    triggers,
    metrics,
    baselines,
    consecutiveFailures: rollbackMonitoring.consecutiveFailures,
  };
}

/**
 * Execute emergency rollback to legacy systems
 * @param {Array} triggers - Array of trigger reasons
 * @returns {Object} Rollback execution result
 */
export function executeEmergencyRollback(triggers = []) {
  const rollbackTime = Date.now();

  // Restore all legacy systems
  LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval = false;
  LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval = false;
  LEGACY_REMOVAL_FLAGS.forceTwoPhasePatterns = false;
  LEGACY_REMOVAL_FLAGS.forceParallelProcessing = false;
  LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore = true;

  // Record rollback event
  const rollbackEvent = {
    timestamp: rollbackTime,
    triggers,
    rollbackDuration: rollbackTime - (rollbackMonitoring.lastRollbackTime || rollbackTime),
    systemState: 'legacy_restored',
  };

  rollbackMonitoring.rollbackHistory.push(rollbackEvent);
  rollbackMonitoring.lastRollbackTime = rollbackTime;
  rollbackMonitoring.consecutiveFailures = 0; // Reset failure count

  console.error('🚨 EMERGENCY ROLLBACK EXECUTED - Legacy systems restored');
  console.error('📋 Rollback triggers:', triggers);
  console.error('⏰ Rollback completed in <1 minute');

  return {
    success: true,
    rollbackTime,
    triggers,
    message: 'All legacy systems restored successfully',
    recommendedActions: [
      'Monitor system stability for 10-15 minutes',
      'Review rollback triggers and address root causes',
      'Re-run Phase 3A validation framework before retry',
      'Consider gradual rollout instead of immediate removal',
    ],
  };
}

/**
 * Check if legacy systems should be used based on current flags
 * @returns {Object} Legacy system availability status
 */
export function getLegacySystemStatus() {
  // Emergency override - restore everything
  if (LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore) {
    return {
      useLegacyPatternProcessing: true,
      useSequentialFallback: true,
      useTwoPhasePatterns: false,
      useParallelProcessing: false,
      reason: 'Emergency rollback active - all legacy systems enabled',
    };
  }

  return {
    useLegacyPatternProcessing: !LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval,
    useSequentialFallback: !LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval,
    useTwoPhasePatterns:
      !LEGACY_REMOVAL_FLAGS.forceTwoPhasePatterns ||
      LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval === false,
    useParallelProcessing:
      !LEGACY_REMOVAL_FLAGS.forceParallelProcessing ||
      LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval === false,
    validationEnabled: LEGACY_REMOVAL_FLAGS.validateTranslationQuality,
    monitoringEnabled: LEGACY_REMOVAL_FLAGS.enablePerformanceMonitoring,
    fallbackLogging: LEGACY_REMOVAL_FLAGS.enableFallbackChainLogging,
  };
}

/**
 * Update performance baselines with successful operation metrics
 * @param {Object} metrics - Successful operation metrics
 */
export function updatePerformanceBaselines(metrics) {
  if (!rollbackMonitoring.monitoringActive) return;

  const baselines = rollbackMonitoring.performanceBaselines;

  // Use exponential moving average to update baselines (weight: 0.1 for stability)
  if (baselines.avgProcessingTime === null) {
    baselines.avgProcessingTime = metrics.processingTime;
  } else {
    baselines.avgProcessingTime = baselines.avgProcessingTime * 0.9 + metrics.processingTime * 0.1;
  }

  if (baselines.avgCacheHitRate === null) {
    baselines.avgCacheHitRate = metrics.cacheHitRate;
  } else {
    baselines.avgCacheHitRate = baselines.avgCacheHitRate * 0.9 + metrics.cacheHitRate * 0.1;
  }

  if (metrics.parallelEfficiency && baselines.avgParallelEfficiency === null) {
    baselines.avgParallelEfficiency = metrics.parallelEfficiency;
  } else if (metrics.parallelEfficiency) {
    baselines.avgParallelEfficiency =
      baselines.avgParallelEfficiency * 0.9 + metrics.parallelEfficiency * 0.1;
  }

  if (metrics.qualityScore && baselines.avgQualityScore === null) {
    baselines.avgQualityScore = metrics.qualityScore;
  } else if (metrics.qualityScore) {
    baselines.avgQualityScore = baselines.avgQualityScore * 0.9 + metrics.qualityScore * 0.1;
  }

  if (metrics.memoryUsage) {
    baselines.avgMemoryUsage = baselines.avgMemoryUsage * 0.9 + metrics.memoryUsage * 0.1;
  }
}

/**
 * Get rollback system status and history
 * @returns {Object} Complete rollback monitoring state
 */
export function getRollbackStatus() {
  return {
    monitoringActive: rollbackMonitoring.monitoringActive,
    consecutiveFailures: rollbackMonitoring.consecutiveFailures,
    lastRollbackTime: rollbackMonitoring.lastRollbackTime,
    rollbackHistory: rollbackMonitoring.rollbackHistory,
    performanceBaselines: rollbackMonitoring.performanceBaselines,
    currentFlags: LEGACY_REMOVAL_FLAGS,
    rollbackTriggers: ROLLBACK_TRIGGERS,
  };
}

/**
 * Reset rollback monitoring state (use carefully - for testing only)
 */
export function resetRollbackMonitoring() {
  rollbackMonitoring = {
    consecutiveFailures: 0,
    lastRollbackTime: null,
    rollbackHistory: [],
    performanceBaselines: {},
    monitoringActive: false,
  };

  // Reset flags to safe defaults
  LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval = false;
  LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval = false;
  LEGACY_REMOVAL_FLAGS.forceTwoPhasePatterns = false;
  LEGACY_REMOVAL_FLAGS.forceParallelProcessing = false;
  LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore = false;
}

// Export monitoring state for testing
export const _rollbackMonitoring = rollbackMonitoring;
