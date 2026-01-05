/**
 * Optimized Translation Engine
 * Single-pass, token-based translation with efficient dictionary lookups and pattern matching
 */

import { TextTokenizer, TokenType } from './TextTokenizer.js';
import { EnhancedDictionaryManager } from './EnhancedDictionaryManager.js';
import { SemanticPatternProcessor } from './SemanticPatternProcessor.js';
import { TextChunker } from './TextChunker.js';
import { NumberProcessor } from './NumberProcessor.js';
import { QuoteProcessor } from './QuoteProcessor.js';
import { SemanticArrayBuilder } from './SemanticArrayBuilder.js';
import { OptimizedSemanticArrayBuilder } from './OptimizedSemanticArrayBuilder.js';
import { performanceProfiler } from './PerformanceProfiler.js';
import TwoPhasePatternProcessor from './TwoPhasePatternProcessor.js';
import { parallelConfig } from './ParallelConfig.js';
// WasmTranslationAccelerator removed - using pure JavaScript translation
// WASM NumberProcessor added as focused feature (following migration guide advice)
import { processNumbersWasm } from './WasmNumberProcessor.js';
import { copyWasmTokens } from '../../types/WasmTypes.js';
import {
  getLegacySystemStatus,
  checkRollbackTriggers,
  updatePerformanceBaselines,
  initializePerformanceBaselines
} from './LegacySystemFlags.js';
// TranslationSegmentCache removed - cache quality issues led to removal
import { batchLog, performanceLogger } from './BatchLogger.js';
import { adaptiveChunker } from './AdaptiveChunker.js';
import { globalPerformanceMonitor } from './PerformanceMonitor.js';
import { SmartMemoryPressureDetector, BackgroundCleanupManager, ComponentMemoryProfiler } from './MemoryManagementRefinements.js';
import { systemPerformanceMonitor } from './ProactivePerformanceDetector.js';
import { MEMORY_THRESHOLDS, UI_UPDATE_THRESHOLDS } from '../constants/PerformanceThresholds.js';
import { TranslationProfiler } from './TranslationProfiler.js';

/**
 * @import {
 *   TranslationEngine,
 *   TranslationEngineInitOptions,
 *   TranslationOptions,
 *   TranslationResult,
 *   CharacterOnlyResult,
 *   TranslationProgressData,
 *   EngineStats,
 *   MemoryPressureThresholds,
 *   MemoryCleanupEvent,
 *   MemorySnapshot,
 *   BatchPerformanceMetrics,
 *   TranslationSegment,
 *   WasmStatus,
 *   DEBUG_LEVELS,
 *   DebugLevel
 * } from '../types/TranslationEngineTypes'
 */

// ============================================================================
// SECTION 1: MEMORY MANAGEMENT UTILITIES
// ============================================================================
// Purpose: Memory leak detection, tracking, and trend analysis
// Dependencies: None (pure utility class)
// Extraction Potential: HIGH - Can be moved to separate file
// Lines: ~350 lines
// ============================================================================

/**
 * Memory Leak Detection Utility
 * Tracks memory usage patterns during translation to identify accumulation
 */
class MemoryLeakDetector {
  constructor() {
    this.snapshots = [];
    this.startMemory = this.getCurrentMemory();
    this.trends = {
      shortTerm: [], // Last 10 measurements
      longTerm: [],  // Last 100 measurements (downsampled)
      alerts: []     // Memory warnings
    };
    this.cleanupThresholds = {
      warning: 0.75,  // 75% of heap
      critical: 0.85, // 85% of heap
      emergency: 0.95 // 95% of heap
    };
    this.onCleanupNeeded = null; // Callback for cleanup requests
  }

  getCurrentMemory() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };
    }
    return null;
  }

  recordSnapshot(operation = 'unknown', context = {}) {
    const memory = this.getCurrentMemory();
    if (!memory) return null;

    const snapshot = {
      operation,
      memory,
      context,
      memoryGrowth: memory.used - this.startMemory.used,
      memoryGrowthMB: (memory.used - this.startMemory.used) / (1024 * 1024),
      trend: this.calculateTrend(),
      timestamp: memory.timestamp
    };

    this.snapshots.push(snapshot);
    this.updateTrends(snapshot);
    this.checkThresholds(snapshot);

    // Keep only recent snapshots to prevent memory leak in the detector itself
    if (this.snapshots.length > 50) {
      this.snapshots = this.snapshots.slice(-25);
    }

    return snapshot;
  }

  // Legacy method for backward compatibility
  takeSnapshot(batchIndex, context = {}) {
    return this.recordSnapshot(`batch_${batchIndex}`, { batchIndex, ...context });
  }

  calculateTrend() {
    if (this.snapshots.length < 2) return 0;
    
    const recent = this.snapshots.slice(-5); // Last 5 snapshots
    if (recent.length < 2) return 0;
    
    const trend = recent[recent.length - 1].memory.used - recent[0].memory.used;
    return trend / recent.length; // Average change per snapshot
  }

  updateTrends(snapshot) {
    this.trends.shortTerm.push({
      timestamp: snapshot.timestamp,
      used: snapshot.memory.used,
      trend: snapshot.trend,
      operation: snapshot.operation
    });

    // Keep last 10 for short term
    if (this.trends.shortTerm.length > 10) {
      this.trends.shortTerm.shift();
    }

    // Sample every 10th for long term
    if (this.snapshots.length % 10 === 0) {
      this.trends.longTerm.push({
        timestamp: snapshot.timestamp,
        used: snapshot.memory.used,
        trend: snapshot.trend,
        operation: snapshot.operation
      });

      if (this.trends.longTerm.length > 100) {
        this.trends.longTerm.shift();
      }
    }
  }

  checkThresholds(snapshot) {
    const ratio = snapshot.memory.used / snapshot.memory.limit;
    const _now = Date.now();

    if (ratio >= this.cleanupThresholds.emergency) {
      this.triggerEmergencyCleanup(snapshot);
    } else if (ratio >= this.cleanupThresholds.critical) {
      this.triggerCriticalAlert(snapshot);
    } else if (ratio >= this.cleanupThresholds.warning) {
      this.triggerWarning(snapshot);
    }
  }

  triggerWarning(snapshot) {
    const alert = {
      level: 'warning',
      timestamp: Date.now(),
      usage: snapshot.memory.used,
      limit: snapshot.memory.limit,
      ratio: snapshot.memory.used / snapshot.memory.limit,
      recommendation: 'Consider manual cleanup or reduce batch size'
    };

    this.trends.alerts.push(alert);
    
    // Keep only last 20 alerts
    if (this.trends.alerts.length > 20) {
      this.trends.alerts.shift();
    }

    batchLog.warn(`⚠️ Memory usage at ${(alert.ratio * 100).toFixed(1)}%`, {
      usedMB: (alert.usage / (1024 * 1024)).toFixed(1),
      limitMB: (alert.limit / (1024 * 1024)).toFixed(1)
    });
  }

  triggerCriticalAlert(snapshot) {
    const alert = {
      level: 'critical',
      timestamp: Date.now(),
      usage: snapshot.memory.used,
      limit: snapshot.memory.limit,
      ratio: snapshot.memory.used / snapshot.memory.limit,
      recommendation: 'Automatic cleanup triggered'
    };

    this.trends.alerts.push(alert);
    
    if (this.trends.alerts.length > 20) {
      this.trends.alerts.shift();
    }

    batchLog.error(`🚨 Critical memory usage at ${(alert.ratio * 100).toFixed(1)}%`, {
      usedMB: (alert.usage / (1024 * 1024)).toFixed(1),
      limitMB: (alert.limit / (1024 * 1024)).toFixed(1)
    });
    
    // Trigger automatic cleanup
    this.requestCleanup('automatic');
  }

  triggerEmergencyCleanup(snapshot) {
    const alert = {
      level: 'emergency',
      timestamp: Date.now(),
      usage: snapshot.memory.used,
      limit: snapshot.memory.limit,
      ratio: snapshot.memory.used / snapshot.memory.limit,
      recommendation: 'Emergency cleanup and GC triggered'
    };

    this.trends.alerts.push(alert);
    
    if (this.trends.alerts.length > 20) {
      this.trends.alerts.shift();
    }

    batchLog.error(`🆘 Emergency memory cleanup at ${(alert.ratio * 100).toFixed(1)}%`, {
      usedMB: (alert.usage / (1024 * 1024)).toFixed(1),
      limitMB: (alert.limit / (1024 * 1024)).toFixed(1)
    });
    
    // Emergency cleanup
    this.requestCleanup('emergency');
    this.requestGarbageCollection();
  }

  requestCleanup(level = 'automatic') {
    // Trigger cleanup in translation engine
    if (this.onCleanupNeeded) {
      this.onCleanupNeeded(level);
    }
  }

  requestGarbageCollection() {
    if (typeof window !== 'undefined' && window.gc) {
      batchLog.info('🗑️ Triggering manual garbage collection');
      window.gc();
    } else if (typeof global !== 'undefined' && global.gc) {
      batchLog.info('🗑️ Triggering manual garbage collection');
      global.gc();
    }
  }

  detectLeaks(currentSnapshot) {
    if (this.snapshots.length < 3) return null;

    const recent = this.snapshots.slice(-3);
    const memoryGrowthRate = (recent[2].memory.used - recent[0].memory.used) / 2; // Per batch
    const totalGrowthMB = currentSnapshot.memoryGrowthMB;

    // Detect memory usage patterns (distinguish semantic array construction from actual leaks)
    const memoryGrowthMB = memoryGrowthRate / (1024 * 1024);
    
    const analysis = {
      memoryGrowthRate: memoryGrowthMB, // MB per batch
      totalGrowthMB,
      // Revised thresholds: Higher limits for legitimate semantic array construction
      isHighUsage: memoryGrowthMB > 8, // >8MB per batch (semantic arrays for long texts)
      isExcessive: totalGrowthMB > 200, // >200MB total (very long texts or actual leaks)
      currentRatio: currentSnapshot.memory.used / currentSnapshot.memory.limit,
      trendAnalysis: this.analyzeTrends()
    };

    return analysis;
  }

  analyzeTrends() {
    if (this.trends.shortTerm.length < 3) return null;

    const shortTerm = this.trends.shortTerm;
    const avgTrend = shortTerm.reduce((sum, t) => sum + t.trend, 0) / shortTerm.length;
    const recentUsage = shortTerm.map(t => t.used);
    const minUsage = Math.min(...recentUsage);
    const maxUsage = Math.max(...recentUsage);
    
    return {
      averageTrend: avgTrend / (1024 * 1024), // MB
      memoryVariance: (maxUsage - minUsage) / (1024 * 1024), // MB
      isStable: Math.abs(avgTrend) < 1024 * 1024, // <1MB change
      isIncreasing: avgTrend > 2 * 1024 * 1024, // >2MB increase trend
      recentAlerts: this.trends.alerts.filter(a => (Date.now() - a.timestamp) < 300000).length // Last 5 minutes
    };
  }

  getAnalysis() {
    const current = this.snapshots[this.snapshots.length - 1];
    if (!current) return null;

    return {
      current: {
        usedMB: (current.memory.used / (1024 * 1024)).toFixed(1),
        totalMB: (current.memory.total / (1024 * 1024)).toFixed(1),
        limitMB: (current.memory.limit / (1024 * 1024)).toFixed(1),
        ratio: (current.memory.used / current.memory.limit * 100).toFixed(1) + '%'
      },
      trends: {
        shortTerm: this.analyzeShortTrend(),
        longTerm: this.analyzeLongTrend()
      },
      alerts: this.trends.alerts.slice(-5),
      recommendations: this.generateRecommendations()
    };
  }

  analyzeShortTrend() {
    if (this.trends.shortTerm.length < 2) return null;
    
    const data = this.trends.shortTerm;
    const first = data[0];
    const last = data[data.length - 1];
    const change = (last.used - first.used) / (1024 * 1024);
    const timespan = last.timestamp - first.timestamp;
    
    return {
      changeMB: change.toFixed(1),
      timespanMs: timespan,
      ratePerMinute: ((change / (timespan / 60000)) || 0).toFixed(2)
    };
  }

  analyzeLongTrend() {
    if (this.trends.longTerm.length < 2) return null;
    
    const data = this.trends.longTerm;
    const first = data[0];
    const last = data[data.length - 1];
    const change = (last.used - first.used) / (1024 * 1024);
    const timespan = last.timestamp - first.timestamp;
    
    return {
      changeMB: change.toFixed(1),
      timespanMs: timespan,
      ratePerHour: ((change / (timespan / 3600000)) || 0).toFixed(2)
    };
  }

  generateRecommendations() {
    const recommendations = [];
    const analysis = this.analyzeTrends();
    
    if (!analysis) return recommendations;

    if (analysis.isIncreasing) {
      recommendations.push('Memory usage is consistently increasing - consider reducing batch sizes');
    }
    
    if (analysis.recentAlerts > 3) {
      recommendations.push('Multiple memory alerts detected - enable automatic cleanup');
    }
    
    if (!analysis.isStable) {
      recommendations.push('Memory usage is unstable - check for memory leaks in processing logic');
    }

    return recommendations;
  }

  getReport() {
    if (this.snapshots.length === 0) return null;

    const latest = this.snapshots[this.snapshots.length - 1];
    return {
      totalSnapshots: this.snapshots.length,
      memoryGrowthMB: latest.memoryGrowthMB,
      currentUsedMB: latest.memory.used / (1024 * 1024),
      analysis: this.getAnalysis(),
      snapshots: this.snapshots.map(s => ({
        operation: s.operation,
        growthMB: s.memoryGrowthMB.toFixed(1),
        usedMB: (s.memory.used / (1024 * 1024)).toFixed(1),
        timestamp: s.timestamp
      }))
    };
  }
}

// Debug logging levels
export const DEBUG_LEVELS = {
  ERROR: 0,   // Only errors and warnings
  INFO: 1,    // Key milestones and results
  DEBUG: 2,   // Detailed phase information
  VERBOSE: 3  // Ultra-detailed token-by-token logging
};

// ============================================================================
// SECTION 2: CORE ENGINE CLASS - CONSTRUCTOR & INITIALIZATION
// ============================================================================
// Purpose: Main engine class, configuration, and system setup
// Dependencies: All translation subsystems
// Extraction Potential: NONE - Central coordinator, must remain coupled
// Critical: Manages shared state across all 5 phases
// ============================================================================

export class TranslationEngine {
  constructor() {
    this.tokenizer = new TextTokenizer();
    // Get dictionary configuration from ParallelConfig
    const dictionaryConfig = parallelConfig.getOptimalConfig('dictionary');
    
    this.dictionaryManager = new EnhancedDictionaryManager({
      // Enable caching with optimized cache sizes
      cacheEnabled: true,
      characterCacheSize: 500,  // Most frequently used
      phraseCacheSize: 1000,   // Moderate frequency  
      patternCacheSize: 200,   // Less frequent but expensive
      lookupCacheSize: 800,    // Multi-dictionary searches
      
      // Phase-level parallelization: Dictionary lookup parallelization
      enableParallelLookups: dictionaryConfig.enabled,
      maxParallelDictionaries: dictionaryConfig.maxParallelDictionaries,
      dictionaryParallelThreshold: dictionaryConfig.parallelThreshold,
      
      // WASM integration settings
      enableWasm: true,
      wasmMemoryLimit: 20, // 20MB for production use
      debugLevel: 1 // INFO level for WASM logs
    });
    this.semanticPatternProcessor = new SemanticPatternProcessor();
    this.textChunker = new TextChunker();
    this.numberProcessor = new NumberProcessor();
    
    // WASM Core Engine REMOVED:
    // Phase 6 & 7 WASM translation acceleration was disabled due to:
    // - Dictionary lookups returning 0 matches
    // - Pattern matching integration issues
    // - Maintaining pure JavaScript for reliability and translation quality
    // Tauri Rust backend (file I/O, parallel loading) remains active and working perfectly

    // Feature flag for optimized semantic array builder
    this.useOptimizedSemanticBuilder = process.env.NODE_ENV === 'development' ||
      (typeof window !== 'undefined' && window.location?.search?.includes('optimized-semantics=true'));
    
    if (this.useOptimizedSemanticBuilder) {
      this.semanticArrayBuilder = new OptimizedSemanticArrayBuilder();
      batchLog.info('semantic-optimization', 'Using OptimizedSemanticArrayBuilder for improved memory efficiency');
    } else {
      this.semanticArrayBuilder = new SemanticArrayBuilder();
    }

    this.isInitialized = false;
    // PERFORMANCE OPTIMIZATION: Reduce default logging to prevent console spam
    this.debugLevel = process.env.NODE_ENV === 'production' ? DEBUG_LEVELS.ERROR : DEBUG_LEVELS.DEBUG; // Production: errors only, Development: debug messages
    this.punctuationDict = {}; // Store punctuation translation dictionary
    this.stats = {
      totalTranslations: 0,
      totalTime: 0,
      tokenStats: new Map(),
      patternStats: new Map(),
    };
    
    // Initialize parallel processing configuration (will be set during first use)
    this.parallelConfig = null;
    
    // Translation segments for interactive highlighting
    this.translationSegments = [];
    
    // Hierarchical pattern processing settings
    this.settings = {
      enableTwoPhasePatterns: true, // Enable hierarchical pattern processing
      maxCompositeDetectionTime: 100, // ms
      fallbackToSinglePhase: true
    };
    
    // Initialize legacy system monitoring for Phase 3 removal
    this.legacySystemStatus = getLegacySystemStatus();
    initializePerformanceBaselines();

    // Initialize translation profiler for performance analysis
    this.profiler = new TranslationProfiler();

    // Store reference to TwoPhasePatternProcessor for internal profiling
    this.twoPhaseProcessor = null;
  }

  /**
   * Log message based on debug level
   * @param {number} level - Debug level required
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  log(level, message, data = null) {
    // Use optimized performance monitor for environment-aware logging with sampling
    if (globalPerformanceMonitor) {
      if (data !== null) {
        globalPerformanceMonitor.log(level, message, data);
      } else {
        globalPerformanceMonitor.log(level, message);
      }
    }
    // Fallback to original behavior if monitor not available
    else if (this.debugLevel >= level) {
      if (process.env.NODE_ENV === 'development') {
        if (data !== null) {
          console.log(message, data);
        } else {
          console.log(message);
        }
      }
    }
  }

  /**
   * Calculate maximum safe token count based on available device memory
   * @returns {number} Maximum tokens that can be safely processed
   */
  calculateMaxTokensForDevice() {
    const defaultMaxTokens = 15000; // Conservative fallback for older browsers
    
    try {
      // Use performance memory API if available (Chrome/Edge)
      if (performance.memory) {
        const totalMemory = performance.memory.jsHeapSizeLimit;
        const usedMemory = performance.memory.usedJSHeapSize;
        const availableMemory = totalMemory - usedMemory;
        
        // Estimate memory per token: ~100 bytes per token (conservative)
        // Includes token object, translation data, semantic arrays, DOM elements
        const estimatedBytesPerToken = 100;
        const maxTokensByMemory = Math.floor(availableMemory * 0.3 / estimatedBytesPerToken); // Use 30% of available memory
        
        // Device-specific limits based on total memory
        let deviceMaxTokens;
        if (totalMemory > 4 * 1024 * 1024 * 1024) { // >4GB heap limit
          deviceMaxTokens = 50000; // High-memory device
        } else if (totalMemory > 2 * 1024 * 1024 * 1024) { // >2GB heap limit  
          deviceMaxTokens = 25000; // Medium-memory device
        } else {
          deviceMaxTokens = 10000; // Low-memory device
        }
        
        // Return the minimum of memory-based and device-based limits
        const calculatedLimit = Math.min(maxTokensByMemory, deviceMaxTokens);
        this.log(DEBUG_LEVELS.DEBUG, `🖥️ Device token limit: ${calculatedLimit} (memory: ${maxTokensByMemory}, device: ${deviceMaxTokens})`);
        
        return Math.max(calculatedLimit, 5000); // Minimum 5K tokens even on constrained devices
      }
      
      // Fallback for browsers without performance.memory API
      const navigatorMemory = navigator.deviceMemory; // GB, available in some browsers
      if (navigatorMemory) {
        if (navigatorMemory >= 8) return 40000;      // 8GB+ RAM
        if (navigatorMemory >= 4) return 25000;      // 4-8GB RAM  
        if (navigatorMemory >= 2) return 15000;      // 2-4GB RAM
        return 8000;                                 // <2GB RAM
      }
      
    } catch (_error) {
      this.log(DEBUG_LEVELS.WARN, '⚠️ Device memory detection failed, using conservative limits:', _error);
    }
    
    return defaultMaxTokens;
  }

  /**
   * Initialize Core Translation Engine (WASM removed)
   * WASM translation was removed - using pure JavaScript for reliability
   */
  async initializeCoreEngine() {
    // WASM Core Engine removed - translation now uses pure JavaScript
    // This method kept for backward compatibility (called during initialization)
  }

  // ============================================================================
  // SECTION 3: DICTIONARY OPERATIONS
  // ============================================================================
  // Purpose: Dictionary lookups, caching, synchronization
  // Dependencies: DictionaryManager, caching system
  // Extraction Potential: NONE - Timing-sensitive, phase-critical
  // Critical: Cache invalidation must coordinate with phase processing
  // ============================================================================

  /**
   * Semantic Dictionary Lookup with Cache
   * OPTIMIZATION: Checks semantic translation cache before dictionary lookup
   * Improves cache hit rates by recognizing similar translation patterns
   */
  async findAllMatchesWithSemanticCache(fullText, textPosition, dictionaryTypes) {
    // OPTIMIZATION FIX: Phase-aware semantic caching
    // Cache must respect 5-phase processing order: Pattern → Proper Noun → Number → Phrase → Character
    // Lower phases (proper nouns) take priority over higher phases (phrases, characters)

    const lookupText = fullText.substring(textPosition, textPosition + 20);
    // FIXED: Include phase info in cache key to prevent cross-phase contamination
    const dictionarySource = dictionaryTypes.join(',');
    const phaseInfo = dictionaryTypes.includes('phrases') ? 'phrase' :
                     dictionaryTypes.includes('characters') ? 'character' :
                     dictionaryTypes.some(d => d.includes('properNoun')) ? 'properNoun' : 'other';

    // Define phase priority (lower number = higher priority)
    const getPhasePriority = (dictionaryType) => {
      if (dictionaryType.includes('pattern')) return 1;
      if (dictionaryType.includes('properNouns') || dictionaryType.includes('properNoun')) return 2;
      if (dictionaryType.includes('number')) return 3;
      if (dictionaryType.includes('phrase')) return 4;
      if (dictionaryType.includes('character')) return 5;
      return 6; // Unknown types get lowest priority
    };

    const currentPhasePriority = Math.min(...dictionaryTypes.map(getPhasePriority));

    // Perform dictionary lookup (semantic caching removed for translation quality)
    const matches = await this.dictionaryManager.findAllMatchesAsync(
      fullText,
      textPosition,
      dictionaryTypes
    );


    // No caching - prioritize translation quality over performance

    return matches;
  }

  /**
   * Sync dictionaries to Phase 6 Core Engine (Rust)
   * Instead of extracting from trie structures, use the original dictionary data stored in the engine
   */
  async syncDictionaries() {
    // WASM Core Engine removed - this method is a no-op
    // Kept for backward compatibility (may be called during initialization)
  }

  // ============================================================================
  // SECTION 4: SMART MEMORY MANAGEMENT
  // ============================================================================
  // Purpose: Memory pressure detection, cleanup scheduling, profiling
  // Dependencies: Memory detection systems, background cleanup
  // Extraction Potential: MEDIUM - Cleanup strategies can be extracted
  // Critical: Cleanup timing must not interfere with translation
  // ============================================================================

  /**
   * Initialize Smart Memory Management Refinements
   * Enhances existing memory management without affecting core translation functionality
   */
  initializeSmartMemoryManagement() {
    try {
      // Smart memory pressure detector for more accurate cleanup triggers
      this.smartMemoryDetector = new SmartMemoryPressureDetector({
        lowPressure: 0.6,      // 60% heap usage
        mediumPressure: 0.75,  // 75% heap usage  
        highPressure: 0.85,    // 85% heap usage
        criticalPressure: 0.95, // 95% heap usage
        samplingInterval: 10000, // Sample every 10 seconds
        growthThreshold: 15     // 15MB/minute growth rate threshold
      });

      // Background cleanup manager for non-urgent cleanup tasks
      this.backgroundCleanup = new BackgroundCleanupManager();

      // Component memory profiler for tracking memory usage by operation type
      this.memoryProfiler = new ComponentMemoryProfiler();

      // Set up smart cleanup callback
      this.smartMemoryDetector.onMemoryEvent('cleanup', (cleanupEvent) => {
        this.handleSmartCleanup(cleanupEvent);
      });

      // Set up monitoring callback for development insights
      if (process.env.NODE_ENV === 'development') {
        this.smartMemoryDetector.onMemoryEvent('monitoring', (data) => {
          if (data.pressure.level === 'high' || data.pressure.level === 'critical') {
            this.log(DEBUG_LEVELS.DEBUG, 
              `🧠 Smart Memory: ${data.pressure.level} pressure (${(data.pressure.ratio * 100).toFixed(1)}%), growth: ${data.growthRate.toFixed(1)}MB/min`);
          }
        });
      }

      this.log(DEBUG_LEVELS.DEBUG, '✅ Smart memory management refinements initialized');
      
    } catch (error) {
      this.log(DEBUG_LEVELS.WARN, '⚠️ Failed to initialize smart memory management:', error.message);
      // Graceful degradation - continue with existing memory management
      this.smartMemoryDetector = null;
      this.backgroundCleanup = null;
      this.memoryProfiler = null;
    }
  }

  /**
   * Handle smart cleanup events based on memory pressure and growth rate
   */
  handleSmartCleanup(cleanupEvent) {
    const { urgency, pressure, growthRate } = cleanupEvent;

    // Profile the cleanup operation
    const profileId = this.memoryProfiler?.startProfiling('TranslationEngine', `smart-cleanup-${urgency}`);

    try {
      switch (urgency) {
        case 'critical':
          // Emergency cleanup - immediate action required
          this.performEmergencyCleanup();
          this.log(DEBUG_LEVELS.WARN, 
            `🚨 Emergency cleanup triggered: ${(pressure.ratio * 100).toFixed(1)}% memory usage`);
          break;

        case 'high':
          // High priority cleanup - process immediately
          this.performHighPriorityCleanup();
          this.log(DEBUG_LEVELS.INFO, 
            `🧹 High priority cleanup: ${(pressure.ratio * 100).toFixed(1)}% memory usage`);
          break;

        case 'medium':
          // Medium priority - queue for background processing
          this.queueBackgroundCleanup('medium');
          break;

        case 'low':
          // Low priority - queue for idle time processing
          this.queueBackgroundCleanup('low');
          break;
      }

    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '❌ Smart cleanup failed:', error.message);
    } finally {
      // Complete memory profiling
      if (profileId) {
        this.memoryProfiler?.completeProfiling(profileId, {
          urgency,
          pressureLevel: pressure.level,
          memoryRatio: pressure.ratio,
          growthRate
        });
      }
    }
  }

  /**
   * Perform emergency cleanup - immediate and aggressive
   */
  performEmergencyCleanup() {
    // Clear translation segments aggressively
    if (this.translationSegments && this.translationSegments.length > 3) {
      const oldCount = this.translationSegments.length;
      this.translationSegments = this.translationSegments.slice(-3); // Keep only last 3
      this.log(DEBUG_LEVELS.DEBUG, `🚨 Emergency: Cleared ${oldCount - 3} translation segments`);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clear semantic array builder cache if available
    if (this.semanticArrayBuilder && typeof this.semanticArrayBuilder.clearCache === 'function') {
      this.semanticArrayBuilder.clearCache();
    }
  }

  /**
   * Perform high priority cleanup - immediate but less aggressive
   */
  performHighPriorityCleanup() {
    // Clear translation segments moderately
    if (this.translationSegments && this.translationSegments.length > 5) {
      const oldCount = this.translationSegments.length;
      this.translationSegments = this.translationSegments.slice(-5); // Keep last 5
      this.log(DEBUG_LEVELS.DEBUG, `🧹 High priority: Cleared ${oldCount - 5} translation segments`);
    }

    // Clear performance history if it's getting large
    if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 50) {
      this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-20);
    }
  }

  /**
   * Queue cleanup tasks for background processing
   */
  queueBackgroundCleanup(priority) {
    if (!this.backgroundCleanup) return;

    // Queue cleanup tasks based on priority
    const cleanupTasks = [
      {
        task: () => this.cleanupOldPerformanceData(),
        priority: priority === 'low' ? 'low' : 'normal'
      },
      {
        task: () => this.optimizeMemoryStructures(),
        priority
      }
    ];

    cleanupTasks.forEach(({ task, priority }) => {
      this.backgroundCleanup.queueCleanup(task, priority);
    });
  }

  /**
   * Clean up old performance data in background
   */
  cleanupOldPerformanceData() {
    // Clean batch performance history
    if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 100) {
      this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-50);
    }

    // Clean memory tracker snapshots
    if (this.memoryTracker && this.memoryTracker.snapshots) {
      if (this.memoryTracker.snapshots.length > 25) {
        this.memoryTracker.snapshots = this.memoryTracker.snapshots.slice(-15);
      }
    }

    return true; // Indicate success
  }

  /**
   * Optimize memory structures in background  
   */
  optimizeMemoryStructures() {
    // Trim translation segments to reasonable size
    if (this.translationSegments && this.translationSegments.length > 35) {
      this.translationSegments = this.translationSegments.slice(-35);
    }

    // Optimize dictionary manager caches if available
    if (this.dictionaryManager && typeof this.dictionaryManager.optimizeCaches === 'function') {
      this.dictionaryManager.optimizeCaches();
    }

    return true; // Indicate success
  }

  /**
   * Start memory profiling for a translation operation
   */
  startMemoryProfiling(operationName, operationId = 'default') {
    if (!this.memoryProfiler) return null;
    return this.memoryProfiler.startProfiling(operationName, operationId);
  }

  /**
   * Complete memory profiling for a translation operation
   */
  completeMemoryProfiling(profileId, metadata = {}) {
    if (!this.memoryProfiler || !profileId) return null;
    return this.memoryProfiler.completeProfiling(profileId, metadata);
  }

  /**
   * Get smart memory management statistics
   */
  getSmartMemoryStats() {
    const stats = {
      smartMemoryEnabled: !!this.smartMemoryDetector,
      backgroundCleanupEnabled: !!this.backgroundCleanup,
      memoryProfilingEnabled: !!this.memoryProfiler,
    };

    if (this.smartMemoryDetector) {
      stats.memoryPressure = this.smartMemoryDetector.getStats();
    }

    if (this.backgroundCleanup) {
      stats.backgroundCleanup = this.backgroundCleanup.getStats();
    }

    if (this.memoryProfiler) {
      stats.memoryProfiling = this.memoryProfiler.getProfilerStats();
      stats.topMemoryConsumers = this.memoryProfiler.getTopMemoryConsumers(5);
    }

    return stats;
  }

  /**
   * Cleanup smart memory management on engine shutdown
   */
  shutdownSmartMemoryManagement() {
    if (this.smartMemoryDetector) {
      this.smartMemoryDetector.stop();
      this.smartMemoryDetector = null;
    }

    if (this.backgroundCleanup) {
      this.backgroundCleanup.clear();
      this.backgroundCleanup = null;
    }

    if (this.memoryProfiler) {
      this.memoryProfiler.setEnabled(false);
      this.memoryProfiler = null;
    }
  }

  // ============================================================================
  // SECTION 5: ENGINE INITIALIZATION
  // ============================================================================
  // Purpose: Load dictionaries, configure subsystems, prepare engine
  // Dependencies: All subsystems (DictionaryManager, PatternProcessor, etc.)
  // Extraction Potential: NONE - System-wide coordination required
  // Critical: Initialization order affects pattern compilation and caching
  // ============================================================================

  /**
   * Initialize the engine with dictionaries
   * @param {Object} dictionaries - Dictionary data
   * @param {Object} options - Initialization options
   */
  async initialize(dictionaries, options = {}) {
    // Store dictionaries for Core Engine sync
    this.lastLoadedDictionaries = dictionaries;
    console.log(`🔧 Stored dictionaries for Core Engine sync: ${Object.keys(dictionaries).join(', ')}`);
    
    // Set debug level from options
    // PERFORMANCE: Keep error-only logging for normal operation
    this.debugLevel = DEBUG_LEVELS.ERROR;
    const startTime = performance.now();

    try {
      // Load active proper noun dictionaries configuration
      let activeProperNouns = ['properNouns']; // default fallback
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data.activeProperNouns) {
          activeProperNouns = configResult.data.activeProperNouns;
        }
      } catch (_error) {
        // Config loading failed, use default
        this.log(DEBUG_LEVELS.DEBUG, 'Could not load configuration, using default proper nouns');
      }


      // Store active proper nouns for use in translation processing
      this.activeProperNouns = activeProperNouns;
      this.log(DEBUG_LEVELS.DEBUG, '🔧 Active proper noun dictionaries:', this.activeProperNouns);

      // Load dictionaries into trie structures (with lazy loading for inactive proper nouns)
      const dictionaryConfig = parallelConfig.getOptimalConfig('dictionary');
      await this.dictionaryManager.loadDictionaries(dictionaries, { 
        ...options, 
        activeProperNouns: this.activeProperNouns,
        preWarmCache: dictionaryConfig.cachePrewarm
      });
      
      // Cache proper noun translations for capitalization preservation
      this.properNounTranslations = new Map(); // Maps lowercase translation -> original capitalization
      this.activeProperNouns.forEach(dictionaryName => {
        const dictionary = dictionaries[dictionaryName];
        if (dictionary) {
          this.log(DEBUG_LEVELS.DEBUG, `🏛️ Loading ${dictionaryName} with ${Object.keys(dictionary).length} entries`);
          Object.entries(dictionary).forEach(([chinese, vietnamese]) => {
            if (typeof vietnamese === 'string') {
              this.properNounTranslations.set(vietnamese.toLowerCase(), vietnamese);
              this.log(DEBUG_LEVELS.VERBOSE, `🏛️ Cached proper noun: "${chinese}" -> "${vietnamese}" (lowercase: "${vietnamese.toLowerCase()}")`);
            }
          });
        } else {
          this.log(DEBUG_LEVELS.ERROR, `❌ Dictionary ${dictionaryName} is missing or empty!`);
        }
      });

      // Initialize semantic pattern processor
      if (dictionaries.patterns) {
        const patternCount = Object.keys(dictionaries.patterns).length;
        this.log(DEBUG_LEVELS.INFO, `🎯 Initializing pattern processor with ${patternCount} patterns`);
        await this.semanticPatternProcessor.initializePatterns(
          dictionaries.patterns,
          { debugLevel: this.debugLevel }
        );
        this.log(DEBUG_LEVELS.INFO, `🎯 Pattern processor initialized with ${this.semanticPatternProcessor.patterns?.length || 0} processed patterns`);
      } else {
        this.log(DEBUG_LEVELS.INFO, '⚠️ No patterns dictionary found - hierarchical processing will be disabled');
      }

      // Load punctuation dictionary for post-processing
      if (dictionaries.punctuation) {
        this.punctuationDict = dictionaries.punctuation;
        this.log(DEBUG_LEVELS.DEBUG, '🔧 Loaded punctuation dictionary:', Object.keys(this.punctuationDict).length, 'mappings');
      }

      this.isInitialized = true;
      const initTime = performance.now() - startTime;

      // Pre-warm translation caches with common characters and phrases for better first-translation performance
      if (options.preWarmCache !== false) {
        try {
          const cacheStats = await this.translationCache.preWarmCaches(this.dictionaryManager);
          if (cacheStats.success) {
            this.log(DEBUG_LEVELS.INFO, `🔥 Cache pre-warmed: ${cacheStats.charactersWarmed} characters + ${cacheStats.phrasesWarmed} phrases in ${cacheStats.timeMs}ms`);
          }
        } catch (_error) {
          this.log(DEBUG_LEVELS.WARN, '⚠️ Cache pre-warming failed:', _error.message);
        }
      }

      this.log(DEBUG_LEVELS.INFO, `✅ Translation Engine initialized in ${initTime.toFixed(2)}ms`);
      this.log(DEBUG_LEVELS.DEBUG, '📊 Engine stats:', this.getEngineStats());

      // WASM Core Engine removed - dictionary sync no longer needed
    } catch (_error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to initialize Translation Engine:', _error);
      }
      throw _error;
    }
  }

  // ============================================================================
  // SECTION 6: MAIN TRANSLATION ENTRY POINTS
  // ============================================================================
  // Purpose: Public API for translation operations
  // Dependencies: All 5 phases, chunking, batching
  // Extraction Potential: NONE - Phase orchestration coordinator
  // Critical: Controls sequential phase execution and state management
  // ============================================================================

  /**
   * Translate text using optimized single-pass algorithm
   * @param {string} text - Input text to translate
   * @param {Object} options - Translation options
   * @returns {Promise<string>} Translated text
   */
  async translate(text, options = {}) {

    if (!this.isInitialized) {
      throw new Error('Translation Engine not initialized');
    }

    if (!text || text.trim() === '') {
      return text;
    }

    // Start memory profiling for the translation operation
    const memoryProfileId = this.startMemoryProfiling('TranslationEngine', 'main-translate');
    
    try {

    // Pure JavaScript translation implementation (WASM removed for reliability)
    // Check if chunk-based processing should be used
    const useChunking = options.useChunking !== false; // Default to true
    
    let result;
    if (useChunking) {
      result = await this.translateWithChunking(text, options);
    } else {
      result = await this.translateDirectly(text, options);
    }

    return result;

    } catch (error) {
      // Complete memory profiling with error information
      this.completeMemoryProfiling(memoryProfileId, { 
        error: error.message,
        textLength: text.length,
        useChunking: options.useChunking !== false
      });
      throw error;
    } finally {
      // Complete memory profiling for successful translation
      this.completeMemoryProfiling(memoryProfileId, {
        textLength: text.length,
        useChunking: options.useChunking !== false,
        useRustEngine: false  // WASM Core Engine removed
      });
    }
  }

  /**
   * Translate text using only character-level translation (Phase 5 only)
   * Skips Patterns, Proper Nouns, Numbers, and Phrases processing
   * @param {string} text - Input text to translate
   * @param {Object} options - Translation options
   * @returns {Object} Enhanced translation result with segments
   */
  async translateWithCharactersOnly(text, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Translation Engine not initialized');
    }

    if (!text || text.trim() === '') {
      return {
        translatedText: text,
        semanticArrays: { original: [], translated: [], metadata: [] },
        prebuiltSegments: []
      };
    }

    // Pure JavaScript character-only translation (WASM removed for reliability)

    const _operationId = `character_only_translation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (process.env.NODE_ENV === 'development') {
      batchLog.hotInfo('char-engine', `Starting character-only translation: ${text.length} chars`);
    }

    // OPTIMIZATION: Build Rust-powered lookup index for character-only translations (HUGE speedup)
    // Character-only mode benefits even more from pre-computed lookups!
    if (!options.lookupIndex && text.length >= 50 && options.useSharedLookupIndex !== false) {
      try {
        const { rustLookupIndexManager } = await import('./RustLookupIndexManager.js');

        if (rustLookupIndexManager.isAvailable()) {
          const indexStartTime = performance.now();

          // Get dictionary search order (fallback to default if not available)
          const dictionaryOrder = this.dictionaryOrder ||
                                 this.dictionaryManager.getDefaultSearchOrder() ||
                                 [];

          // Build lookup index using Rust + Rayon
          const indexResult = await rustLookupIndexManager.buildLookupIndex(
            text,
            this.dictionaryManager.dictionaries,  // Map of dictionary name -> trie
            dictionaryOrder,  // Dictionary search order
            {
              minTextLength: 50,
              enableIndexing: true,
              useParallel: true,
            }
          );

          if (indexResult.success && indexResult.index) {
            // Convert to Map for faster lookups
            // IMPORTANT: Convert string keys from JSON back to numbers
            options.lookupIndex = new Map(
              Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])
            );
            options.useSharedLookupIndex = true;

            const indexTime = performance.now() - indexStartTime;
            console.log(`🦀 Rust lookup index built for character-only: ${indexResult.positionsIndexed} positions, ${indexResult.indexSize} matches in ${indexTime.toFixed(1)}ms (Rust: ${indexResult.buildTimeMs}ms)`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Rust lookup index build failed, using traditional lookup:', error.message);
        // Continue without lookup index (traditional dictionary lookup will be used)
      }
    }

    // Create isolated semantic array builder to prevent conflicts with concurrent main translations
    const characterOnlySemanticBuilder = this.useOptimizedSemanticBuilder ?
      new OptimizedSemanticArrayBuilder(Math.max(50, Math.floor(text.length / 5))) :
      new SemanticArrayBuilder();

    try {
      // For character-only translation, process the text directly without chunking
      // to preserve all whitespace and punctuation
      let translatedText = '';

      // Tokenize the entire text directly (don't use chunking which removes whitespace/punctuation)
      let tokens = this.tokenizer.tokenize(text);

      if (process.env.NODE_ENV === 'development') {
        batchLog.hotVerbose('tokenization', `Tokenization completed: ${tokens.length} tokens`);
      }

      // Skip number processing in character-only mode - translate each character individually
      // Character-only mode should only apply Phase 5 (character-level translation)

      // Only apply Phase 5: Character-level translation to all tokens
      await this.processCharacterOnlyTokens(tokens, options, characterOnlySemanticBuilder);
      
      // Build result text and semantic arrays from tokens
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        const translatedValue = token.translated != null ? token.translated : token.value;

        // Build semantic array entry for each token
        // Check for both null and undefined to avoid adding invalid entries
        if (token.type === 'chinese_char' &&
            token.translated != null &&  // != null checks for both null and undefined
            token.translated !== token.value) {
          characterOnlySemanticBuilder.addUnit(
            token.value,
            token.translated,
            token.translationSource || 'characters'
          );
        }

        // Add the translated value
        translatedText += translatedValue;
        
        // Add space after Chinese characters (except before punctuation or if next token is whitespace)
        if (token.type === 'chinese_char' && i < tokens.length - 1) {
          const nextToken = tokens[i + 1];
          if (nextToken.type !== 'punctuation' && nextToken.type !== 'whitespace') {
            translatedText += ' ';
          }
        }
        
        // Debug what we're adding (semantic arrays already populated by processCharacterOnlyTokens)
        if (process.env.NODE_ENV === 'development' && tokens.indexOf(token) % 300 === 0) {
          console.log(`📝 Character-only progress: ${translatedText.length} chars translated`);
        }
      }
      
      // Apply punctuation translation like the full translation does
      if (this.punctuationDict && Object.keys(this.punctuationDict).length > 0) {
        const punctuationChars = ['。', '，', '、', '？', '！', '：', '；', '……', '…', '．', '（', '）', '《', '》', '「', '」', '﹁', '﹂', '『', '』', '【', '】', '〖', '〗', '～', '˙'];
        for (const char of punctuationChars) {
          const result_lookup = this.dictionaryManager.translate(char, ['punctuation']);
          if (result_lookup && result_lookup.translation) {
            const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            translatedText = translatedText.replace(new RegExp(escapedChar, 'g'), result_lookup.translation);
          }
        }
      }
      
      // Skip applyFinalCleanup for character-only translation to preserve exact spacing
      // (applyFinalCleanup removes leading whitespace which we want to keep)
      
      if (process.env.NODE_ENV === 'development') {
        batchLog.hotInfo('char-engine', `Character-only translation completed: ${translatedText.length} chars`);
      }
      
      // Get semantic arrays from the isolated builder (prevents conflicts with concurrent main translations)
      // Note: getArrays() can be CPU intensive for large translations, but this is isolated so safe to optimize later
      const semanticArrays = characterOnlySemanticBuilder.getArrays();
      
      if (process.env.NODE_ENV === 'development') {
        batchLog.hotVerbose('char-semantics', `Character-only semantic arrays: ${semanticArrays.original.length} original, ${semanticArrays.translated.length} translated`);
      }
      
      const result = {
        translatedText,
        semanticArrays,
        prebuiltSegments: []
      };

      return result;
      
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Character-only translation failed:`, error);
      throw error;
    }
  }

  /**
   * Build semantic arrays in parallel for both full and character-only translations
   * This optimizes the final semantic array construction phase
   * @param {Object} fullSemanticBuilder - Main semantic array builder
   * @param {Object} characterSemanticBuilder - Character-only semantic array builder  
   * @returns {Promise<Object>} {fullSemanticArrays, characterSemanticArrays}
   */
  async buildParallelSemanticArrays(fullSemanticBuilder, characterSemanticBuilder) {
    const startTime = performance.now();
    
    try {
      // Run both semantic array constructions in parallel
      // This is safe because the builders are completely isolated
      const [fullSemanticArrays, characterSemanticArrays] = await Promise.all([
        // Wrap synchronous getArrays() in Promise to enable parallel execution
        Promise.resolve(fullSemanticBuilder.getArrays()),
        Promise.resolve(characterSemanticBuilder.getArrays())
      ]);
      
      const buildTime = performance.now() - startTime;
      this.log(DEBUG_LEVELS.VERBOSE, 
        `🚀 Parallel semantic arrays built in ${buildTime.toFixed(1)}ms (full: ${fullSemanticArrays.original?.length || 0}, character: ${characterSemanticArrays.original?.length || 0} segments)`);
      
      return {
        fullSemanticArrays,
        characterSemanticArrays
      };
      
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '🚨 Parallel semantic building failed:', error);
      
      // Fallback to sequential building
      this.log(DEBUG_LEVELS.INFO, '📝 Falling back to sequential semantic array building');
      return {
        fullSemanticArrays: fullSemanticBuilder.getArrays(),
        characterSemanticArrays: characterSemanticBuilder.getArrays()
      };
    }
  }



  /**
   * Process tokens using only character-level translation (Phase 5)
   * Also includes punctuation and whitespace for readability
   */
  async processCharacterOnlyTokens(tokens, options = {}, _semanticBuilder = this.semanticArrayBuilder) {
    const characterDictionary = this.dictionaryManager.getDictionary('characters');
    const punctuationDictionary = this.dictionaryManager.getDictionary('punctuation');
    
    if (!characterDictionary) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Character-only processing - No character dictionary found`);
      return;
    }
    
    // Process each token individually
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip already processed tokens (including WASM number conversions)
      if (token.translated != null || token.translationSource === 'number_conversion_consumed') {
        continue;
      }
      
      // Debug logging for character-only processing (disabled for performance)
      // if (process.env.NODE_ENV === 'development' && i % 400 === 0) {
      //   console.log(`🔍 Character-only processing: token ${i}/${tokens.length}`);
      // }
      
      // Handle different token types - ensure ALL tokens get processed
      if (token.type === 'chinese_char') {
        // OPTIMIZATION: Use shared lookup index for character dictionary when available
        let match = null;
        if (options.useSharedLookupIndex && options.lookupIndex) {
          const textPosition = this.getTextPositionForTokenIndex(tokens, i);
          const indexedMatches = this.dictionaryManager.getIndexedMatches(options.lookupIndex, textPosition, 'characters');

          // Take the first (longest) match for characters
          if (indexedMatches.length > 0) {
            match = indexedMatches[0];
          }

          if (this.debugLevel >= DEBUG_LEVELS.VERBOSE && match) {
            this.log(DEBUG_LEVELS.VERBOSE, `📊 Character index: found "${match.word}" → "${match.translation}" at position ${textPosition}`);
          }
        } else {
          // Fallback: Traditional character dictionary lookup
          match = this.findLongestMatchAtPosition(tokens, i, characterDictionary);
        }
        
        if (match) {
          const matchWithDictName = {
            ...match,
            dictionary: 'characters'
          };
          this.applyMatchToTokens(tokens, i, matchWithDictName, options);
        } else {
          // No dictionary match, preserve as-is
          token.translated = token.value;
          token.translationSource = 'untranslated-chinese';
          if (process.env.NODE_ENV === 'development') {
            console.log(`⚠️ Chinese char untranslated: "${token.value}"`);
          }
        }
      } else if (token.type === 'punctuation' && punctuationDictionary) {
        // Try to translate punctuation for readability
        const match = this.findLongestMatchAtPosition(tokens, i, punctuationDictionary);
        if (match) {
          const matchWithDictName = {
            ...match,
            dictionary: 'punctuation'
          };
          this.applyMatchToTokens(tokens, i, matchWithDictName, options);
        } else {
          // No punctuation translation, preserve as-is
          token.translated = token.value;
          token.translationSource = 'untranslated-punctuation';
        }
      } else {
        // For ALL other token types (whitespace, latin_word, number, unknown, etc.)
        // Preserve as-is to ensure readable output
        token.translated = token.value;
        token.translationSource = `preserved-${token.type}`;
      }
    }
  }

  /**
   * Translate text and return enhanced result with segments for interactive highlighting
   * @param {string} text - Input text
   * @param {Object} options - Translation options (including progressive: true and onProgress callback)
   * @returns {Object} Enhanced translation result with segments
   */
  async translateWithSegments(text, options = {}) {
    // Phase 7: Start performance profiling
    const operationId = `translation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    performanceProfiler.startTranslationProfile(operationId, text, options);
    
    // Performance monitoring: Start timing for bottleneck detection
    const perfId = `translateWithSegments_${Date.now()}`;
    performanceLogger.startTiming(perfId, 'translateWithSegments', {
      textLength: text.length,
      chunks: text.split(/[。！？，；：]/g).length,
      progressive: !!options.progressive,
      useOptimized: this.useOptimizedSemanticBuilder
    });

    // Reset segments for new translation
    // MEMORY LEAK FIX: Always start fresh for each new translation
    // This ensures old segments don't accumulate across multiple translations
    this.translationSegments = [];
    
    // Reset semantic array builder for new translation with capacity estimation
    if (this.useOptimizedSemanticBuilder) {
      // Estimate semantic units based on text length and complexity
      const estimatedUnits = Math.max(50, Math.ceil(text.length / 3));
      this.semanticArrayBuilder.reset(estimatedUnits);
    } else {
      this.semanticArrayBuilder.reset();
    }
    
    let translatedText;
    let semanticArrays;
    
    // Choose between progressive or regular translation
    // Progressive mode has better memory management and streaming capabilities - use for all text lengths
    const useProgressive = options.progressive && options.onProgress;

    this.log(DEBUG_LEVELS.INFO, `🔀 Translation mode decision: text=${text.length} chars, progressive=${options.progressive}, onProgress=${!!options.onProgress}, useProgressive=${useProgressive}`);
    
    if (useProgressive) {
      // Use progressive batch translation (only for shorter texts)
      const progressiveResult = await this.translateWithProgressiveBatches(text, options);
      translatedText = progressiveResult.translatedText;
      semanticArrays = progressiveResult.semanticArrays;
    } else {
      // Use regular translation
      translatedText = await this.translate(text, options);
      
      // Verify position tracking worked correctly
      const unpositionedSegments = this.translationSegments.filter(s => s.translatedStart === -1);
      if (unpositionedSegments.length > 0) {
        this.log(DEBUG_LEVELS.WARN, 
          `⚠️ ${unpositionedSegments.length} segments missing positions - position tracking bug detected`);
      }
      
      // Update semantic arrays with capitalized versions from final text
      this.semanticArrayBuilder.updateWithCapitalizedText(translatedText);
      
      // Get semantic arrays
      semanticArrays = this.semanticArrayBuilder.getArrays();
    }
    
    // Legacy precomputed segments removed - components now compute segments on-demand from semanticArrays
    
    // Phase 7: Complete performance profiling
    const result = {
      originalText: text,
      translatedText: translatedText,
      segments: this.translationSegments,
      semanticArrays: semanticArrays,  // Components compute segments on-demand from this
      prebuiltSegments: this.prebuiltSegments || []  // Instant segments built during translation
    };
    
    performanceProfiler.endTranslationProfile(operationId, translatedText, result);
    
    // Phase 3 Legacy System Monitoring: Check for rollback triggers
    const performanceMetrics = {
      processingTime: performance.now() - (result.startTime || Date.now()),
      memoryUsage: typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0,
      success: true,
      qualityScore: null, // Would need translation quality assessment
      cacheHitRate: null, // Would need cache statistics
      parallelEfficiency: null // Would need parallel processing stats
    };
    
    // Update performance baselines and check for rollback triggers
    updatePerformanceBaselines(performanceMetrics);
    const rollbackCheck = checkRollbackTriggers(performanceMetrics);
    
    if (rollbackCheck.rollbackRecommended) {
      // Rollback monitoring disabled to prevent performance impact
      // this.log(DEBUG_LEVELS.ERROR, '🚨 ROLLBACK TRIGGERS DETECTED:', rollbackCheck.triggers);
      // Note: Automatic rollback could be executed here, but for safety we just log
      // executeEmergencyRollback(rollbackCheck.triggers);
    }
    
    // Performance monitoring: End timing and check for bottlenecks
    const _duration = performanceLogger.endTiming(perfId, {
      resultLength: result.translatedText.length,
      semanticArrays: result.semanticArrays?.length || 0,
      segmentsCount: result.segments?.length || 0,
      prebuiltSegments: result.prebuiltSegments?.length || 0
    });
    
    return result;
  }

  /**
   * Create semantic groups for phrases with conflict detection
   * This includes detection of potential pattern conflicts
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Options
   */
  async createPhraseGroups(tokens, _options) {
    this.log(DEBUG_LEVELS.DEBUG, '🔗 Creating phrase groups with conflict detection');

    // Step 1: Find all potential phrase matches
    const potentialMatches = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip already processed tokens (including those processed by proper nouns or patterns)
      if (token.translated !== null || token.translationSource || token.isGrouped || (token.groupLeader !== undefined && token.groupLeader !== null)) {
        continue;
      }

      // Only process Chinese content
      if (token.type !== 'chinese_char' && token.type !== 'chinese_word') {
        continue;
      }

      // Look for phrase matches starting from this position
      const fullText = this.getTextFromTokens(tokens);
      const textPosition = this.getTextPositionForTokenIndex(tokens, i);
      const _searchText = fullText.substring(textPosition, textPosition + 10); // Show next 10 chars
      
      const phraseMatches = await this.findAllMatchesWithSemanticCache(
        fullText,
        textPosition,
        ['phrases']
      );

      if (phraseMatches.length > 0) {
        const bestMatch = phraseMatches[0]; // Already sorted by length
        
        const tokenSpan = this.getTokenSpanForText(tokens, i, bestMatch.word);
        
        // Check if any token in the phrase span is already processed
        let hasProcessedTokens = false;
        for (let j = 0; j < tokenSpan; j++) {
          const checkIndex = i + j;
          if (checkIndex < tokens.length) {
            const checkToken = tokens[checkIndex];
            if (checkToken.translated !== null || checkToken.translationSource || checkToken.isGrouped) {
              hasProcessedTokens = true;
              this.log(DEBUG_LEVELS.DEBUG, 
                `🚨 Phrase "${bestMatch.word}" blocked: token ${checkIndex} already processed by ${checkToken.translationSource || 'other'}`);
              break;
            }
          }
        }
        
        if (tokenSpan >= 1 && !hasProcessedTokens) {
          potentialMatches.push({
            startIndex: i,
            endIndex: i + tokenSpan - 1,
            match: bestMatch,
            tokenSpan: tokenSpan,
            type: 'phrase'
          });
        }
      }
    }

    // Step 2: Find all potential pattern matches
    if (this.semanticPatternProcessor.patterns && this.semanticPatternProcessor.patterns.length > 0) {
      // Build variable cache for pattern conflict detection
      const patternVariableDictionaries = [...this.activeProperNouns, 'phrases'];
      this.semanticPatternProcessor.buildVariableCache(
        tokens, 
        patternVariableDictionaries, 
        this.dictionaryManager
      );
      
      const semanticTokens = this.getSemanticTokens(tokens);
      // Hot path optimization: Only log if debug level is sufficient
      if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
        this.log(DEBUG_LEVELS.DEBUG, `🔍 Pattern conflict detection: ${semanticTokens.length} semantic tokens:`, semanticTokens.map(t => t.value));
        this.log(DEBUG_LEVELS.DEBUG, `🔍 Available patterns:`, this.semanticPatternProcessor.patterns.map(p => p.originalPattern));
      }
      
      for (let semanticPos = 0; semanticPos < semanticTokens.length; semanticPos++) {
        for (const pattern of this.semanticPatternProcessor.patterns) {
          if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
            this.log(DEBUG_LEVELS.VERBOSE, `🔍 Testing pattern "${pattern.originalPattern}" at position ${semanticPos} (token: "${semanticTokens[semanticPos].value}")`);
          }

          // Check if pattern could match at this position
          let shouldTest = false;
          if (pattern.firstToken.type === 'literal') {
            // Literal-starting pattern: must match exactly
            shouldTest = pattern.firstToken.value === semanticTokens[semanticPos].value;
          } else if (pattern.firstToken.type === 'variable') {
            // Variable-starting pattern: test at all positions where variable could match
            shouldTest = true;
          }

          if (shouldTest) {
            if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
              if (pattern.firstToken.type === 'literal') {
                this.log(DEBUG_LEVELS.DEBUG, `🎯 Literal first token matches! Trying pattern "${pattern.originalPattern}"`);
              } else {
                this.log(DEBUG_LEVELS.DEBUG, `🎯 Variable first token! Trying pattern "${pattern.originalPattern}"`);
              }
            }
            
            try {
              const matchResult = this.semanticPatternProcessor.testPatternMatch(
                pattern,
                semanticTokens,
                semanticPos,
                { debugLevel: this.debugLevel }
              );

              if (matchResult.success) {
                potentialMatches.push({
                  startIndex: matchResult.matchedTokens[0].originalIndex,
                  endIndex: matchResult.matchedTokens[matchResult.matchedTokens.length - 1].originalIndex,
                  match: matchResult,
                  pattern: pattern,
                  type: 'pattern'
                });
              }
            } catch (_error) {
              // Pattern failed, continue
              if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
                this.log(DEBUG_LEVELS.VERBOSE, `🚨 Pattern conflict detection failed for "${pattern.originalPattern}":`, _error.message);
              }
            }
          }
        }
      }
    }

    // Step 3: Resolve conflicts by selecting non-overlapping matches
    const resolvedMatches = this.resolveMatchConflicts(potentialMatches, tokens);

    // Step 4: Apply resolved phrase matches only (patterns will be applied later)
    for (const resolvedMatch of resolvedMatches) {
      if (resolvedMatch.type === 'phrase') {
        const { startIndex, match, tokenSpan } = resolvedMatch;
        
        // Create the group without translating
        tokens[startIndex].isGrouped = true;
        tokens[startIndex].value = match.word; // Update value to grouped text
        tokens[startIndex].phraseMatch = match; // Store match for later translation

        // Mark grouped tokens as consumed
        for (let j = 1; j < tokenSpan; j++) {
          if (startIndex + j < tokens.length) {
            tokens[startIndex].groupedWith = tokens[startIndex].groupedWith || [];
            tokens[startIndex].groupedWith.push(startIndex + j);
            tokens[startIndex + j].isGrouped = true;
            tokens[startIndex + j].groupLeader = startIndex;
            tokens[startIndex + j].translated = null; // Mark as consumed
            tokens[startIndex + j].translationSource = 'phrases_grouped'; // Prevent re-translation
          }
        }

        this.log(DEBUG_LEVELS.DEBUG, `🔗 Created phrase group: "${match.word}" at tokens ${startIndex}-${startIndex + tokenSpan - 1}`);
      } else {
        // Pattern match - let the SemanticPatternProcessor handle variable resolution later
        // We don't need to compute the result here, just mark it for prioritization
        tokens[resolvedMatch.startIndex].prioritizedPattern = resolvedMatch;
        this.log(DEBUG_LEVELS.DEBUG, `🎯 Prioritized pattern: "${resolvedMatch.pattern.originalPattern}" at tokens ${resolvedMatch.startIndex}-${resolvedMatch.endIndex}`);
      }
    }
  }

  /**
   * Resolve conflicts between overlapping phrase and pattern matches
   * @param {Array} potentialMatches - Array of potential matches
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Non-overlapping resolved matches
   */
  resolveMatchConflicts(potentialMatches, tokens) {
    this.log(DEBUG_LEVELS.DEBUG, `🔍 Resolving ${potentialMatches.length} potential matches`);
    
    // Smart conflict resolution: Check if phrases are part of patterns
    const patternsInMatches = potentialMatches.filter(m => m.type === 'pattern');
    const phrasesInMatches = potentialMatches.filter(m => m.type === 'phrase');
    
    // For each phrase, check if it's part of any pattern that could match
    for (const phraseMatch of phrasesInMatches) {
      phraseMatch.isPartOfPattern = false;
      phraseMatch.isCompoundWord = phraseMatch.match.word.length > 1; // Multi-character = compound
      
      for (const patternMatch of patternsInMatches) {
        // Check if phrase overlaps with pattern
        const phraseStart = phraseMatch.startIndex;
        const phraseEnd = phraseMatch.endIndex;
        const patternStart = patternMatch.startIndex;
        const patternEnd = patternMatch.endIndex;
        
        if (!(phraseEnd < patternStart || phraseStart > patternEnd)) {
          // Overlapping - but compound words should win over patterns that partially overlap them
          if (phraseMatch.isCompoundWord && 
              phraseMatch.match.metadata?.allowAsPatternVariable === true) {
            // Check if the pattern is consuming part of a compound word
            // This happens when a pattern matches characters that are part of a compound
            const phraseWordInTokens = this.getTextFromTokens(tokens).substring(
              this.getTextPositionForTokenIndex(tokens, phraseStart),
              this.getTextPositionForTokenIndex(tokens, phraseEnd + 1)
            );
            
            if (phraseWordInTokens === phraseMatch.match.word) {
              // Check if this compound word is semantically aligned with the pattern
              // If the pattern is designed to consume this exact compound, let the pattern win
              // If the pattern is only partially consuming the compound, let the compound win
              
              const patternTemplate = patternMatch.pattern.originalPattern;
              const isSemanticComponent = patternTemplate.includes(phraseMatch.match.word);
              
              // Check if this phrase could be a pattern variable (substitute for X, Y, etc.)
              const hasPatternVariables = /[A-Z]/.test(patternTemplate);
              const isPatternVariable = phraseMatch.match.metadata?.allowAsPatternVariable === true;
              
              if (isSemanticComponent) {
                // This compound is intended as a pattern component (like 脑海 in 从X脑海中)
                phraseMatch.isPartOfPattern = true;
                this.log(DEBUG_LEVELS.DEBUG, `🎯 Pattern "${patternTemplate}" uses "${phraseMatch.match.word}" as semantic component`);
              } else if (hasPatternVariables && isPatternVariable) {
                // This compound could serve as a pattern variable (like 使用者 for X in 在X的身体上)
                phraseMatch.isPartOfPattern = true;
                this.log(DEBUG_LEVELS.DEBUG, `🎯 Pattern "${patternTemplate}" can use "${phraseMatch.match.word}" as pattern variable`);
              } else {
                // This compound is being incorrectly consumed by pattern (like 手套 vs X的手)
                phraseMatch.isPartOfPattern = false;
                patternMatch.conflictsWithCompound = true;
                this.log(DEBUG_LEVELS.DEBUG, `🎯 Compound word "${phraseMatch.match.word}" takes priority over pattern "${patternTemplate}"`);
              }
            } else {
              phraseMatch.isPartOfPattern = true;
            }
          } else {
            phraseMatch.isPartOfPattern = true;
          }
          break;
        }
      }
    }
    
    // Sort matches by smart priority
    potentialMatches.sort((a, b) => {
      // Determine priority level for each match
      const getPriority = (match) => {
        // Higher specificity compounds should beat patterns that partially overlap
        if (match.type === 'phrase' && match.match.metadata?.allowAsPatternVariable === true && 
            match.isCompoundWord && !match.isPartOfPattern) {
          return 1; // Phase 2: High-specificity compound words (like 手套)
        } else if (match.type === 'pattern' && !match.conflictsWithCompound) {
          return 2; // Phase 3: patterns (unless they conflict with compound words)
        } else if (match.type === 'phrase' && match.match.metadata?.allowAsPatternVariable === true && !match.isPartOfPattern) {
          return 3; // Phase 2: Other allowAsPatternVariable phrases
        } else if (match.type === 'pattern' && match.conflictsWithCompound) {
          return 4; // Patterns that conflict with compound words get lower priority
        } else if (match.type === 'phrase') {
          return 5; // Phase 4: regular phrases or phrases that are part of patterns
        }
        return 6; // Fallback
      };
      
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      
      // First priority: Smart phase order
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Second priority: Longer matches within same type
      const lengthA = a.endIndex - a.startIndex + 1;
      const lengthB = b.endIndex - b.startIndex + 1;
      
      if (lengthA !== lengthB) {
        return lengthB - lengthA; // Longer matches first
      }
      
      return 0;
    });

    const resolvedMatches = [];
    const usedTokens = new Set();

    for (const potentialMatch of potentialMatches) {
      const { startIndex, endIndex } = potentialMatch;
      
      // Check if any tokens in this range are already used
      let hasConflict = false;
      for (let i = startIndex; i <= endIndex; i++) {
        if (usedTokens.has(i)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // No conflict, accept this match
        resolvedMatches.push(potentialMatch);
        
        // Mark tokens as used
        for (let i = startIndex; i <= endIndex; i++) {
          usedTokens.add(i);
        }
        
        const matchText = potentialMatch.type === 'phrase' 
          ? potentialMatch.match.word 
          : potentialMatch.pattern.originalPattern;
        this.log(DEBUG_LEVELS.DEBUG, `✅ Accepted ${potentialMatch.type}: "${matchText}" (tokens ${startIndex}-${endIndex})`);
      } else {
        const matchText = potentialMatch.type === 'phrase' 
          ? potentialMatch.match.word 
          : potentialMatch.pattern.originalPattern;
        this.log(DEBUG_LEVELS.DEBUG, `🚫 Rejected ${potentialMatch.type}: "${matchText}" due to conflict`);
      }
    }

    return resolvedMatches;
  }

  /**
   * Create optimal phrase groups with hierarchical pattern processing support
   * Automatically chooses between two-phase (hierarchical) and single-phase processing
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Options
   */
  async createOptimalPhraseGroups(tokens, options) {
    // Check if two-phase pattern processing is enabled
    if (this.settings.enableTwoPhasePatterns && this.semanticPatternProcessor.patterns?.length > 0) {
      this.log(DEBUG_LEVELS.INFO, `🎯 Using hierarchical two-phase pattern processing (${this.semanticPatternProcessor.patterns.length} patterns loaded)`);
      return await this.createOptimalPhraseGroupsHierarchical(tokens, options);
    } else {
      // Phase 3B.2: Legacy pattern processing was removed - this should never be reached
      this.log(DEBUG_LEVELS.ERROR, '🚨 CRITICAL: Legacy pattern processing was removed and two-phase not available');
      throw new Error('Pattern processing unavailable: two-phase disabled and legacy single-phase processing was removed');
    }
  }

  /**
   * Hierarchical two-phase phrase group creation with composite pattern support
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Options
   */
  async createOptimalPhraseGroupsHierarchical(tokens, options) {
    this.log(DEBUG_LEVELS.DEBUG, '🎯 Starting phrase processing (patterns already processed in Phase 1)');

    try {
      // Skip pattern processing since it was already handled in Phase 1
      // Only process remaining phrases using traditional approach
      await this.processRemainingPhrases(tokens, options);

      this.log(DEBUG_LEVELS.DEBUG, `✅ Phrase processing completed (patterns were processed in Phase 1)`);

    } catch (_error) {
      this.log(DEBUG_LEVELS.ERROR, '🚨 Phrase processing failed, falling back to legacy:', _error);
      
      // Phase 3B.2: Check legacy system flags for pattern processing removal
      const legacyStatus = getLegacySystemStatus();
      if (!legacyStatus.useLegacyPatternProcessing) {
        // Legacy pattern processing disabled - this is a critical failure
        this.log(DEBUG_LEVELS.ERROR, '🚨 Legacy pattern processing disabled by feature flags - two-phase pattern processing failed');
        throw new Error('Two-phase pattern processing failed and legacy single-phase processing is disabled');
      }
      
      // Phase 3B.2: Legacy pattern processing removed
      this.log(DEBUG_LEVELS.ERROR, '🚨 CRITICAL: Legacy pattern processing was removed but two-phase patterns failed');
      throw _error;
    }
  }


  /**
   * Global conflict resolution using longest-match-first with smart prioritization
   * @param {Array} allMatches - All potential matches from all positions  
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Non-overlapping optimal matches
   */
  resolveGlobalConflicts(allMatches, _tokens) {
    this.log(DEBUG_LEVELS.DEBUG, `🎯 Resolving ${allMatches.length} global matches with longest-match-first`);

    // Sort by priority: longest matches first, then by type priority
    allMatches.sort((a, b) => {
      // Primary: Length (longer matches win)
      if (a.length !== b.length) {
        return b.length - a.length;
      }
      
      // Secondary: Type priority (phrases vs patterns)
      const getTypePriority = (match) => {
        if (match.type === 'phrase') return 1;
        if (match.type === 'pattern') return 2;
        return 3;
      };
      
      const priorityA = getTypePriority(a);
      const priorityB = getTypePriority(b);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Tertiary: Position (earlier positions win)
      return a.startIndex - b.startIndex;
    });

    // Greedily select non-overlapping matches
    const selectedMatches = [];
    const usedTokenIndices = new Set();

    for (const match of allMatches) {
      // Check if this match conflicts with any already selected match
      let hasConflict = false;
      for (let i = match.startIndex; i <= match.endIndex; i++) {
        if (usedTokenIndices.has(i)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // Accept this match
        selectedMatches.push(match);
        
        // Mark tokens as used
        for (let i = match.startIndex; i <= match.endIndex; i++) {
          usedTokenIndices.add(i);
        }
        
        const matchText = match.type === 'phrase' ? match.match.word : (match.pattern?.originalPattern || 'unknown');
        this.log(DEBUG_LEVELS.DEBUG, `✅ Selected ${match.type}: "${matchText}" (length: ${match.length}, tokens: ${match.startIndex}-${match.endIndex})`);
      } else {
        const matchText = match.type === 'phrase' ? match.match.word : (match.pattern?.originalPattern || 'unknown');
        this.log(DEBUG_LEVELS.DEBUG, `🚫 Rejected ${match.type}: "${matchText}" (conflicts with selected match)`);
      }
    }

    this.log(DEBUG_LEVELS.DEBUG, `🎯 Global resolution complete: ${selectedMatches.length} optimal matches selected`);
    return selectedMatches;
  }

  // ============================================================================
  // SECTION 8: PHASE 1 - PATTERN PROCESSING
  // ============================================================================
  // Purpose: Apply semantic patterns (legacy + two-phase hierarchical)
  // Dependencies: SemanticPatternProcessor OR TwoPhasePatternProcessor
  // Extraction Potential: NONE - First phase, sets token state for all others
  // Critical: Pattern-consumed tokens block all subsequent phases
  // Note: Supports both legacy patterns and hierarchical two-phase system
  // ============================================================================

  /**
   * Apply pattern-based translations to tokens using SemanticPatternProcessor
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Translation options
   */
  async applyPatterns(tokens, options) {
    if (!this.semanticPatternProcessor.isInitialized) {
      return;
    }

    // Use hierarchical two-phase processing if enabled, otherwise use legacy processing
    // Re-enabled to debug hierarchical path
    if (this.settings.enableTwoPhasePatterns && this.semanticPatternProcessor.patterns?.length > 0) {
      this.log(DEBUG_LEVELS.INFO, `🎯 Using hierarchical pattern processing in Phase 1 (${this.semanticPatternProcessor.patterns.length} patterns available)`);

      // Apply hierarchical pattern processing here in Phase 1 (before phrases)
      // Create or reuse TwoPhasePatternProcessor instance
      if (!this.twoPhaseProcessor) {
        this.twoPhaseProcessor = new TwoPhasePatternProcessor(
          this.semanticPatternProcessor.patterns,
          {
            debugMode: true,  // Enable debug mode
            maxCompositeDetectionTime: this.settings.maxCompositeDetectionTime,
            enableFallback: this.settings.fallbackToSinglePhase
          }
        );
      }

      const enhancedOptions = {
        ...options,
        activeProperNouns: this.activeProperNouns,
        dictionaryManager: this.dictionaryManager,
        debugLevel: this.debugLevel
      };

      const hierarchicalResults = await this.twoPhaseProcessor.processTokens(tokens, enhancedOptions);

      this.applyHierarchicalResults(tokens, hierarchicalResults, options);

      this.log(DEBUG_LEVELS.DEBUG, `✅ Hierarchical pattern processing completed with ${hierarchicalResults.length} results`);
      return;
    }

    this.log(DEBUG_LEVELS.DEBUG, '🔍 Starting semantic pattern matching phase');

    // Build variable cache from current token translations (Phase 2 results)
    // Include phrases for pattern variables (phrases with allowAsPatternVariable can be pattern variables)
    const patternVariableDictionaries = [...this.activeProperNouns, 'phrases'];
    this.semanticPatternProcessor.buildVariableCache(
      tokens,
      patternVariableDictionaries,
      this.dictionaryManager
    );

    // Process tokens using unified semantic approach with prioritized patterns
    this.semanticPatternProcessor.processTokens(tokens, {
      debugLevel: this.debugLevel,
      prioritizedPatterns: this.extractPrioritizedPatterns(tokens),
      semanticArrayBuilder: this.semanticArrayBuilder,
      ...options
    });

    this.log(DEBUG_LEVELS.DEBUG, '✅ Semantic pattern matching phase completed');
  }

  /**
   * Extract prioritized patterns from tokens
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Array of prioritized pattern matches
   */
  extractPrioritizedPatterns(tokens) {
    const prioritizedPatterns = [];
    
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].prioritizedPattern) {
        prioritizedPatterns.push(tokens[i].prioritizedPattern);
        // Clear the prioritized pattern to prevent re-processing
        tokens[i].prioritizedPattern = null;
      }
    }
    
    this.log(DEBUG_LEVELS.DEBUG, `🎯 Found ${prioritizedPatterns.length} prioritized patterns`);
    return prioritizedPatterns;
  }

  /**
   * Apply hierarchical pattern results to tokens
   * @param {Array} tokens - Token array
   * @param {Array} hierarchicalResults - Results from two-phase processing
   * @param {Object} options - Processing options
   */
  applyHierarchicalResults(tokens, hierarchicalResults, options) {
    for (const result of hierarchicalResults) {
      // Apply translation to the first token of the span
      tokens[result.startIndex].translated = result.translation;
      tokens[result.startIndex].translationSource = result.translationSource || 'hierarchical_pattern';

      // Mark the result type for debugging and analysis
      if (result.type === 'composite') {
        tokens[result.startIndex].compositePattern = true;
        tokens[result.startIndex].compositeComponents = result.components;
      }

      // Store pattern information for debugging
      if (result.pattern) {
        tokens[result.startIndex].patternUsed = result.pattern.originalPattern;
      }
      
      // Mark consumed tokens (if span is longer than 1 token)
      for (let i = result.startIndex + 1; i <= result.endIndex; i++) {
        if (tokens[i]) {
          tokens[i].translated = "";  // Use empty string to prevent number processor double-processing
          tokens[i].translationSource = 'hierarchical_pattern_consumed';
        }
      }
      
      // Add to semantic array builder for bidirectional highlighting
      const globalTokenIndex = result.startIndex + (options.chunkOffset || 0);
      
      // Get the actual original text from token positions instead of using result.originalText
      // which may contain corrupted data from pattern processing
      const actualOriginalText = tokens.slice(result.startIndex, result.endIndex + 1)
        .map(token => token.value)
        .join('');
      
      this.semanticArrayBuilder.addUnit(
        actualOriginalText,
        result.translation,
        result.translationSource || 'hierarchical_patterns',
        globalTokenIndex
      );
      
      this.log(DEBUG_LEVELS.DEBUG, 
        `🎯 Applied ${result.type || 'pattern'} result: "${result.originalText}" -> "${result.translation}"`);
    }
  }

  // ============================================================================
  // SECTION 11: PHASE 4 - PHRASE PROCESSING
  // ============================================================================
  // Purpose: Common phrase dictionary matching for remaining tokens
  // Dependencies: Previous phase results (patterns, proper nouns, numbers)
  // Extraction Potential: NONE - Sequential token consumption required
  // Critical: Only processes tokens not consumed by earlier phases
  // Note: Supports both sequential and parallel processing modes
  // ============================================================================

  /**
   * Process remaining phrases that weren't handled by hierarchical patterns
   * @param {Array} tokens - Token array
   * @param {Object} options - Processing options
   */
  async processRemainingPhrases(tokens, options) {
    const fullText = this.getTextFromTokens(tokens);
    
    // Check if phase-level parallelization is enabled
    const dictionaryConfig = parallelConfig.getOptimalConfig('dictionary');
    // BUGFIX COMPLETE: Fixed parallel phrase processing - now applies matches correctly
    const enablePhaseLevelParallel = dictionaryConfig.enabled && tokens.length > 10;
    
    if (enablePhaseLevelParallel) {
      return this.processRemainingPhrasesParallel(tokens, options, fullText);
    } else {
      return this.processRemainingPhrasesSequential(tokens, options, fullText);
    }
  }

  /**
   * Process remaining phrases sequentially (original implementation)
   */
  async processRemainingPhrasesSequential(tokens, options, fullText) {
    const allPotentialMatches = [];
    
    // Collect phrase matches for unprocessed tokens
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Skip already processed tokens
      if (token.translated !== null || token.translationSource || token.isGrouped || 
          (token.groupLeader !== undefined && token.groupLeader !== null)) {
        continue;
      }
      
      // Only process Chinese content
      if (token.type !== 'chinese_char' && token.type !== 'chinese_word') {
        continue;
      }
      
      const textPosition = this.getTextPositionForTokenIndex(tokens, i);
      const phraseMatches = await this.findAllMatchesWithSemanticCache(
        fullText,
        textPosition,
        ['phrases']
      );
      
      // Add matches for remaining phrases
      for (const match of phraseMatches) {
        const tokenSpan = this.getTokenSpanForText(tokens, i, match.word);
        
        if (tokenSpan >= 1) {
          // Check if any token in the span is already processed
          let hasProcessedTokens = false;
          for (let j = 0; j < tokenSpan; j++) {
            const checkIndex = i + j;
            if (checkIndex < tokens.length) {
              const checkToken = tokens[checkIndex];
              if (checkToken.translated !== null || checkToken.translationSource || checkToken.isGrouped) {
                hasProcessedTokens = true;
                break;
              }
            }
          }
          
          if (!hasProcessedTokens) {
            allPotentialMatches.push({
              startIndex: i,
              endIndex: i + tokenSpan - 1,
              match: match,
              tokenSpan: tokenSpan,
              type: 'phrase',
              length: match.word.length
            });
          }
        }
      }
    }
    
    // Resolve conflicts and apply remaining phrases
    const resolvedMatches = this.resolveGlobalConflicts(allPotentialMatches, tokens);
    
    for (const resolvedMatch of resolvedMatches) {
      if (resolvedMatch.type === 'phrase') {
        const { startIndex, match, tokenSpan } = resolvedMatch;
        
        // Apply phrase translation
        tokens[startIndex].isGrouped = true;
        tokens[startIndex].value = match.word;
        tokens[startIndex].phraseMatch = match;
        tokens[startIndex].translated = match.translation;
        tokens[startIndex].translationSource = 'phrases';
        
        // Add to semantic array for bidirectional highlighting
        const globalTokenIndex = startIndex + (options.chunkOffset || 0);
        this.semanticArrayBuilder.addUnit(
          match.word,
          match.translation,
          match.dictionary,
          globalTokenIndex
        );
        
        // Mark grouped tokens
        for (let j = 1; j < tokenSpan; j++) {
          if (startIndex + j < tokens.length) {
            tokens[startIndex].groupedWith = tokens[startIndex].groupedWith || [];
            tokens[startIndex].groupedWith.push(startIndex + j);
            tokens[startIndex + j].isGrouped = true;
            tokens[startIndex + j].groupLeader = startIndex;
            tokens[startIndex + j].translated = null;
            tokens[startIndex + j].translationSource = 'phrases_grouped';
          }
        }
        
        this.log(DEBUG_LEVELS.DEBUG, `🎯 Remaining phrase: "${match.word}" -> "${match.translation}"`);
      }
    }
  }

  /**
   * Process remaining phrases with batch-level parallelization
   * Divides unprocessed tokens into batches and processes them concurrently
   */
  async processRemainingPhrasesParallel(tokens, options, fullText) {
    const BATCH_SIZE = 5; // Process 5 tokens concurrently for optimal performance
    
    // Collect unprocessed token indices
    const unprocessedIndices = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Skip already processed tokens
      if (token.translated !== null || token.translationSource || token.isGrouped || 
          (token.groupLeader !== undefined && token.groupLeader !== null)) {
        continue;
      }
      
      // Only process Chinese content
      if (token.type !== 'chinese_char' && token.type !== 'chinese_word') {
        continue;
      }
      
      unprocessedIndices.push(i);
    }
    
    if (unprocessedIndices.length === 0) return;
    
    // Process tokens in parallel batches
    const allPotentialMatches = [];
    const batches = [];
    
    for (let i = 0; i < unprocessedIndices.length; i += BATCH_SIZE) {
      const batch = unprocessedIndices.slice(i, i + BATCH_SIZE);
      batches.push(batch);
    }
    
    // Process batches concurrently
    const batchPromises = batches.map(async (batch) => {
      const batchMatches = [];

      // Batch dictionary lookup using JavaScript (WASM removed for reliability)
      const positions = batch.map(tokenIndex =>
        this.getTextPositionForTokenIndex(tokens, tokenIndex)
      );

      const lookupResults = await Promise.all(positions.map(pos =>
        this.dictionaryManager.findAllMatchesAsync(fullText, pos, ['phrases'])
          .then(matches => ({ position: pos, matches }))
      ));

      // Process all lookup results
      for (let i = 0; i < batch.length; i++) {
        const tokenIndex = batch[i];
        const phraseMatches = lookupResults[i].matches;

        // Add matches for this token
        for (const match of phraseMatches) {
          const tokenSpan = this.getTokenSpanForText(tokens, tokenIndex, match.word);
          
          if (tokenSpan >= 1) {
            // Check if any token in the span is already processed
            let hasProcessedTokens = false;
            for (let j = 0; j < tokenSpan; j++) {
              const checkToken = tokens[tokenIndex + j];
              if (checkToken && (checkToken.translated !== null || checkToken.translationSource || checkToken.isGrouped)) {
                hasProcessedTokens = true;
                break;
              }
            }
            
            if (!hasProcessedTokens) {
              // Create data structure that matches what resolveGlobalConflicts expects
              batchMatches.push({
                startIndex: tokenIndex,
                endIndex: tokenIndex + tokenSpan - 1,
                match: match,
                tokenSpan: tokenSpan,
                type: 'phrase',
                length: match.word.length,
                priority: this.dictionaryManager.getPriorityForDictionary('phrases')
              });
            }
          }
        }
      }
      
      return batchMatches;
    });
    
    // Wait for all batches to complete and combine results
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(batchMatches => {
      allPotentialMatches.push(...batchMatches);
    });
    
    // Apply the optimal matches (same logic as sequential version)
    const optimalMatches = this.resolvePhrasePriorityConflicts(allPotentialMatches);
    
    for (const match of optimalMatches) {
      const { startIndex: tokenIndex, tokenSpan } = match;
      
      // Apply phrase translation to tokens (same as sequential method)
      tokens[tokenIndex].isGrouped = true;
      tokens[tokenIndex].value = match.match.word;
      tokens[tokenIndex].phraseMatch = match.match;
      tokens[tokenIndex].translated = match.match.translation;
      tokens[tokenIndex].translationSource = 'phrases';
      
      // Add to semantic array for bidirectional highlighting
      const globalTokenIndex = tokenIndex + (options.chunkOffset || 0);
      this.semanticArrayBuilder.addUnit(
        match.match.word,        // original text
        match.match.translation, // translated text
        match.match.dictionary,  // source
        globalTokenIndex         // global token index for proper ordering
      );
      
      // Mark additional tokens as grouped if this is a multi-token phrase
      for (let j = 1; j < tokenSpan; j++) {
        if (tokenIndex + j < tokens.length) {
          tokens[tokenIndex + j].isGrouped = true;
          tokens[tokenIndex + j].groupLeader = tokenIndex;
          // CRITICAL: Mark as translated to prevent character-level processing
          tokens[tokenIndex + j].translated = ''; // Empty string to indicate "consumed but no output"
          tokens[tokenIndex + j].translationSource = 'phrases';
        }
      }
      
      this.log(DEBUG_LEVELS.DEBUG, `🎯 Remaining phrase: "${match.match.word}" -> "${match.match.translation}"`);
    }
  }

  /**
   * Resolve phrase priority conflicts using global conflict resolution
   * @param {Array} potentialMatches - All potential phrase matches
   * @returns {Array} Non-overlapping optimal matches
   */
  resolvePhrasePriorityConflicts(potentialMatches) {
    // Use the existing global conflict resolution method
    return this.resolveGlobalConflicts(potentialMatches, []);
  }

  /**
   * Apply patterns using true semantic token-based matching
   * Each pattern component (literal or variable) matches exactly one semantic token
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Pattern application options
   */
  async applyPatternsToTokenSequences(tokens, options) {
    // Variable resolver for semantic token pattern matching
    const variableResolver = async (tokenValue, _variableName) => {

      // First check if this token value was already successfully translated in the proper nouns phase
      // This indicates it was a valid pattern variable
      for (const token of tokens) {
        if (token.value === tokenValue && token.translated !== null) {
          this.log(DEBUG_LEVELS.VERBOSE, `✅ Pattern variable resolved from existing translation: "${tokenValue}" -> "${token.translated}" (${token.translationSource})`);
          return token.translated;
        }
      }


      // Look up in active proper noun dictionaries first
      let result = this.dictionaryManager.translate(
        tokenValue,
        this.activeProperNouns
      );

      
      // If not found in proper nouns, check phrases with allowAsPatternVariable flag
      if (!result) {
        const phrasesResult = this.dictionaryManager.translate(
          tokenValue,
          ['phrases']
        );
        
        if (phrasesResult && phrasesResult.metadata && phrasesResult.metadata.allowAsPatternVariable) {
          result = phrasesResult;
        }
      }
      
      if (result) {
        this.log(DEBUG_LEVELS.VERBOSE, `✅ Pattern variable resolved: "${tokenValue}" -> "${result.translation}" (${result.dictionary})`);
        return result.translation;
      } else {
        this.log(DEBUG_LEVELS.VERBOSE, `🚨 Pattern variable rejected: "${tokenValue}" is not a proper noun or allowed phrase`);
        return null; // This will cause pattern to be rejected
      }
    };

    // Get semantic tokens (filtering out grouped followers)
    const semanticTokens = this.getSemanticTokens(tokens);
    
    this.log(DEBUG_LEVELS.VERBOSE, `🔍 Semantic tokens for pattern matching:`, semanticTokens.map(t => `"${t.value}"`).join(' '));

    // Process each semantic token position looking for pattern starts
    for (let semanticPos = 0; semanticPos < semanticTokens.length; semanticPos++) {
      const currentSemanticToken = semanticTokens[semanticPos];
      const originalTokenIndex = currentSemanticToken.originalIndex;
      
      // Check if this token is already handled by a pattern
      if (tokens[originalTokenIndex].translationSource === 'pattern') {
        continue; // Skip already handled tokens
      }
      
      // Try each pattern to see if it starts at this semantic position
      for (const pattern of this.compiledPatterns) {
        try {
          // Use semantic token-based matching instead of regex
          const matchResult = await this.matchSemanticPattern(pattern, semanticTokens, semanticPos, variableResolver, options);
          
          if (matchResult.success) {
            // Check for conflicts with existing pattern translations
            let hasPatternConflict = false;
            for (const matchedToken of matchResult.matched) {
              const tokenIndex = matchedToken.originalIndex;
              if (tokens[tokenIndex].translationSource === 'pattern') {
                hasPatternConflict = true;
                if (options.debug) {
                  this.log(DEBUG_LEVELS.VERBOSE, `🚨 Pattern conflict: token ${tokenIndex} already has pattern translation`);
                }
                break;
              }
            }
            
            // Only apply pattern if there's no conflict
            if (!hasPatternConflict) {
              this.log(DEBUG_LEVELS.DEBUG, `✅ Pattern "${pattern.originalPattern}" applied: "${matchResult.matched.map(t => t.value).join('')}" -> "${matchResult.translation}"`);
              
              // Apply the pattern result to the original tokens
              const firstTokenIndex = matchResult.matched[0].originalIndex;
              tokens[firstTokenIndex].translated = matchResult.translation;
              tokens[firstTokenIndex].translationSource = 'pattern';
              
              // Clear subsequent matched tokens
              for (let i = 1; i < matchResult.matched.length; i++) {
                const tokenIndex = matchResult.matched[i].originalIndex;
                tokens[tokenIndex].translated = null; // Use null instead of '' to prevent re-processing
                tokens[tokenIndex].translationSource = 'pattern';
              }
              
              // Skip past the matched semantic tokens
              semanticPos += matchResult.matched.length - 1;
              break; // Pattern applied, move to next semantic token
            }
          }
        } catch (_error) {
          // Pattern failed, continue with next pattern
          this.log(DEBUG_LEVELS.VERBOSE, `🚨 Pattern "${pattern.originalPattern}" failed:`, _error.message);
        }
      }
    }
  }

  /**
   * Get semantic tokens by filtering out grouped followers
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Array of semantic tokens with original indices
   */
  getSemanticTokens(tokens) {
    const semanticTokens = [];
    
    for (let i = 0; i < tokens.length; i++) {
      // Skip tokens that are grouped followers
      if (tokens[i].isGrouped && tokens[i].groupLeader !== null) {
        continue;
      }
      
      // Only include Chinese tokens
      if (tokens[i].type === TokenType.CHINESE_WORD || tokens[i].type === TokenType.CHINESE_CHAR) {
        semanticTokens.push({
          ...tokens[i],
          originalIndex: i
        });
      }
    }
    
    return semanticTokens;
  }

  /**
   * Match a semantic pattern against semantic tokens at a specific position
   * @param {Object} pattern - Compiled pattern object
   * @param {Array} semanticTokens - Array of semantic tokens
   * @param {number} startPos - Starting position in semantic token array
   * @param {Function} variableResolver - Variable resolver function
   * @param {Object} options - Options
   * @returns {Object} Match result
   */
  async matchSemanticPattern(pattern, semanticTokens, startPos, variableResolver, _options) {
    // Parse pattern into semantic components
    const patternTokens = this.parsePatternToTokens(pattern.originalPattern);
    
    this.log(DEBUG_LEVELS.VERBOSE, `🔍 Pattern matching: "${pattern.originalPattern}" -> tokens:`, patternTokens);
    this.log(DEBUG_LEVELS.VERBOSE, `🔍 Testing at position ${startPos}, available tokens:`, semanticTokens.slice(startPos, startPos + 5).map(t => `"${t.value}"`));
    
    // Check if we have enough tokens to match the pattern
    if (startPos + patternTokens.length > semanticTokens.length) {
      return { success: false };
    }
    
    const matched = [];
    const variables = {};
    
    // Try to match each pattern token
    for (let i = 0; i < patternTokens.length; i++) {
      const patternToken = patternTokens[i];
      const semanticToken = semanticTokens[startPos + i];
      
      if (patternToken.type === 'literal') {
        // Literal token must match exactly
        if (semanticToken.value !== patternToken.value) {
          this.log(DEBUG_LEVELS.VERBOSE, `🔍 Literal mismatch: expected "${patternToken.value}", got "${semanticToken.value}"`);
          return { success: false };
        }
        matched.push(semanticToken);
      } else if (patternToken.type === 'variable') {
        // Variable token - try to resolve
        const resolvedValue = await variableResolver(semanticToken.value, patternToken.name);
        if (resolvedValue === null) {
          return { success: false };
        }
        variables[patternToken.name] = resolvedValue;
        matched.push(semanticToken);
      }
    }
    
    // Apply pattern template with resolved variables
    const translation = this.applyPatternTemplate(pattern.template, variables);
    
    return {
      success: true,
      matched: matched,
      translation: translation,
      variables: variables
    };
  }

  /**
   * Parse pattern string into semantic tokens
   * @param {string} pattern - Pattern string like "这些X"
   * @returns {Array} Array of pattern tokens
   */
  parsePatternToTokens(pattern) {
    const tokens = [];
    let i = 0;
    
    while (i < pattern.length) {
      if (pattern[i].match(/[A-Z]/)) {
        // Variable token
        tokens.push({
          type: 'variable',
          name: pattern[i],
          value: pattern[i]
        });
        i++;
      } else {
        // Literal token
        tokens.push({
          type: 'literal',
          value: pattern[i]
        });
        i++;
      }
    }
    
    return tokens;
  }

  /**
   * Apply pattern template with resolved variables
   * @param {string} template - Template string like "những X này"
   * @param {Object} variables - Resolved variables
   * @returns {string} Final translation
   */
  applyPatternTemplate(template, variables) {
    let result = template;
    
    // Replace each variable with its resolved value
    Object.entries(variables).forEach(([varName, varValue]) => {
      result = result.replace(new RegExp(varName, 'g'), varValue);
    });
    
    return result;
  }

  /**
   * Apply semantic pattern result to original tokens
   * @param {Token[]} tokens - Original token array
   * @param {Object} matchResult - Match result from semantic pattern
   * @param {number} startTokenIndex - Starting token index
   */
  applySemanticPatternResult(tokens, matchResult, startTokenIndex) {
    const _firstMatchedToken = matchResult.matched[0];
    
    // Apply translation to the first token
    tokens[startTokenIndex].translated = matchResult.translation;
    tokens[startTokenIndex].translationSource = 'pattern';
    
    // Mark subsequent matched tokens as empty
    for (let i = 1; i < matchResult.matched.length; i++) {
      const tokenIndex = matchResult.matched[i].originalIndex;
      if (tokenIndex < tokens.length) {
        tokens[tokenIndex].translated = null; // Use null to prevent re-processing
        tokens[tokenIndex].translationSource = 'pattern';
      }
    }
  }

  /**
   * Get the number of semantic tokens that a text span covers
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {string} text - Text to count tokens for
   * @returns {number} Number of semantic tokens (accounting for groups)
   */
  getTokenCountForText(tokens, startIndex, text) {
    let remainingText = text;
    let tokenCount = 0;
    
    for (let i = startIndex; i < tokens.length && remainingText.length > 0; i++) {
      // Skip grouped followers
      if (tokens[i].isGrouped && tokens[i].groupLeader !== null) {
        continue;
      }
      
      if (tokens[i].type === TokenType.CHINESE_WORD || tokens[i].type === TokenType.CHINESE_CHAR) {
        if (remainingText.startsWith(tokens[i].value)) {
          remainingText = remainingText.slice(tokens[i].value.length);
          tokenCount++;
        } else {
          break;
        }
      }
    }
    
    return tokenCount;
  }

  /**
   * Get replacement for a single pattern match without affecting surrounding text
   * @param {CompiledPattern} pattern - The compiled pattern
   * @param {string} matchText - The matched text
   * @param {Function} variableResolver - Variable resolver function
   * @returns {Promise<string>} The replacement text
   */
  async getSinglePatternReplacement(pattern, matchText, variableResolver) {
    try {
      // Apply pattern to just the matched text
      const result = await pattern.apply(matchText, variableResolver);
      if (result && !result.includes('X') && result !== matchText) {
        return result;
      }
    } catch (_error) {
      this.log(DEBUG_LEVELS.VERBOSE, `🚨 Error getting single pattern replacement:`, _error.message);
    }
    return null;
  }

  /**
   * Update tokens with proper segmentation after pattern matching
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Start of sequence
   * @param {number} endIndex - End of sequence
   * @param {string} beforeMatch - Text before the match
   * @param {string} matchedReplacement - The replacement for the matched part
   * @param {string} afterMatch - Text after the match
   * @param {number} matchStart - Start position of match in sequence
   * @param {number} matchEnd - End position of match in sequence
   */
  updateTokensWithPatternSegmentation(tokens, startIndex, endIndex, beforeMatch, matchedReplacement, afterMatch, matchStart, matchEnd) {
    // Clear all tokens in this sequence first
    for (let j = startIndex; j < endIndex; j++) {
      tokens[j].translated = null; // Use null to prevent re-processing
    }

    // Put the pattern replacement in the first token
    tokens[startIndex].translated = matchedReplacement;

    // If there's text after the match, we need to preserve it for later translation
    if (afterMatch.length > 0) {
      // Find where to place the afterMatch text
      // We need to create new virtual tokens or modify existing ones
      // For now, let's put afterMatch as untranslated content that phases 4-5 can handle
      
      // Find the token that corresponds to the start of afterMatch
      let afterMatchTokenIndex = this.findTokenIndexForPosition(tokens, startIndex, endIndex, matchEnd);
      if (afterMatchTokenIndex < endIndex && afterMatchTokenIndex >= startIndex) {
        // Reset this token to be untranslated so later phases can handle it
        tokens[afterMatchTokenIndex].translated = null;
        // Also reset subsequent tokens that are part of afterMatch
        for (let k = afterMatchTokenIndex + 1; k < endIndex; k++) {
          const tokenEndPos = this.getTokenPositionInSequence(tokens, startIndex, k);
          if (tokenEndPos <= matchEnd + afterMatch.length) {
            tokens[k].translated = null;
          }
        }
      }
    }

    this.log(DEBUG_LEVELS.VERBOSE, `🔧 Segmented pattern result: "${matchedReplacement}" + remaining untranslated: "${afterMatch}"`);
  }

  /**
   * Find token index for a specific position in the sequence
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Start of sequence
   * @param {number} endIndex - End of sequence
   * @param {number} position - Position to find
   * @returns {number} Token index
   */
  findTokenIndexForPosition(tokens, startIndex, endIndex, position) {
    let currentPos = 0;
    for (let i = startIndex; i < endIndex; i++) {
      const tokenLength = tokens[i].value.length;
      if (currentPos + tokenLength > position) {
        return i;
      }
      currentPos += tokenLength;
    }
    return endIndex - 1;
  }

  /**
   * Get the end position of a token within a sequence
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Start of sequence
   * @param {number} tokenIndex - Token index
   * @returns {number} End position
   */
  getTokenPositionInSequence(tokens, startIndex, tokenIndex) {
    let position = 0;
    for (let i = startIndex; i <= tokenIndex; i++) {
      position += tokens[i].value.length;
    }
    return position;
  }



  // ============================================================================
  // SECTION 9: PHASE 5 - CHARACTER PROCESSING
  // ============================================================================
  // Purpose: Character dictionary fallback for untranslated tokens
  // Dependencies: All previous phases (patterns, proper nouns, numbers, phrases)
  // Extraction Potential: NONE - Final phase, depends on all prior results
  // Critical: Last resort translation, must handle any remaining tokens
  // Note: Only processes tokens with translated === null
  // ============================================================================

  /**
   * Apply dictionary-based translation to tokens
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Translation options
   */
  async applyDictionaryTranslation(tokens, options) {
    const dictionaryOrder =
      (options.dictionaryOrder !== undefined) ? options.dictionaryOrder : this.dictionaryManager.getDefaultSearchOrder();
    const phase = options.phase || 'general';
    const useSharedLookupIndex = options.useSharedLookupIndex && options.lookupIndex;

    // Hot path optimization: Only log if debug level is sufficient
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const indexInfo = useSharedLookupIndex ? ` (using shared lookup index with ${options.lookupIndex.size} positions)` : '';
      this.log(DEBUG_LEVELS.DEBUG, `🔧 Starting ${phase} phase with dictionaries:${indexInfo}`, dictionaryOrder);
    }
    

    let phaseMatches = 0;
    const startTime = performance.now();

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip already translated tokens or tokens consumed by other processes
      if (token.translated !== null || token.translationSource) continue;

      // For phrases phase, check if token has a pre-stored phrase match
      if (phase === 'phrases' && token.phraseMatch) {
        // Hot path optimization: Only log if debug level is sufficient
        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          this.log(DEBUG_LEVELS.DEBUG, `🔍 Checking phrase match "${token.phraseMatch.word}" at token ${i}`);
        }
        // Check if any tokens in the phrase span were already consumed by patterns
        const tokenSpan = this.getTokenSpanForText(tokens, i, token.phraseMatch.word);
        let hasConsumedTokens = false;
        
        for (let j = 0; j < tokenSpan; j++) {
          if (i + j < tokens.length) {
            const conflictToken = tokens[i + j];
            if (conflictToken.translationSource) {
              hasConsumedTokens = true;
              const extraInfo = conflictToken.translationSource === 'pattern' && conflictToken.translated 
                ? ` with result "${conflictToken.translated}"` 
                : '';
              // Hot path optimization: Only log if debug level is sufficient
              if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
                this.log(DEBUG_LEVELS.DEBUG, `🚨 Phrase match blocked: token ${i + j} already consumed by ${conflictToken.translationSource}${extraInfo}`);
              }
              break;
            }
          }
        }
        
        if (!hasConsumedTokens) {
          // Apply the pre-stored phrase match
          this.applyMatchToTokens(tokens, i, token.phraseMatch, options);
          phaseMatches++;
          
          // Skip past grouped tokens
          i += tokenSpan - 1;
          continue;
        } else {
          // Skip this phrase match as some tokens were already consumed
          // Hot path optimization: Only log if debug level is sufficient
          if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
            this.log(DEBUG_LEVELS.DEBUG, `🚫 Skipping phrase match "${token.phraseMatch.word}" - tokens already consumed`);
          }
          // Clear the phraseMatch to prevent future conflicts
          token.phraseMatch = null;
        }
      }

      // Only translate Chinese content
      if (
        token.type !== TokenType.CHINESE_WORD &&
        token.type !== TokenType.CHINESE_CHAR
      ) {
        continue;
      }
      

      // OPTIMIZATION: Use shared lookup index when available
      let matches;
      if (useSharedLookupIndex) {
        // Get text position for this token to look up in the index
        const textPosition = this.getTextPositionForTokenIndex(tokens, i);
        
        // Map phase to dictionary category for lookup index
        const categoryMap = {
          'properNouns': 'properNouns',
          'phrases': 'phrases', 
          'characters': 'characters',
          'general': 'phrases' // Default fallback
        };
        const category = categoryMap[phase] || 'phrases';
        
        // Get pre-computed matches from lookup index
        matches = this.dictionaryManager.getIndexedMatches(options.lookupIndex, textPosition, category);
        
        // Filter matches by the specific dictionaries for this phase (since index contains all matches)
        const dictionarySet = new Set(dictionaryOrder);
        matches = matches.filter(match => dictionarySet.has(match.dictionary));
        
        if (this.debugLevel >= DEBUG_LEVELS.VERBOSE && matches.length > 0) {
          this.log(DEBUG_LEVELS.VERBOSE, `📊 Shared index: ${matches.length} matches found for position ${textPosition}, category ${category}`);
        }
      } else {
        // Fallback: Traditional dictionary lookup
        const remainingText = this.reconstructTextFromIndex(tokens, i);
        matches = await this.findAllMatchesWithSemanticCache(
          remainingText,
          0,
          dictionaryOrder
        );
      }
      

      // Filter matches based on onlyPatternVariables option
      let filteredMatches = matches;
      if (options.onlyPatternVariables) {
        filteredMatches = matches.filter(match => 
          match.dictionary !== 'phrases' || 
          (match.metadata && match.metadata.allowAsPatternVariable === true)
        );
      }

      if (filteredMatches.length > 0) {
        const bestMatch = filteredMatches[0];

        // Check for conflicts with existing results using position-based detection
        let hasConflict = false;
        const matchStart = this.getTextPositionForTokenIndex(tokens, i);
        const matchEnd = matchStart + bestMatch.word.length;
        
        // Check if this match would overlap with any already-processed tokens
        for (let j = 0; j < tokens.length; j++) {
          const token = tokens[j];
          if (token.translationSource) {
            const tokenStart = this.getTextPositionForTokenIndex(tokens, j);
            const tokenEnd = tokenStart + token.value.length;
            
            // Check for overlap: match overlaps with token if they share any position
            if (!(matchEnd <= tokenStart || matchStart >= tokenEnd)) {
              hasConflict = true;
              this.log(DEBUG_LEVELS.DEBUG, 
                `🚨 ${phase} phase match blocked: "${bestMatch.word}" at position ${matchStart}-${matchEnd} conflicts with ${token.translationSource} result "${token.value}" at position ${tokenStart}-${tokenEnd}`);
              break;
            }
          }
        }
        

        if (!hasConflict) {

          // Apply translation to the matched tokens
          this.applyMatchToTokens(tokens, i, bestMatch, options);
          phaseMatches++;

          // Calculate token span for skipping ahead
          const tokenSpan = this.getTokenSpanForText(tokens, i, bestMatch.word);
          
          // Skip ahead past the matched tokens
          // BUG FIX: Ensure we never go backwards or stay in same place
          if (tokenSpan > 0) {
            i += tokenSpan - 1;
          }
          // If tokenSpan is 0, just continue to next token (i will increment naturally)

          this.log(DEBUG_LEVELS.VERBOSE, `🔧 ${phase} phase match: "${bestMatch.word}" -> "${bestMatch.translation}" (${bestMatch.dictionary})`);
        } else {
          this.log(DEBUG_LEVELS.DEBUG, `🚫 Skipping ${phase} match "${bestMatch.word}" due to pattern conflict`);
        }
      }
    }

    const phaseTime = performance.now() - startTime;
    this.log(DEBUG_LEVELS.DEBUG, `📊 ${phase} phase completed: ${phaseMatches} matches in ${phaseTime.toFixed(1)}ms`);
  }

  // ============================================================================
  // SECTION 10: POST-PROCESSING
  // ============================================================================
  // Purpose: Assemble final translation from token results
  // Dependencies: Complete token state from all 5 phases
  // Extraction Potential: NONE - Requires full phase completion
  // Critical: Capitalization, punctuation, spacing, position tracking
  // Note: This is where translation text is actually constructed
  // ============================================================================

  /**
   * Post-process tokens and reconstruct final text
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Translation options
   * @returns {string} Final translated text
   */
  postProcess(tokens, options) {
    this.log(DEBUG_LEVELS.DEBUG, '🔧 Post-processing tokens:', tokens.length, 'tokens');

    // Step 1: Build array of output segments from tokens
    const segments = [];
    const properNounTranslations = new Set(); // Track proper noun translations for capitalization

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let output = '';
      let isProperNoun = false;

      if (token.translated !== null) {
        output = token.translated;

        // Check if this token was marked as a proper noun during dictionary matching
        if (token.isProperNoun) {
          isProperNoun = true;
          properNounTranslations.add(output.toLowerCase());
        }

        this.log(DEBUG_LEVELS.VERBOSE, `🔧 Proper noun: "${token.value}" -> "${output}"`);
      } else if (token.translationSource) {
        // Skip tokens that were consumed by any process (patterns, phrases, etc.) but have null translation
        // This indicates they were part of a multi-token match and should not produce individual output
        this.log(DEBUG_LEVELS.VERBOSE, `🔧 Skipping consumed token: "${token.value}" (source: ${token.translationSource})`);
        continue;
      } else {
        // Handle genuinely untranslated tokens
        switch (token.type) {
          case TokenType.CHINESE_CHAR:
          case TokenType.CHINESE_WORD: {
            // Apply fallback character translation if available
            const charTranslation = this.dictionaryManager.translate(
              token.value,
              ['characters']
            );
            output = charTranslation
              ? charTranslation.translation
              : token.value;
            break;
          }
          default:
            output = token.value;
        }
      }

      // Only add non-empty outputs as segments
      if (output !== '') {
        segments.push({
          text: output,
          tokenType: token.type,
          isTranslated: token.translated !== null,
          originalToken: token.value,
          isProperNoun: isProperNoun,
          tokenIndex: i, // Store token index for position tracking
        });
      }
    }

    this.log(DEBUG_LEVELS.VERBOSE, '🔧 Segments:', segments.map(s => `"${s.text}" (${s.tokenType})${s.isProperNoun ? ' [proper noun]' : ''}`));

    // Step 2: Join segments with appropriate spacing AND track positions for semantic array
    let result = '';
    let currentPosition = 0;

    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];
      const next = i < segments.length - 1 ? segments[i + 1] : null;

      // Track start position BEFORE adding text
      const startPos = currentPosition;

      // Add segment text to result
      result += current.text;

      // Track end position AFTER adding text
      currentPosition += current.text.length;
      const endPos = currentPosition;

      // Store position in semantic array builder
      // Match by tokenIndex and translated text to handle duplicate tokens
      if (current.tokenIndex >= 0) {
        this.semanticArrayBuilder.setPositionByMatch(
          current.tokenIndex,
          current.text,
          startPos,
          endPos
        );
      }

      // Add space between Chinese segments that both produce visible output
      if (
        next &&
        (current.tokenType === TokenType.CHINESE_CHAR ||
          current.tokenType === TokenType.CHINESE_WORD) &&
        (next.tokenType === TokenType.CHINESE_CHAR ||
          next.tokenType === TokenType.CHINESE_WORD)
      ) {
        result += ' ';
        currentPosition += 1;
      }

      // Add space between Chinese segments and opening punctuation (brackets, parentheses)
      if (
        next &&
        (current.tokenType === TokenType.CHINESE_CHAR ||
          current.tokenType === TokenType.CHINESE_WORD) &&
        next.tokenType === 'punctuation' &&
        (next.text.includes('[') || next.text.includes('('))
      ) {
        result += ' ';
        currentPosition += 1;
      }

      // Add space between Chinese segments and numbers/alphanumeric punctuation
      if (
        next &&
        (current.tokenType === TokenType.CHINESE_CHAR ||
          current.tokenType === TokenType.CHINESE_WORD) &&
        next.tokenType === 'punctuation' &&
        /^\d/.test(next.text) // Starts with a digit
      ) {
        result += ' ';
        currentPosition += 1;
      }

      // Add space between punctuation and Chinese segments (but not opening quotes)
      if (
        next &&
        current.tokenType === 'punctuation' &&
        (next.tokenType === TokenType.CHINESE_CHAR ||
          next.tokenType === TokenType.CHINESE_WORD) &&
        !current.text.startsWith('"') && !current.text.startsWith('\u201c') &&
        !current.text.endsWith('"') && !current.text.endsWith('\u201c') && // Exclude opening quotes (straight and curly)
        !current.text.includes('[') && !current.text.includes('(') // Exclude opening brackets and parentheses
      ) {
        result += ' ';
        currentPosition += 1;
      }

      // Add space between Chinese segments and latin_word tokens
      if (
        next &&
        (current.tokenType === TokenType.CHINESE_CHAR ||
          current.tokenType === TokenType.CHINESE_WORD) &&
        next.tokenType === TokenType.LATIN_WORD
      ) {
        result += ' ';
        currentPosition += 1;
      }

      // Add space between latin_word tokens and Chinese segments
      if (
        next &&
        current.tokenType === TokenType.LATIN_WORD &&
        (next.tokenType === TokenType.CHINESE_CHAR ||
          next.tokenType === TokenType.CHINESE_WORD)
      ) {
        result += ' ';
        currentPosition += 1;
      }
    }

    const cleaned = this.cleanupFormatting(result, {
      ...options,
      properNounTranslations,
      segments,
    });

    this.log(DEBUG_LEVELS.VERBOSE, '🔧 Final result:', cleaned.substring(0, 100) + (cleaned.length > 100 ? '...' : ''));
    return cleaned;
  }

  /**
   * Reconstruct Chinese text from tokens for pattern matching
   * @param {Token[]} tokens - Array of tokens
   * @returns {string} Chinese text
   */
  reconstructChineseText(tokens) {
    return tokens
      .filter(
        t =>
          t.type === TokenType.CHINESE_WORD || t.type === TokenType.CHINESE_CHAR
      )
      .map(t => t.value)
      .join('');
  }

  /**
   * Reconstruct text starting from a specific token index
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting index
   * @returns {string} Reconstructed text
   */
  reconstructTextFromIndex(tokens, startIndex) {
    const result = [];
    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Stop at punctuation boundaries to prevent cross-punctuation matching
      if (token.type === TokenType.PUNCTUATION) {
        break;
      }
      
      // Only include Chinese characters and words
      if (token.type === TokenType.CHINESE_WORD || token.type === TokenType.CHINESE_CHAR) {
        result.push(token.value);
      }
    }
    return result.join('');
  }

  /**
   * Update tokens based on pattern matching results
   * @param {Token[]} tokens - Array of tokens
   * @param {string} originalText - Original Chinese text
   * @param {string} patternResult - Text after pattern application
   */
  updateTokensFromPatternResult(tokens, originalText, patternResult) {
    // TEMPORARY FIX: Disable pattern token updates to prevent entire text replacement
    // TODO: Implement precise pattern matching that only updates matched tokens
    this.log(DEBUG_LEVELS.DEBUG, `🚨 Pattern token update disabled: Pattern replaced entire text instead of just matched portion`);
    this.log(DEBUG_LEVELS.DEBUG, `Original: ${originalText.substring(0, 50)}...`);
    this.log(DEBUG_LEVELS.DEBUG, `Result: ${patternResult.substring(0, 50)}...`);
    
    // For now, let individual token translation handle the unmatched parts
    // This allows patterns to work without breaking the rest of the text
    return;
  }

  /**
   * Apply a dictionary match to the appropriate tokens with semantic grouping
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {Object} match - Dictionary match object
   * @param {Object} options - Translation options (may include chunkOffset)
   */
  applyMatchToTokens(tokens, startIndex, match, options = {}) {
    // CRITICAL BUG FIX: Verify that the starting token is actually Chinese before applying the match
    if (startIndex >= tokens.length) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 BUG: applyMatchToTokens called with invalid startIndex ${startIndex} >= ${tokens.length}`);
      return;
    }
    
    const startToken = tokens[startIndex];
    if (startToken.type !== TokenType.CHINESE_CHAR && startToken.type !== TokenType.CHINESE_WORD) {
      // BUG logging disabled to prevent performance impact
      // this.log(DEBUG_LEVELS.ERROR, `🚨 BUG: applyMatchToTokens called on non-Chinese token (${startToken.type}) at index ${startIndex}`);
      return;
    }

    const tokenSpan = this.getTokenSpanForText(tokens, startIndex, match.word);

    // Debug logging for segment tracking
    this.log(DEBUG_LEVELS.DEBUG, `🔍 Segment tracking: "${match.word}" -> "${match.translation}" (${match.dictionary}), tokenSpan: ${tokenSpan}`);

    // Mark the first token with the translation and create semantic group
    if (tokenSpan > 0) {
      // For proper nouns, preserve original dictionary capitalization exactly
      if (match.dictionary === 'properNouns' || this.activeProperNouns.includes(match.dictionary)) {
        tokens[startIndex].translated = match.translation; // Keep original capitalization
        tokens[startIndex].isProperNoun = true;
        this.log(DEBUG_LEVELS.DEBUG, `🏛️ Proper noun translation preserved: "${match.word}" -> "${match.translation}"`);
      } else {
        tokens[startIndex].translated = match.translation;
      }
      
      tokens[startIndex].translationSource = match.dictionary;
      
      // Track segment for interactive highlighting (legacy position-based system)
      this.log(DEBUG_LEVELS.DEBUG, `📍 Tracking segment: "${match.word}" -> "${match.translation}" (${match.dictionary})`);
      this.trackTranslationSegment(tokens, startIndex, tokenSpan, match, options);
      
      // NEW: Capture semantic relationship for array-based highlighting
      // Calculate global position accounting for chunk offset
      const globalTokenIndex = startIndex + (options.chunkOffset || 0);
      this.semanticArrayBuilder.addUnit(
        match.word,        // original text
        match.translation, // translated text
        match.dictionary,  // source (phrases, characters, etc.)
        globalTokenIndex  // global token index for proper ordering
      );

      // Create semantic group for multi-token matches
      if (tokenSpan > 1) {
        tokens[startIndex].isGrouped = true;
        // Store original value before modifying for getTokenSpanForText() calculations
        tokens[startIndex].originalValue = tokens[startIndex].value;
        tokens[startIndex].value = match.word; // Update value to grouped text
        
        // CRITICAL FIX: Update token positions to match grouped text span
        const lastTokenIndex = startIndex + tokenSpan - 1;
        if (lastTokenIndex < tokens.length) {
          tokens[startIndex].end = tokens[lastTokenIndex].end;
        }
        
        // Track which tokens are grouped together
        tokens[startIndex].groupedWith = tokens[startIndex].groupedWith || [];
        for (let i = 1; i < tokenSpan; i++) {
          if (startIndex + i < tokens.length) {
            tokens[startIndex].groupedWith.push(startIndex + i);
            // Store original value before marking as grouped
            tokens[startIndex + i].originalValue = tokens[startIndex + i].value;
            tokens[startIndex + i].translated = ""; // Mark as processed to prevent re-processing by later phases
            tokens[startIndex + i].translationSource = match.dictionary;
            tokens[startIndex + i].isGrouped = true;
            tokens[startIndex + i].groupLeader = startIndex;
          }
        }
        
        this.log(DEBUG_LEVELS.VERBOSE, `🔗 Semantic group created: "${match.word}" (${tokenSpan} tokens)`);
      }
    }
  }

  /**
   * Calculate how many tokens a text span covers
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting index
   * @param {string} text - Text to match
   * @returns {number} Number of tokens spanned
   */
  getTokenSpanForText(tokens, startIndex, text) {
    let remainingText = text;
    let span = 0;

    for (
      let i = startIndex;
      i < tokens.length && remainingText.length > 0;
      i++
    ) {
      const token = tokens[i];

      if (
        token.type === TokenType.CHINESE_WORD ||
        token.type === TokenType.CHINESE_CHAR
      ) {
        // Use original value if available (for grouped tokens), otherwise use current value
        const valueToCheck = token.originalValue || token.value;
        if (remainingText.startsWith(valueToCheck)) {
          remainingText = remainingText.slice(valueToCheck.length);
          span++;
        } else {
          break;
        }
      }
    }

    return span;
  }

  /**
   * Track translation segment for interactive highlighting
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {number} tokenSpan - Number of tokens in the segment
   * @param {Object} match - Dictionary match object
   * @param {Object} options - Translation options (may include chunkOffset)
   */
  trackTranslationSegment(tokens, startIndex, tokenSpan, match, options = {}) {
    // Calculate original text positions by counting all characters
    let originalStart = 0;
    for (let i = 0; i < startIndex; i++) {
      originalStart += tokens[i].value.length;
    }
    
    // Add chunk offset if provided (for chunked translation)
    if (typeof options.chunkOffset === 'number') {
      originalStart += options.chunkOffset;
    }
    
    const originalEnd = originalStart + match.word.length;
    const tokenIndices = [];
    
    // Collect token indices that are part of this segment
    for (let i = 0; i < tokenSpan; i++) {
      if (startIndex + i < tokens.length) {
        tokenIndices.push(startIndex + i);
      }
    }
    
    // Create segment object
    const segment = {
      id: `seg_${this.translationSegments.length}`,
      originalText: match.word,
      translatedText: match.translation,
      originalStart,
      originalEnd,
      translatedStart: -1, // Will be set during text construction
      translatedEnd: -1,   // Will be set during text construction
      translationSource: match.dictionary,
      sourceDict: match.dictionary,
      tokenIndices,
      isProperNoun: match.dictionary === 'properNouns' || this.activeProperNouns.includes(match.dictionary),
      metadata: match.metadata || {}
    };
    
    // Add pattern-specific information if available
    if (match.pattern) {
      segment.pattern = match.pattern;
    }
    
    this.translationSegments.push(segment);

    // MEMORY LEAK FIX: Proactive cleanup during normal operation
    // Keep reasonable number of segments while preserving clickable highlighting
    // This prevents the 100x slowdown from unbounded segment growth
    //
    // Thresholds based on regression detection testing:
    // - 75 segments = Observable slowdown threshold (2.5x baseline degradation detected)
    // - 35 segments = Optimal balance (maintains full clickable highlighting + performance)
    // - Lower values break highlighting coverage, higher values degrade performance
    //
    // Technical reasoning:
    // Each segment adds O(n) complexity to position calculations during rendering.
    // At 75 segments: ~5-10ms position lookup overhead per highlight interaction.
    // At 35 segments: ~1-2ms overhead (negligible for real-time UI).
    // OPTIMIZATION: Defer cleanup to idle time to avoid blocking translation
    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
      const segmentsToKeep = MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP;
      const removedCount = this.translationSegments.length - segmentsToKeep;

      // Use requestIdleCallback for non-blocking cleanup (or setTimeout fallback)
      const cleanupFn = () => {
        this.translationSegments = this.translationSegments.slice(-segmentsToKeep);

        // Only log cleanup in debug mode to avoid performance impact
        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          this.log(DEBUG_LEVELS.DEBUG, `🧹 Async proactive cleanup: removed ${removedCount} old segments, kept ${segmentsToKeep}`);
        }
      };

      // Use requestIdleCallback if available, otherwise defer with setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cleanupFn, { timeout: 1000 });
      } else {
        setTimeout(cleanupFn, 0);
      }
    }

    // Only log segment creation at DEBUG level to avoid performance impact
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      this.log(DEBUG_LEVELS.DEBUG, `✅ Segment created: "${match.word}" -> "${match.translation}" (${match.dictionary}) [${this.translationSegments.length} total]`);
    }
  }

  /**
   * Update translation segment positions based on the current postProcess segment
   * @param {Object} postProcessSegment - Current segment being processed in postProcess
   * @param {number} currentPosition - Current position in the final text
   */
  updateSegmentPositions(postProcessSegment, currentPosition) {
    // Find translation segments that correspond to this postProcess segment
    for (const translationSegment of this.translationSegments) {
      // Check if this translation segment matches the current postProcess segment
      if (this.segmentMatches(translationSegment, postProcessSegment)) {
        // Only update if position hasn't been set yet (prevents overwriting)
        if (translationSegment.translatedStart === -1) {
          translationSegment.translatedStart = currentPosition;
          translationSegment.translatedEnd = currentPosition + postProcessSegment.text.length;
          
          this.log(DEBUG_LEVELS.VERBOSE, 
            `📍 Position set for "${translationSegment.originalText}" → "${translationSegment.translatedText}" at ${currentPosition}-${translationSegment.translatedEnd}`
          );
        }
      }
    }
  }

  /**
   * Check if a translation segment matches a postProcess segment
   * @param {Object} translationSegment - Translation segment from trackTranslationSegment
   * @param {Object} postProcessSegment - PostProcess segment from postProcess
   * @returns {boolean} True if they match
   */
  segmentMatches(translationSegment, postProcessSegment) {
    // Match by translated text (most reliable)
    if (translationSegment.translatedText === postProcessSegment.text) {
      return true;
    }
    
    // Match by original token for character-level fallbacks
    if (translationSegment.originalText === postProcessSegment.originalToken) {
      return true;
    }
    
    return false;
  }

  // calculateTranslatedPositions method removed - position tracking now handled inline during text construction

  /**
   * Clean up formatting in the final result
   * @param {string} text - Text to clean up
   * @param {Object} options - Cleanup options
   * @returns {string} Cleaned text
   */
  cleanupFormatting(text, options) {
    let result = text;

    // Apply punctuation translations FIRST using the actual punctuation dictionary
    // Get punctuation mappings by checking common punctuation marks from the dictionary
    const punctuationChars = ['。', '，', '、', '？', '！', '：', '；', '……', '…', '．', '（', '）', '《', '》', '「', '」', '﹁', '﹂', '『', '』', '【', '】', '〖', '〗', '～', '˙'];

    for (const char of punctuationChars) {
      const result_lookup = this.dictionaryManager.translate(char, ['punctuation']);
      if (result_lookup && result_lookup.translation) {
        // Escape special regex characters in the source punctuation
        const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedChar, 'g'), result_lookup.translation);
      }
    }

    // Skip detailed spacing rules when called from chunking (chunks handle their own spacing)
    if (options.useChunking !== false) {
      // Fix spacing around punctuation - remove spaces before punctuation
      result = result.replace(/\s+([.,!?:;，。！？：；\])}】》）])/g, '$1');
      // Skip remaining spacing rules when called from chunking
      return result;
    }

    if (options.useChunking !== false) {
      // Add space after punctuation (except at end of string or when followed by closing quotes)
      this.log(DEBUG_LEVELS.VERBOSE, '🔧 Before punctuation spacing:', JSON.stringify(result));
    result = result.replace(/([.,!?:;，。！？：；])(?!\s|$|[“”"])/g, '$1 ');
    this.log(DEBUG_LEVELS.VERBOSE, '🔧 After punctuation spacing:', JSON.stringify(result));
    // Note: Line 615 uses mixed quote characters (literal curly + straight quotes)

    // Special case: Add space between colon and opening quote (colon-quote combinations)
    result = result.replace(/:\u201c/g, ': \u201c'); // Vietnamese colon + curly quote (after punctuation conversion)
    result = result.replace(/:"(?!\s)/g, ': "'); // Regular quote version
    }

    // Remove excessive spaces but preserve line breaks
    result = result.replace(/[ \t]+/g, ' '); // Only collapse spaces and tabs, not newlines

    // Trim leading/trailing spaces
    result = result.trim();

    // Respect proper noun capitalization exactly as defined in dictionary
    // No automatic capitalization - only capitalize at sentence starts
    if (options.segments) {
      options.segments.forEach(segment => {
        if (segment.isProperNoun && segment.text) {
          this.log(DEBUG_LEVELS.VERBOSE, `🔧 Proper noun capitalization preserved as-is: "${segment.text}"`);
        }
      });
    }

    // DISABLED: Old capitalization logic - now handled by smart chunk-based capitalization
    // result = result.replace(/^./, match => match.toUpperCase());
    // result = result.replace(/[.!?]\s+./g, match => match.toUpperCase());

    // Capitalize first letter after line breaks (new paragraphs)
    // result = result.replace(/\n\s*./g, match => match.toUpperCase());

    // Capitalize first letter after opening quotes (straight and curly)
    //     result = result.replace(/["“]\s*./g, match => match.toUpperCase()); // " and "

    // Capitalize first letter after closing quotes (period + quote + space + text)
    //     result = result.replace(/[.!?]["”]\s+./g, match => match.toUpperCase()); // " and "

    return result;
  }

  /**
   * Update token statistics
   * @param {Token[]} tokens - Array of tokens
   */
  updateTokenStats(tokens) {
    tokens.forEach(token => {
      const count = this.stats.tokenStats.get(token.type) || 0;
      this.stats.tokenStats.set(token.type, count + 1);
    });
  }

  /**
   * Get engine performance statistics
   * @returns {Object} Performance stats
   */
  getEngineStats() {
    const avgTime =
      this.stats.totalTranslations > 0
        ? this.stats.totalTime / this.stats.totalTranslations
        : 0;

    return {
      isInitialized: this.isInitialized,
      totalTranslations: this.stats.totalTranslations,
      totalTime: this.stats.totalTime,
      averageTime: avgTime,
      throughput:
        this.stats.totalTime > 0
          ? this.stats.totalTranslations / (this.stats.totalTime / 1000)
          : 0,
      tokenStats: Object.fromEntries(this.stats.tokenStats),
      dictionaryStats: this.dictionaryManager.getGlobalStats(),
      patternStats: this.semanticPatternProcessor.getDebugInfo(),
      smartMemoryStats: this.getSmartMemoryStats(),
    };
  }

  /**
   * Get partial translation result for streaming UI updates
   * @param {number} completedChunks - Number of completed chunks
   * @returns {Object} Partial translation result
   */
  getPartialTranslationResult(completedChunks) {
    try {
      // Get current partial text from progressive position tracker
      const partialText = this.progressivePositionTracker?.finalText || '';
      
      // Calculate progress metrics
      const totalChunks = this.totalChunks || 1;
      const progress = Math.min(100, (completedChunks / totalChunks) * 100);
      
      // Get partial semantic arrays from current builder state
      let partialSemanticArrays = null;
      try {
        const currentArrays = this.semanticArrayBuilder?.getArrays();
        if (currentArrays && currentArrays.original && currentArrays.original.length > 0) {
          partialSemanticArrays = {
            original: [...currentArrays.original],
            translated: [...currentArrays.translated],
            metadata: currentArrays.metadata ? [...currentArrays.metadata] : [],
            isPartial: true,
            completedSegments: currentArrays.original.length
          };
        }
      } catch (semanticError) {
        this.log(DEBUG_LEVELS.WARN, '⚠️ Failed to get partial semantic arrays:', semanticError);
      }
      
      return {
        partialText,
        completedChunks,
        totalChunks,
        progress: Math.round(progress * 10) / 10, // Round to 1 decimal
        partialSemanticArrays,
        timestamp: Date.now()
      };
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '🚨 Failed to build partial translation result:', error);
      return {
        partialText: '',
        completedChunks: 0,
        totalChunks: 1,
        progress: 0,
        partialSemanticArrays: null,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get comprehensive performance report including profiling data
   * Phase 7: Performance monitoring and profiling
   * @returns {Object} Complete performance analysis
   */
  getPerformanceReport() {
    // Update profiler with current dictionary and cache stats
    const cacheStats = this.dictionaryManager.getCacheStats();
    const sortingStats = this.dictionaryManager.getSortingStats ? this.dictionaryManager.getSortingStats() : null;
    
    performanceProfiler.updateDictionaryMetrics(cacheStats, sortingStats);
    performanceProfiler.updateMemoryMetrics();
    
    return performanceProfiler.getPerformanceReport();
  }

  /**
   * Get real-time dashboard metrics
   * Phase 7: Performance monitoring dashboard
   * @returns {Object} Dashboard metrics
   */
  getDashboardMetrics() {
    return performanceProfiler.getDashboardMetrics();
  }

  /**
   * Enable translation profiling to measure phase-by-phase performance
   * Usage: window.translationEngine.enableProfiling()
   * Then translate text and call getProfilingReport() to see breakdown
   */
  enableProfiling() {
    this.profiler.enable();
  }

  /**
   * Disable translation profiling
   */
  disableProfiling() {
    this.profiler.disable();
  }

  /**
   * Get profiling report showing time breakdown by translation phase
   * @returns {Object} Profiling report with phase breakdown and recommendations
   */
  getProfilingReport() {
    return this.profiler.getReport();
  }

  /**
   * Print formatted profiling report to console
   */
  printProfilingReport() {
    this.profiler.printReport();
  }

  /**
   * Reset profiling data
   */
  resetProfiling() {
    this.profiler.reset();
  }

  /**
   * Enable pattern matching internal profiling
   * Provides detailed breakdown of TwoPhasePatternProcessor operations
   */
  enablePatternProfiling() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.enableInternalProfiling();
    } else {
      console.warn('⚠️ TwoPhasePatternProcessor not initialized. Translate some text first, then enable profiling.');
    }
  }

  /**
   * Disable pattern matching internal profiling
   */
  disablePatternProfiling() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.disableInternalProfiling();
    }
  }

  /**
   * Get pattern matching internal profiling report
   * @returns {Object} Internal profiling data
   */
  getPatternProfilingReport() {
    if (this.twoPhaseProcessor) {
      return this.twoPhaseProcessor.getInternalProfilingReport();
    }
    return {
      enabled: false,
      message: 'TwoPhasePatternProcessor not initialized. Translate some text first.'
    };
  }

  /**
   * Print pattern matching internal profiling report to console
   */
  printPatternProfilingReport() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.printInternalProfilingReport();
    } else {
      console.log('TwoPhasePatternProcessor not initialized. Translate some text first.');
    }
  }

  /**
   * Reset pattern matching profiling data
   */
  resetPatternProfiling() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.resetInternalProfiling();
    }
  }

  /**
   * Reset performance profiling data
   * Phase 7: Performance profiler reset
   */
  resetPerformanceProfiler() {
    performanceProfiler.reset();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalTranslations: 0,
      totalTime: 0,
      tokenStats: new Map(),
      patternStats: new Map(),
    };
  }

  /**
   * Initialize parallel processing configuration based on device capabilities
   * @param {Object} options - Configuration options
   */
  initializeParallelProcessing(options = {}) {
    // Get device memory limitations
    const maxTokensAllowed = this.calculateMaxTokensForDevice();
    
    // Build device information for ParallelConfig adaptation
    const deviceInfo = {
      totalMemory: maxTokensAllowed * 50, // Rough estimate: 50 bytes per token
      cpuCores: navigator.hardwareConcurrency || 4,
      onBattery: false // Could be enhanced with battery API if available
    };
    
    // Adapt ParallelConfig to current device
    parallelConfig.adaptToDevice(deviceInfo);
    
    // Get optimized configuration for chunk processing
    const chunkConfig = parallelConfig.getOptimalConfig('chunk', {
      textLength: options.textLength || 0
    });
    
    // Build simplified interface for existing code compatibility
    this.parallelConfig = {
      enableParallelChunks: chunkConfig.enabled,
      maxParallelChunks: chunkConfig.maxParallelChunks,
      memoryThreshold: maxTokensAllowed,
      fallbackToSequential: true,
      chunkParallelThreshold: chunkConfig.parallelThreshold
    };
    
    this.log(DEBUG_LEVELS.INFO, 
      `🔧 Parallel processing configured via ParallelConfig: chunks=${this.parallelConfig.enableParallelChunks}, ` +
      `maxConcurrency=${this.parallelConfig.maxParallelChunks}, memoryLimit=${maxTokensAllowed}, ` +
      `batteryOptimization=${parallelConfig.getConfig().device.batteryOptimization}`);
  }

  /**
   * Process chunks in parallel within a batch
   * @param {Array} batch - Array of chunks to process
   * @param {Object} options - Translation options
   * @param {number} batchStart - Starting index for chunk offset calculation
   * @returns {Promise} Resolves when all chunks are processed
   */
  async processChunksInParallel(batch, options, batchStart) {
    const startTime = performance.now();

    // Initialize parallel config if not already done - MUST BE FIRST
    if (!this.parallelConfig) {
      this.initializeParallelProcessing(options);
    }
    
    // Performance monitoring: Start timing for parallel processing
    const perfId = `processChunksInParallel_${Date.now()}`;
    performanceLogger.startTiming(perfId, 'processChunksInParallel', {
      batchSize: batch.length,
      batchStart,
      parallelEnabled: this.parallelConfig.enableParallelChunks,
      maxConcurrency: this.parallelConfig.maxParallelChunks
    });
    
    // Check if parallel processing should be used
    if (!this.parallelConfig.enableParallelChunks || 
        batch.length < this.parallelConfig.chunkParallelThreshold) {
      
      // Phase 3B.1: Check legacy system flags for sequential fallback removal
      const legacyStatus = getLegacySystemStatus();
      if (!legacyStatus.useSequentialFallback) {
        // Sequential fallback disabled - force parallel processing or fail
        this.log(DEBUG_LEVELS.WARNING, '🚨 Sequential fallback disabled by feature flags - forcing parallel processing');
        // Continue to parallel processing even if conditions suggest sequential
      } else {
        // Phase 3B.1: Sequential fallback removed - should never reach here
        this.log(DEBUG_LEVELS.ERROR, '🚨 CRITICAL: Sequential fallback was requested but has been removed');
        throw new Error('Sequential fallback was removed but parallel processing conditions not met');
      }
    }
    
    try {
      // Store original segments to preserve them during parallel processing
      const _originalSegments = [...this.translationSegments];
      
      // Process all chunks in parallel
      await Promise.all(batch.map(async (chunk, index) => {
        const chunkOptions = {
          ...options,
          useChunking: false,
          chunkOffset: chunk.startIndex,
          chunkIndex: batchStart + index,
          isParallelChunk: true // Prevent semantic array reset in individual chunks
        };

        chunk.translated = await this.translateDirectly(chunk.content, chunkOptions);
        
        // Log individual chunk completion for debugging
        if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
          this.log(DEBUG_LEVELS.VERBOSE, 
            `✅ Chunk ${batchStart + index} completed: "${chunk.content.slice(0, 50)}..."`);
        }
      }));
      
      const processingTime = performance.now() - startTime;
      const avgTimePerChunk = processingTime / batch.length;
      
      // Use INFO level for better visibility of batch performance
      const actualBatchNumber = this.currentBatchNumber || Math.floor(batchStart / batch.length) + 1;
      this.log(DEBUG_LEVELS.INFO, 
        `🚀 Parallel batch ${actualBatchNumber}: ${batch.length} chunks in ${processingTime.toFixed(1)}ms (${avgTimePerChunk.toFixed(1)}ms/chunk)`);
      
      // NEW: Call batch completion callback for streaming UI updates
      if (options.onBatchComplete) {
        try {
          const partialResult = this.getPartialTranslationResult(batchStart + batch.length);
          options.onBatchComplete({
            ...partialResult,
            batchNumber: actualBatchNumber,
            batchTime: processingTime,
            avgTimePerChunk: avgTimePerChunk
          });
        } catch (callbackError) {
          this.log(DEBUG_LEVELS.WARN, '⚠️ Batch completion callback failed:', callbackError);
        }
      }
      
      // Track performance degradation across batches
      if (!this.batchPerformanceHistory) this.batchPerformanceHistory = [];
      this.batchPerformanceHistory.push({ 
        batchNumber: actualBatchNumber,
        processingTime, 
        avgTimePerChunk,
        chunkCount: batch.length,
        timestamp: Date.now()
      });

      // Record performance for adaptive chunker learning
      let memoryUsage = 0;
      try {
        // Try to get memory usage (works in Node.js/Electron main process)
        if (typeof process !== 'undefined' && process.memoryUsage) {
          memoryUsage = process.memoryUsage().heapUsed;
        } else if (performance.memory) {
          // Fallback to browser memory API (Chrome/Edge)
          memoryUsage = performance.memory.usedJSHeapSize;
        }
      } catch (_e) {
        // Memory usage unavailable - use 0 as fallback
        memoryUsage = 0;
      }
      
      adaptiveChunker.recordPerformance({
        chunkSize: batch.length,
        processingTime: processingTime,
        throughput: batch.length / (processingTime / 1000), // chunks per second
        memoryUsage: memoryUsage
      });
      
      // Warn if significant performance degradation detected
      if (this.batchPerformanceHistory.length > 1) {
        const firstBatch = this.batchPerformanceHistory[0];
        const currentBatch = this.batchPerformanceHistory[this.batchPerformanceHistory.length - 1];
        const degradationRatio = currentBatch.avgTimePerChunk / firstBatch.avgTimePerChunk;
        
        if (degradationRatio > 2.0) { // >2x slower than first batch
          this.log(DEBUG_LEVELS.WARN, 
            `⚠️ Performance degradation detected: Batch ${currentBatch.batchNumber} is ${degradationRatio.toFixed(1)}x slower than batch 1 (${currentBatch.avgTimePerChunk.toFixed(1)}ms vs ${firstBatch.avgTimePerChunk.toFixed(1)}ms per chunk)`);
        }
      }
        
    } catch (error) {
      // Handle parallel processing errors with performance tracking
      this.log(DEBUG_LEVELS.ERROR, 'Parallel chunk processing failed:', error);
      
      // Record fallback in performance profiler if available
      if (this.performanceProfiler?.recordParallelFallback) {
        this.performanceProfiler.recordParallelFallback('chunk_processing', error);
      }
      
      // Phase 3B.1: Check legacy system flags for sequential fallback removal
      const legacyStatus = getLegacySystemStatus();
      if (!legacyStatus.useSequentialFallback) {
        // Sequential fallback disabled - this is a critical failure
        this.log(DEBUG_LEVELS.ERROR, '🚨 Sequential fallback disabled by feature flags - parallel processing failed');
        throw new Error('Parallel chunk processing failed and sequential fallback is disabled');
      }
      
      // Phase 3B.1: Sequential fallback removed - this should never be reached
      this.log(DEBUG_LEVELS.ERROR, '🚨 CRITICAL: Sequential fallback was removed but parallel processing failed');
      throw error;
    } finally {
      // Performance monitoring: End timing regardless of success/failure
      performanceLogger.endTiming(perfId, {
        processingTime: performance.now() - startTime,
        batchSize: batch.length,
        success: true // Will be overridden if error was thrown
      });
    }
  }


  /**
   * Process remaining tokens in optimized batches for character-level translation
   * @param {Token[]} tokens - Array of tokens
   * @param {Set} processedTokens - Set of already processed token indices
   * @param {Object} options - Translation options
   */
  async processRemainingTokensInBatches(tokens, processedTokens, options) {
    const BATCH_SIZE = 150; // Process 150 tokens at a time for improved performance (reduced from 20)
    const batchPromises = [];
    let currentBatch = [];
    let currentBatchIndices = [];
    
    // Count unprocessed tokens for debugging
    let unprocessedCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (!processedTokens.has(i)) {
        unprocessedCount++;
      }
    }
    
    if (unprocessedCount > 0) {
      this.log(DEBUG_LEVELS.VERBOSE, `🔍 Phase 5 Character Processing - Starting with ${unprocessedCount} unprocessed tokens`);
    }
    
    try {
      let characterPhaseYieldTime = performance.now();
      
      for (let i = 0; i < tokens.length; i++) {
        if (processedTokens.has(i)) {
          // Process batch at end of loop even if current token is processed
          if (i === tokens.length - 1 && currentBatch.length > 0) {
            // Create batch processing promise
            const batchPromise = this.processTokenBatch(
              tokens,
              currentBatchIndices, 
              processedTokens,
              options
            );
            batchPromises.push(batchPromise);
            
            await Promise.all(batchPromises);
          }
          continue;
        }
      
        currentBatch.push(tokens[i]);
        currentBatchIndices.push(i);
        
        // Process batch when it's full or we've reached the end
        if (currentBatch.length >= BATCH_SIZE || i === tokens.length - 1) {
        // Create batch processing promise
        const batchPromise = this.processTokenBatch(
          tokens,
          currentBatchIndices, 
          processedTokens,
          options
        );
        batchPromises.push(batchPromise);
        
        // Process batches in groups to avoid overwhelming the system
        if (batchPromises.length >= 3 || i === tokens.length - 1) {
          await Promise.all(batchPromises);
          batchPromises.length = 0; // Clear the array
        }
        
        // Reset current batch
        currentBatch = [];
        currentBatchIndices = [];
        
        // Time-slice: Yield control when processing time exceeds 16ms (60fps threshold)
        const currentTime = performance.now();
        if (currentTime - characterPhaseYieldTime > 16 && i < tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
          characterPhaseYieldTime = performance.now();
        }
      }
      }
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Phase 5 Character Processing failed:`, error);
      this.log(DEBUG_LEVELS.ERROR, `🚨 Phase 5 Error stack:`, error.stack);
    }
  }

  /**
   * Process a batch of tokens for character-level translation
   * @param {Token[]} tokens - Full token array
   * @param {number[]} batchIndices - Indices of tokens to process in this batch
   * @param {Set} processedTokens - Set of already processed token indices
   * @param {Object} options - Translation options
   */
  async processTokenBatch(tokens, batchIndices, processedTokens, options) {
    const batchResults = await Promise.all(
      batchIndices.map(async (i) => {
        if (processedTokens.has(i)) {
          return { index: i, consumed: 0 };
        }
        
        try {
          const result = await this.tryCharactersAtPosition(tokens, i, options);
          return { index: i, consumed: result.consumed };
        } catch (error) {
          this.log(DEBUG_LEVELS.ERROR, `🚨 Token batch processing failed at index ${i} ("${tokens[i]?.value}"):`, error);
          return { index: i, consumed: 0 };
        }
      })
    );
    
    // Apply results and mark consumed tokens
    batchResults.forEach(({ index, consumed }) => {
      if (consumed > 0) {
        for (let j = 0; j < consumed; j++) {
          processedTokens.add(index + j);
        }
      }
    });
  }

  /**
   * Progressive translation with batch processing (3-5 chunks at a time)
   * @param {string} text - Input text
   * @param {Object} options - Translation options with onProgress callback
   * @returns {Object} Translation result with text and semantic arrays
   */
  async translateWithProgressiveBatches(text, options = {}) {
    const startTime = performance.now();

    // Initialize segments collection for progressive translation
    this.translationSegments = [];
    
    // Reset semantic builder with capacity estimation for progressive translation
    if (this.useOptimizedSemanticBuilder) {
      const estimatedUnits = Math.max(100, Math.ceil(text.length / 2)); // Progressive needs more capacity
      this.semanticArrayBuilder.reset(estimatedUnits);
    } else {
      this.semanticArrayBuilder.reset();
    }
    
    // PHASE 2: Initialize progressive position tracking
    this.progressivePositionTracker = {
      runningTextPosition: 0,
      finalText: '',
      clickableSegments: [],
      totalOriginalSegments: [],
      totalTranslatedSegments: []
    };

    // Initialize progress update debouncing (reduce UI update overhead)
    this.lastProgressUpdate = 0;
    this.progressUpdateInterval = UI_UPDATE_THRESHOLDS.PROGRESS_DEBOUNCE_MS;
    this.minChunksForStreaming = UI_UPDATE_THRESHOLDS.STREAMING_MIN_CHUNKS;

    // PHASE 4: Memory-efficient streaming for long texts
    this.processedBatchCache = new Map();
    this.maxCachedBatches = 3; // Keep only recent batches in memory
    
    // Store final semantic array building until the end
    this.deferredSemanticData = [];
    
    // Step 1: Split text into chunks by punctuation boundaries
    const chunks = this.textChunker.chunkText(text);
    const translatableChunks = this.textChunker.getTranslatableChunks(chunks);

    if (translatableChunks.length === 0) {
      return { translatedText: text, semanticArrays: this.semanticArrayBuilder.getArrays() };
    }
    
    const streamingEnabled = translatableChunks.length >= this.minChunksForStreaming;
    this.log(DEBUG_LEVELS.INFO,
      `🚀 Starting progressive translation: ${translatableChunks.length} chunks (streaming ${streamingEnabled ? 'ENABLED' : 'DISABLED - below ' + this.minChunksForStreaming + ' chunk threshold'})`);

    // Store total chunks for streaming progress calculation
    this.totalChunks = translatableChunks.length;
    
    // Step 2: Process chunks in adaptive batches with ParallelConfig integration
    const chunkConfig = parallelConfig.getOptimalConfig('chunk', {
      textLength: text.length,
      chunkCount: translatableChunks.length
    });
    
    // Enhanced content analysis for smart chunk size adaptation
    const contentAnalysis = adaptiveChunker.analyzeContentCharacteristics(text, translatableChunks);
    
    // Calculate optimal chunk size using adaptive analysis and device capabilities
    const deviceInfo = {
      memoryPressure: parallelConfig.getConfig().device.memoryPressure,
      cpuCores: parallelConfig.getConfig().device.hardwareConcurrency
    };
    let currentBatchSize = adaptiveChunker.calculateOptimalChunkSize(
      contentAnalysis, 
      deviceInfo, 
      translatableChunks.length
    );
    
    // Ensure compatibility with existing ParallelConfig limits
    const baseBatchSize = chunkConfig.enabled ? chunkConfig.maxParallelChunks : 2;
    currentBatchSize = Math.max(2, Math.min(baseBatchSize, currentBatchSize));
    
    batchLog.info('smart-chunk-adaptation', 
      `📊 Smart chunk sizing: complexity=${contentAnalysis.complexity.toFixed(2)}, ` +
      `strategy=${contentAnalysis.chunkingStrategy}, batch_size=${currentBatchSize}`, 
      contentAnalysis.recommendations);
    
    let _totalBatches = Math.ceil(translatableChunks.length / currentBatchSize);
    
    // Initialize adaptive batch sizing and memory tracking
    this.batchPerformanceHistory = []; // Reset for this translation session
    this.memoryTracker = new MemoryLeakDetector(); // Track memory usage patterns
    
    // Set up memory cleanup callback
    this.memoryTracker.onCleanupNeeded = (level) => {
      this.performMemoryCleanup(level);
    };

    // Initialize smart memory management refinements
    this.initializeSmartMemoryManagement();
    let performanceBaseline = null;

    /**
     * Handle memory cleanup based on severity level
     * @param {string} level - 'automatic', 'critical', or 'emergency'
     */
    this.performMemoryCleanup = (level) => {
      performanceLogger.startTiming(`memory-cleanup-${level}`, `Memory cleanup - ${level}`, { level });

      try {
        batchLog.warn(`🧹 Performing ${level} memory cleanup...`, {
          level,
          translationSegments: this.translationSegments?.length || 0,
          memoryPressure: this.memoryTracker.getCurrentMemoryRatio()
        });

        if (level === 'automatic') {
          // OPTIMIZATION: Defer automatic cleanup to idle time to avoid blocking translation
          const automaticCleanupFn = () => {
            // Gentle cleanup: Keep last 35 segments, clean older ones
            if (this.translationSegments && this.translationSegments.length > 35) {
              const segmentsToClean = this.translationSegments.slice(0, -35);
              segmentsToClean.forEach(segment => {
                // Nullify properties to break references
                if (segment) {
                  segment.originalSegment = null;
                  segment.translatedSegment = null;
                  segment.metadata = null;
                }
              });
              this.translationSegments = this.translationSegments.slice(-35);
              batchLog.info(`🧹 Async automatic cleanup: Removed ${segmentsToClean.length} old segments`);
            }

            // Clear performance history if too long
            if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 10) {
              this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-5);
            }

            performanceLogger.endTiming(`memory-cleanup-${level}`);
          };

          // Use requestIdleCallback if available, otherwise defer with setTimeout
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(automaticCleanupFn, { timeout: 2000 });
          } else {
            setTimeout(automaticCleanupFn, 0);
          }

        } else if (level === 'critical') {
          // CRITICAL cleanup must be synchronous - we're in trouble and need immediate action
          // Aggressive cleanup: Keep only last 5 segments
          if (this.translationSegments && this.translationSegments.length > 5) {
            const segmentsToClean = this.translationSegments.slice(0, -5);
            segmentsToClean.forEach(segment => {
              if (segment) {
                Object.keys(segment).forEach(key => {
                  segment[key] = null;
                });
              }
            });
            this.translationSegments = this.translationSegments.slice(-5);
            batchLog.warn(`🧹 Critical cleanup: Removed ${segmentsToClean.length} segments, kept 5`);
          }
          
          // Clear most performance history
          this.batchPerformanceHistory = [];
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            batchLog.info('🗑️ Forced garbage collection');
          }
          
        } else if (level === 'emergency') {
          // Emergency cleanup: Clear everything possible
          if (this.translationSegments) {
            this.translationSegments.forEach(segment => {
              if (segment) {
                Object.keys(segment).forEach(key => {
                  segment[key] = null;
                });
              }
            });
            this.translationSegments = [];
            batchLog.error('🆘 Emergency cleanup: Cleared all translation segments');
          }
          
          // Clear all performance data
          this.batchPerformanceHistory = [];
          
          // Force multiple garbage collections
          if (global.gc) {
            for (let i = 0; i < 3; i++) {
              global.gc();
            }
            batchLog.error('🆘 Forced multiple garbage collections');
          }
          
          // Request browser memory pressure if available
          if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
            batchLog.error('🆘 Browser memory pressure detected', {
              usedMemory: Math.round(window.performance.memory.usedJSHeapSize / 1048576),
              totalMemory: Math.round(window.performance.memory.totalJSHeapSize / 1048576)
            });
          }
        }
        
        // Log cleanup results (only for synchronous cleanups)
        if (level !== 'automatic') {
          const postCleanupRatio = this.memoryTracker.getCurrentMemoryRatio();
          batchLog.info(`✅ Memory cleanup completed`, {
            level,
            memoryBefore: (this.memoryTracker.getCurrentMemoryRatio() * 100).toFixed(1) + '%',
            memoryAfter: (postCleanupRatio * 100).toFixed(1) + '%',
            remainingSegments: this.translationSegments?.length || 0
          });
        }

      } catch (error) {
        batchLog.error('❌ Memory cleanup failed:', error);
      } finally {
        // Only end timing for synchronous cleanups
        // Async automatic cleanup handles its own timing
        if (level !== 'automatic') {
          performanceLogger.endTiming(`memory-cleanup-${level}`, {
            level,
            success: true,
            remainingSegments: this.translationSegments?.length || 0
          });
        }
      }
    };
    
    let processedChunks = 0;
    let batchIndex = 0;
    
    while (processedChunks < translatableChunks.length) {
      // Adaptive batch sizing: adjust based on performance history
      if (this.batchPerformanceHistory.length >= 2) {
        const recentBatches = this.batchPerformanceHistory.slice(-2);
        const avgRecentTime = recentBatches.reduce((sum, batch) => sum + batch.avgTimePerChunk, 0) / recentBatches.length;
        
        if (!performanceBaseline) {
          performanceBaseline = this.batchPerformanceHistory[0].avgTimePerChunk;
        }
        
        const performanceRatio = avgRecentTime / performanceBaseline;
        
          // Memory leak detection disabled to prevent performance impact
        if (performanceRatio > 2.0) {
          // Logging disabled: memory leak monitoring creates more performance issues than it solves
          // this.log(DEBUG_LEVELS.ERROR, `🔍 MEMORY LEAK SUSPECTED: Batch ${batchIndex} is ${performanceRatio.toFixed(1)}x slower`);
        }
        
        // Don't reduce batch size due to the known memory leak issue
        // The performance degradation is consistent, not getting worse
        if (performanceRatio > 3.0 && currentBatchSize > 3) {
          // Only reduce if performance is EXTREMELY bad (>3x slower)
          currentBatchSize = Math.max(3, currentBatchSize - 1);
          this.log(DEBUG_LEVELS.WARN, 
            `📉 Reducing batch size to ${currentBatchSize} due to extreme degradation (${performanceRatio.toFixed(1)}x slower)`);
        } else if (performanceRatio < 0.8 && currentBatchSize < 5 && batchIndex > 1) {
          // Performance is good, can try larger batches
          currentBatchSize = Math.min(5, currentBatchSize + 1);
          this.log(DEBUG_LEVELS.INFO, 
            `📈 Increasing batch size to ${currentBatchSize} due to good performance (${performanceRatio.toFixed(1)}x baseline)`);
        }
        
        // Log the consistent performance issue without changing batch size
        if (performanceRatio > 2.0 && performanceRatio <= 3.0) {
          this.log(DEBUG_LEVELS.INFO, 
            `📊 Consistent performance degradation: ${performanceRatio.toFixed(1)}x slower (memory-related, not reducing batch size)`);
        }
      }
      
      const batchStart = processedChunks;
      const batchEnd = Math.min(batchStart + currentBatchSize, translatableChunks.length);
      const currentBatch = translatableChunks.slice(batchStart, batchEnd);
      
      // Pass current batch number for accurate logging
      this.currentBatchNumber = batchIndex;
      
      // Track where time is being spent
      const batchStartTime = performance.now();

      // Take memory snapshot before processing (dev only for performance)
      let preProcessingSnapshot, postProcessingSnapshot;

      if (process.env.NODE_ENV === 'development') {
        preProcessingSnapshot = this.memoryTracker.takeSnapshot(batchIndex, {
          phase: 'pre-processing',
          batchSize: currentBatch.length,
          processedChunks,
          semanticArraySize: this.semanticArrayBuilder?.getArrays()?.originalSegments?.length || 0,
          translationSegmentsCount: this.translationSegments?.length || 0,
          chunksProcessed: chunks.filter(c => c.translated).length
        });
      }

      // Translate current batch (with parallel processing)
      await this.processChunksInParallel(currentBatch, options, batchStart);


      // Take memory snapshot after processing (dev only for performance)
      if (process.env.NODE_ENV === 'development') {
        postProcessingSnapshot = this.memoryTracker.takeSnapshot(batchIndex, {
          phase: 'post-processing',
          batchSize: currentBatch.length,
          processedChunks: processedChunks + currentBatch.length,
          semanticArraySize: this.semanticArrayBuilder?.getArrays()?.originalSegments?.length || 0
        });
      }
      
      // Analyze memory growth patterns
      if (postProcessingSnapshot) {
        const leakAnalysis = this.memoryTracker.detectLeaks(postProcessingSnapshot);
        
        // Log memory usage every few batches with detailed component tracking
        if (batchIndex % 3 === 0 || (leakAnalysis && leakAnalysis.isHighUsage)) {
          const translationSegCount = this.translationSegments?.length || 0;
          const avgSegmentSize = translationSegCount > 0 ? 
            (postProcessingSnapshot.memory.used / translationSegCount / 1024).toFixed(1) : '0';
          
          // Analyze what's inside segments when they get large
          if (translationSegCount > 0 && parseFloat(avgSegmentSize) > 2000) { // >2MB per segment
            const sampleSegment = this.translationSegments[0];
            const segmentKeys = Object.keys(sampleSegment || {});
            const _segmentSizes = segmentKeys.map(key => {
              const value = sampleSegment[key];
              let size = 0;
              try {
                if (typeof value === 'string') size = value.length;
                else if (Array.isArray(value)) size = JSON.stringify(value).length;
                else if (typeof value === 'object' && value !== null) size = JSON.stringify(value).length;
                else size = String(value).length;
              } catch (_e) { size = 0; }
              return { key, size, type: Array.isArray(value) ? 'array' : typeof value };
            }).sort((a, b) => b.size - a.size);
            
            // Large segment analysis disabled to prevent performance impact
            // this.log(DEBUG_LEVELS.ERROR, `🔍 LARGE SEGMENT ANALYSIS: Top properties in ${translationSegCount} segments:`);
            // segmentSizes.slice(0, 5).forEach(prop => {
            //   this.log(DEBUG_LEVELS.ERROR, `  - ${prop.key} (${prop.type}): ${(prop.size / 1024).toFixed(1)}KB`);
            // });
          }
          
          // Memory and segment logging disabled to prevent performance impact
          // this.log(DEBUG_LEVELS.INFO, `🧠 Memory: Batch ${batchIndex} +${postProcessingSnapshot.memoryGrowthMB.toFixed(1)}MB total`);
          // this.log(DEBUG_LEVELS.INFO, `📊 Segments: ${translationSegCount} translation segments (~${avgSegmentSize}KB each)`);
        }
        
        if (leakAnalysis) {
          if (leakAnalysis.isExcessive) {
            this.log(DEBUG_LEVELS.WARN, 
              `🧠 HIGH MEMORY USAGE: +${leakAnalysis.memoryGrowthRate.toFixed(1)}MB per batch, ${leakAnalysis.totalGrowthMB.toFixed(1)}MB total (semantic arrays for long text)`);
          } else if (leakAnalysis.isHighUsage) {
            this.log(DEBUG_LEVELS.DEBUG, 
              `📊 Memory growth: +${leakAnalysis.memoryGrowthRate.toFixed(1)}MB per batch (building semantic arrays)`);
          }
        }
        
        // DYNAMIC MEMORY CLEANUP: Trigger cleanup when high memory usage is detected OR segments are high
        let cleanupPerformed = false;
        const forceCleanup = leakAnalysis && (leakAnalysis.isExcessive || leakAnalysis.isHighUsage);
        
        // 1. Cleanup translation segments (reduce false emergency alerts)
        const segmentThreshold = 60; // Balanced threshold after fixing false memory alerts
        if (this.translationSegments && this.translationSegments.length > segmentThreshold) {
          const oldCount = this.translationSegments.length;

          // Dynamic cleanup amount based on memory pressure
          const keepSegments = forceCleanup ? 10 : 25;
          
          // Aggressive cleanup: Break references in discarded segments
          this.translationSegments.slice(0, -keepSegments).forEach(segment => {
            if (segment && typeof segment === 'object') {
              Object.keys(segment).forEach(key => {
                segment[key] = null;
              });
            }
          });
          
          // Keep only the last N segments based on memory pressure
          this.translationSegments = this.translationSegments.slice(-keepSegments);
          
          // Always log as DEBUG - these are routine maintenance operations
          this.log(DEBUG_LEVELS.DEBUG, 
            `🧹 Translation segments cleaned: ${oldCount} → ${this.translationSegments.length} (freed ${oldCount - keepSegments} segments)`);
          cleanupPerformed = true;
        }
        
        // 2. Cleanup semantic array builder (dynamic threshold based on memory pressure)
        const currentSemanticArrays = this.semanticArrayBuilder?.getArrays();
        const semanticThreshold = forceCleanup ? 50 : 200;
        if (currentSemanticArrays?.originalSegments?.length > semanticThreshold) {
          const semanticLogLevel = forceCleanup ? DEBUG_LEVELS.ERROR : DEBUG_LEVELS.DEBUG;
          this.log(semanticLogLevel, `🧹 Resetting semantic array builder (${forceCleanup ? 'EMERGENCY' : 'ROUTINE'}): ${currentSemanticArrays.originalSegments.length} segments)`);
          this.semanticArrayBuilder.reset();
          cleanupPerformed = true;
        }
        
        // 3. Force garbage collection hint
        if (cleanupPerformed && typeof global !== 'undefined' && global.gc) {
          global.gc();
          this.log(DEBUG_LEVELS.DEBUG, '🧹 Forced garbage collection');
        }
      }
      
      // PHASE 1 FIX: Process only current batch chunks, not all chunks (eliminates O(n²) redundancy)
      this.processBatchChunksProgressive(currentBatch, chunks, batchStart);
      
      // PHASE 2: Process batch progressively with position tracking
      const batchResult = await this.processBatchWithProgressivePositioning(currentBatch, chunks, batchStart);
      
      // Use the already-processed text from batch processing (eliminates redundant reconstruction)
      const cleanedResult = batchResult.cleanedBatchText;;
      
      // Verify position tracking worked correctly  
      const unpositionedSegments = this.translationSegments.filter(s => s.translatedStart === -1);
      if (unpositionedSegments.length > 0) {
        this.log(DEBUG_LEVELS.WARN, 
          `⚠️ ${unpositionedSegments.length} segments missing positions in batch processing - position tracking bug detected`);
      }
      this.semanticArrayBuilder.updateWithCapitalizedText(cleanedResult);
      
      // PHASE 4: Memory-efficient batch caching
      this.processedBatchCache.set(batchIndex, {
        text: this.progressivePositionTracker.finalText.slice(-cleanedResult.length),
        segments: batchResult.batchSegments || []
      });
      
      // Remove old batches to prevent memory accumulation
      if (this.processedBatchCache.size > this.maxCachedBatches) {
        const oldestBatch = Math.min(...this.processedBatchCache.keys());
        this.processedBatchCache.delete(oldestBatch);
        this.log(DEBUG_LEVELS.DEBUG, `🧹 Removed cached batch ${oldestBatch} to free memory`);
      }
      
      // Update progress tracking
      processedChunks = batchEnd;
      batchIndex++;
      
      // Call progress callback if provided (with debouncing to reduce UI overhead)
      if (options.onProgress) {
        const now = performance.now();
        const timeSinceLastUpdate = now - this.lastProgressUpdate;
        const isLastBatch = processedChunks >= translatableChunks.length;

        // Only enable streaming UI for texts with enough chunks (prevents streaming for short texts)
        const enableStreaming = translatableChunks.length >= this.minChunksForStreaming;

        // Send update if: streaming is enabled AND (enough time passed OR this is the last batch)
        // PLUS: Skip 2/3 of batches to reduce GPU rendering pressure (only update every 3rd batch)
        const shouldSendUpdate = enableStreaming &&
          (timeSinceLastUpdate >= this.progressUpdateInterval || isLastBatch) &&
          (batchIndex % 3 === 0 || isLastBatch);

        if (shouldSendUpdate) {
          // Calculate remaining batches based on current batch size
          const remainingChunks = translatableChunks.length - processedChunks;
          const estimatedRemainingBatches = Math.ceil(remainingChunks / currentBatchSize);
          const estimatedTotalBatches = batchIndex + estimatedRemainingBatches;

          // BUGFIX: Use semanticArrayBuilder directly to avoid duplicates
          const currentSemanticArrays = this.semanticArrayBuilder.getArrays();

          // OPTIMIZED: Reuse existing metadata array, only fill missing entries
          // Optimization #2 & #3: Use array.slice() + reuse default object
          const progressiveMetadata = currentSemanticArrays.metadata ?
            currentSemanticArrays.metadata.slice() : [];

          // Fill missing entries with frozen default metadata object (prevents object creation overhead)
          const targetLength = currentSemanticArrays.original?.length || 0;
          if (progressiveMetadata.length < targetLength) {
            // Reuse single frozen object for all defaults (safe since read-only)
            const DEFAULT_METADATA = Object.freeze({
              source: 'progressive',
              phase: 'unknown',
              dictionary: 'unknown'
            });

            for (let i = progressiveMetadata.length; i < targetLength; i++) {
              progressiveMetadata[i] = DEFAULT_METADATA;
            }
          }

          const progressText = this.progressivePositionTracker.finalText || cleanedResult;

          // PHASE 2: Send progressive results with clickable segments
          options.onProgress({
            currentBatch: batchIndex,
            totalBatches: estimatedTotalBatches,
            completedChunks: processedChunks,
            totalChunks: translatableChunks.length,
            partialTranslation: progressText,
            isComplete: isLastBatch, // Signal when translation is complete
            // PHASE 2: Send progressive semantic arrays and clickable segments (from builder)
            semanticArrays: {
              original: currentSemanticArrays.original || [],
              translated: currentSemanticArrays.translated || [],
              metadata: progressiveMetadata
            },
            progressiveSegments: this.progressivePositionTracker.clickableSegments
          });

          // Update timestamp
          this.lastProgressUpdate = now;
        } else {
          // Skipped update due to debouncing
          this.log(DEBUG_LEVELS.DEBUG,
            `⏭️ Skipped progress update (${timeSinceLastUpdate.toFixed(0)}ms since last update, threshold: ${this.progressUpdateInterval}ms)`);
        }
      }
      
      // Memory cleanup between batches to prevent accumulation
      if (processedChunks < translatableChunks.length) {
        // More aggressive cleanup for longer texts
        const isLongText = translatableChunks.length > 40;
        const recentBatch = this.batchPerformanceHistory[this.batchPerformanceHistory.length - 1];
        const memoryPressure = performanceBaseline && recentBatch && recentBatch.avgTimePerChunk > performanceBaseline * 1.5;
        
        if (isLongText || memoryPressure) {
          // Clear performance history more aggressively
          if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 5) {
            this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-3);
          }
          
          // EMERGENCY FIX: Clear old translation segments AND break any hidden references
          if (this.translationSegments && this.translationSegments.length > 3) {
            const oldCount = this.translationSegments.length;

            // CRITICAL: Null out all properties in discarded segments to break references
            this.translationSegments.slice(0, -3).forEach(segment => {
              if (segment && typeof segment === 'object') {
                Object.keys(segment).forEach(key => {
                  segment[key] = null; // Break any hidden references
                });
              }
            });

            // Keep only recent segments (last 3 for emergency cleanup)
            this.translationSegments = this.translationSegments.slice(-3);

            this.log(DEBUG_LEVELS.INFO,
              `🚨 Emergency: Cleared translation segments: ${oldCount} → ${this.translationSegments.length} (nullified ${oldCount - 3} segment references)`);
          }
          
          // ENHANCED: Also clear semantic arrays if they exist
          if (this.semanticArrays && this.semanticArrays.length > 100) {
            const oldSemanticCount = this.semanticArrays.length;
            this.semanticArrays = this.semanticArrays.slice(-50);
            this.log(DEBUG_LEVELS.INFO, `🧹 Semantic array cleanup: ${oldSemanticCount} → ${this.semanticArrays.length}`);
          }
          
          // ENHANCED: Clear pattern processor cache if it gets too large
          if (this.semanticPatternProcessor && this.semanticPatternProcessor.variableCache) {
            const cacheSize = this.semanticPatternProcessor.variableCache.size;
            if (cacheSize > 500) {
              this.semanticPatternProcessor.variableCache.clear();
              this.log(DEBUG_LEVELS.INFO, `🧹 Pattern cache cleared: ${cacheSize} entries`);
            }
          }
          
          // REMOVED: Don't reset semantic array builder - let it accumulate for final clickability
          
          // Monitor and clean semantic arrays periodically to prevent memory buildup  
          if (batchIndex % 5 === 0 && this.semanticArrayBuilder) {
            const debugInfo = this.semanticArrayBuilder.getDebugInfo?.();
            const currentArrays = this.semanticArrayBuilder.getArrays();
            
            this.log(DEBUG_LEVELS.INFO, 
              `🧹 Batch ${batchIndex} semantic arrays: ${currentArrays?.originalSegments?.length || 0} original, ${currentArrays?.translatedSegments?.length || 0} translated segments`);
            
            if (debugInfo) {
              this.log(DEBUG_LEVELS.INFO, `📊 Debug info: ${debugInfo.totalUnits} units, ${debugInfo.mappings?.length || 0} mappings`);
            }
            
            // More aggressive cleanup for semantic arrays
            if (this.semanticArrayBuilder.cleanup) {
              this.semanticArrayBuilder.cleanup();
              this.log(DEBUG_LEVELS.INFO, `🧹 Performed semantic array cleanup`);
            }
            
            // REMOVED: Don't reset semantic array builder - preserve all data for final clickability
          }
          
          // Monitor and clear caches if available
          if (this.dictionaryManager) {
            try {
              const cacheStats = this.dictionaryManager.getCacheStats?.();
              if (cacheStats && batchIndex % 5 === 0) {
                this.log(DEBUG_LEVELS.INFO, 
                  `📚 Dictionary cache: ${cacheStats.hitRate || 'N/A'} hit rate, ${cacheStats.size || 0}/${cacheStats.maxSize || 0} entries`);
              }
              
              const parallelStats = this.dictionaryManager.parallelLookupStats;
              if (parallelStats && batchIndex % 5 === 0) {
                const totalLookups = parallelStats.parallelCalls + parallelStats.sequentialCalls;
                const parallelRatio = totalLookups > 0 ? (parallelStats.parallelCalls / totalLookups * 100).toFixed(1) : 0;
                this.log(DEBUG_LEVELS.INFO, 
                  `🔍 Dictionary lookups: ${parallelRatio}% parallel, ${parallelStats.fallbackCount || 0} fallbacks, avg parallel: ${parallelStats.averageParallelTime?.toFixed(1) || 0}ms`);
              }
            } catch (_error) {
              // Ignore cache stat errors
            }
          }
          
          if (this.translationCache && this.translationCache.clearOldEntries) {
            this.translationCache.clearOldEntries();
          }
          
          // More aggressive garbage collection for memory pressure
          if (typeof global !== 'undefined' && global.gc) {
            global.gc();
          } else if (typeof window !== 'undefined' && window.gc) {
            window.gc();
          }
          
          // Remove artificial delays entirely - they were causing exponential slowdown
          const cleanupStartTime = performance.now();
          // await new Promise(resolve => setTimeout(resolve, 2)); // REMOVED - this was the bottleneck
          const cleanupTime = performance.now() - cleanupStartTime;
          
          const totalBatchTime = performance.now() - batchStartTime;
          this.log(DEBUG_LEVELS.INFO, 
            `⏱️ Batch ${batchIndex} timing: ${totalBatchTime.toFixed(1)}ms total, ${cleanupTime.toFixed(1)}ms cleanup delay`);
          
          // If batch is taking too long, warn about potential blocking
          if (totalBatchTime > 5000) { // >5 seconds per batch
            this.log(DEBUG_LEVELS.ERROR, 
              `🐌 SLOW BATCH DETECTED: Batch ${batchIndex} took ${totalBatchTime.toFixed(1)}ms - investigate blocking operations`);
          }
        } else {
          // Standard cleanup
          if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 10) {
            this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-5);
          }
          
          // await new Promise(resolve => setTimeout(resolve, 1)); // REMOVED - no delays needed
        }
      } else {
        // await new Promise(resolve => setTimeout(resolve, 1)); // REMOVED - no delays needed
      }
    }
    
    // PHASE 1: Apply final processing to match original translateWithChunking method exactly
    // Apply punctuation translation to all chunks (needed for cross-chunk context like comma-quote spacing)
    this.textChunker.translatePunctuation(chunks, this.punctuationDict);
    
    // Apply capitalization to all chunks
    this.applySmartCapitalization(chunks);
    
    // Use the same reconstruction method as original translateWithChunking for identical results
    const reconstructed = this.textChunker.reconstructTextWithSegments(chunks, this.semanticArrayBuilder.getArrays());
    const finalResult = reconstructed.text;
    const cleanedFinalResult = this.applyFinalCleanup(finalResult);
    
    // Store prebuilt segments like the original method
    this.prebuiltSegments = reconstructed.segments;
    
    // console.log(`📝 Progressive result (no redundant processing): "${cleanedFinalResult}"`);
    
    // Get semantic arrays built during progressive processing
    const semanticArrays = this.semanticArrayBuilder.getArrays();
    
    // Debug: Let's see what's in the semantic arrays
    // console.log(`🔍 Semantic arrays debug (${semanticArrays.original.length} total):`);
    // for (let i = 0; i < semanticArrays.original.length; i++) {
    //   console.log(`  ${i}: "${semanticArrays.original[i]}" → "${semanticArrays.translated[i]}"`);
    // }
    
    // Find the original chunk that was translated
    const translatedChunk = chunks.find(chunk => chunk.translated && chunk.content.trim());
    
    if (translatedChunk && semanticArrays.original.length > 0) {
      // Now let's try to create word-level segments in the correct output order
      
      // We know the semantic arrays contain: 0:"五百八十"→"580", 1:"第"→"Thứ", 2:"章"→"chương"
      // But the output order is: "Thứ 580 chương"
      // Let's find each word in the output and map it to the correct semantic array index
      
      const wordSegments = [];
      let currentPosition = 0;
      
      // Dynamically detect word order by scanning the output text
      const outputOrder = [];
      
      // Create candidate words from semantic arrays
      const candidateWords = [];
      for (let i = 0; i < semanticArrays.original.length; i++) {
        candidateWords.push({
          semanticIndex: i,
          original: semanticArrays.original[i],
          translated: semanticArrays.translated[i]
        });
      }
      
      // Find each candidate word in the output text and record its position
      // Handle duplicates by searching from different starting positions
      const foundWords = [];
      const usedPositions = new Set(); // Track positions to handle duplicates
      
      for (const candidate of candidateWords) {
        // Use case-insensitive search to handle capitalization differences
        const lowerOutput = cleanedFinalResult.toLowerCase();
        const lowerCandidate = candidate.translated.toLowerCase();
        
        let position = -1;
        let searchStart = 0;
        
        // For duplicates, try to find the next occurrence that hasn't been used
        do {
          position = lowerOutput.indexOf(lowerCandidate, searchStart);
          if (position >= 0) {
            // Check if this position overlaps with any used position
            let overlaps = false;
            for (const usedPos of usedPositions) {
              if (position < usedPos.end && position + candidate.translated.length > usedPos.start) {
                overlaps = true;
                break;
              }
            }
            
            if (!overlaps) {
              // Found a non-overlapping position
              foundWords.push({
                ...candidate,
                position: position
              });
              usedPositions.add({
                start: position,
                end: position + candidate.translated.length
              });
              // console.log(`✅ Found "${candidate.original}" → "${candidate.translated}" at position ${position}`);
              break;
            } else {
              // This position overlaps, try next occurrence
              searchStart = position + 1;
            }
          }
        } while (position >= 0);
        
        // Debug logging disabled for performance (creates 50ms+ delay)
        // if (position < 0 && process.env.NODE_ENV === 'development') {
        //   console.log(`❌ NOT FOUND "${candidate.original}" → "${candidate.translated}"`);
        //   console.log(`   Searching in: "${cleanedFinalResult.substring(0, 100)}..."`);
        //   console.log(`   Looking for: "${candidate.translated}" (${lowerCandidate})`);
        // }
      }
      
      // Sort by position in output text to get the correct order
      foundWords.sort((a, b) => a.position - b.position);
      
      // Create the output order from sorted words
      for (const word of foundWords) {
        outputOrder.push({
          semanticIndex: word.semanticIndex,
          original: word.original,
          translated: word.translated
        });
      }
      
      
      for (let i = 0; i < outputOrder.length; i++) {
        const wordInfo = outputOrder[i];
        // Use case-insensitive search here too for consistency
        const lowerOutput = cleanedFinalResult.toLowerCase();
        const lowerTranslated = wordInfo.translated.toLowerCase();
        const position = lowerOutput.indexOf(lowerTranslated, currentPosition);
        
        if (position >= 0) {
          // Add spacing segment if there's a gap before this word
          if (position > currentPosition) {
            const spaceText = cleanedFinalResult.substring(currentPosition, position);
            
            // Check if spacing contains quotes that need space cleaning
            const quotePattern = /[\u201c\u2018\u201d\u2019"']/; // Opening and closing quotes
            
            if (quotePattern.test(spaceText)) {
              // For spacing containing quotes, clean spaces around them
              // Remove space after opening quotes: ' → '
              // Remove space before closing quotes: ' → '
              const cleanedSpaceText = spaceText
                .replace(/(["\u201c\u2018])\s+/, '$1')  // Remove space after opening quotes
                .replace(/\s+([\u201d\u2019"'])/, '$1'); // Remove space before closing quotes
              wordSegments.push({
                type: 'spacing',
                start: currentPosition,
                end: position,
                text: cleanedSpaceText,
                isClickable: false
              });
              // console.log(`📍 Added spacing (quote-cleaned): "${cleanedSpaceText}" at position ${currentPosition}-${position}`);
            } else {
              // Normal spacing without quotes
              wordSegments.push({
                type: 'spacing',
                start: currentPosition,
                end: position,
                text: spaceText,
                isClickable: false
              });
              // console.log(`📍 Added spacing: "${spaceText}" at position ${currentPosition}-${position}`);
            }
          }
          
          // Add the word segment using the actual text from the output (preserves capitalization)
          const actualText = cleanedFinalResult.substring(position, position + wordInfo.translated.length);
          wordSegments.push({
            type: 'semantic',
            unitIndex: wordInfo.semanticIndex, // Use the correct semantic array index
            start: position,
            end: position + wordInfo.translated.length,
            originalText: wordInfo.original,
            translatedText: actualText, // Use actual text to preserve capitalization
            source: semanticArrays.metadata[wordInfo.semanticIndex]?.source || 'unknown',
            metadata: semanticArrays.metadata[wordInfo.semanticIndex],
            isClickable: true,
            text: actualText // Use actual text to preserve capitalization
          });
          
          currentPosition = position + wordInfo.translated.length;
          // console.log(`✅ Mapped "${wordInfo.original}" → "${wordInfo.translated}" at position ${position} (semantic index ${wordInfo.semanticIndex})`);
        } else {
          console.warn(`❌ Could not find "${wordInfo.translated}" in output`);
        }
      }
      
      // Add any remaining text as non-clickable content
      if (currentPosition < cleanedFinalResult.length) {
        const remainingText = cleanedFinalResult.substring(currentPosition);
        wordSegments.push({
          type: 'remaining',
          start: currentPosition,
          end: cleanedFinalResult.length,
          text: remainingText,
          isClickable: false
        });
      }
      
      this.prebuiltSegments = wordSegments;
    } else {
      this.prebuiltSegments = [];
      console.log(`⚠️ Progressive: No translated chunks or semantic arrays available`);
    }
    
    // Debug logging for semantic array building
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const debugInfo = this.semanticArrayBuilder.getDebugInfo();
      this.log(DEBUG_LEVELS.DEBUG, 
        `🔍 Semantic arrays before final processing: ${debugInfo.totalUnits} units`);
      this.log(DEBUG_LEVELS.VERBOSE,
        `📋 Semantic mappings:`, debugInfo.mappings?.slice(0, 10) || []); // Show first 10 for brevity
    }
    
    // Verify position tracking worked correctly
    const unpositionedSegments = this.translationSegments.filter(s => s.translatedStart === -1);
    if (unpositionedSegments.length > 0) {
      this.log(DEBUG_LEVELS.WARN, 
        `⚠️ ${unpositionedSegments.length} segments missing positions in final processing - position tracking bug detected`);
    }
    this.semanticArrayBuilder.updateWithCapitalizedText(cleanedFinalResult);
    
    // Debug logging after final processing
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const finalDebugInfo = this.semanticArrayBuilder.getDebugInfo();
      this.log(DEBUG_LEVELS.DEBUG, 
        `✅ Final semantic arrays: ${finalDebugInfo.totalUnits} units`);
    }
    
    const translationTime = performance.now() - startTime;
    
    // Final memory report
    const finalMemoryReport = this.memoryTracker.getReport();
    if (finalMemoryReport) {
      // Final memory logging disabled to prevent performance impact
      // this.log(DEBUG_LEVELS.INFO, `🧠 Final memory usage: +${finalMemoryReport.memoryGrowthMB.toFixed(1)}MB growth, ${finalMemoryReport.currentUsedMB.toFixed(1)}MB current`);
      
      if (finalMemoryReport.memoryGrowthMB > 50) {
        this.log(DEBUG_LEVELS.WARN, 
          `⚠️ High memory usage detected: ${finalMemoryReport.memoryGrowthMB.toFixed(1)}MB growth over ${finalMemoryReport.totalSnapshots} batches`);
      }
    }
    
    this.log(DEBUG_LEVELS.INFO, `✅ Progressive translation completed: ${batchIndex} batches in ${translationTime.toFixed(1)}ms`);
    
    // OPTIMIZED FIX: Use naturally accumulated semantic arrays and update with final text
    // PHASE 4: Validate progressive results before return
    const progressiveTextLength = this.progressivePositionTracker.finalText.length;
    const fallbackTextLength = cleanedFinalResult.length;
    
    if (Math.abs(progressiveTextLength - fallbackTextLength) > 10) {
      this.log(DEBUG_LEVELS.WARN, 
        `⚠️ Progressive text length mismatch: ${progressiveTextLength} vs ${fallbackTextLength} (fallback)`);
    }
    
    // BUGFIX: Use semanticArrayBuilder directly for final return to avoid duplicates
    const finalSemanticArrays = this.semanticArrayBuilder.getArrays();
    
    this.log(DEBUG_LEVELS.INFO, `🎯 Progressive semantic arrays: ${finalSemanticArrays.original?.length || 0} segments built progressively`);
    
    // BUGFIX: Use existing metadata from builder, fill gaps with defaults
    const finalMetadata = [];
    for (let i = 0; i < (finalSemanticArrays.original?.length || 0); i++) {
      finalMetadata[i] = finalSemanticArrays.metadata?.[i] || {
        source: 'progressive',
        phase: 'unknown',
        dictionary: 'unknown'
      };
    }
    
    return {
      translatedText: cleanedFinalResult, // Use capitalized result, not progressive tracker (which lacks capitalization)
      semanticArrays: {
        original: finalSemanticArrays.original || [],
        translated: finalSemanticArrays.translated || [],
        metadata: finalMetadata
      },
      progressiveSegments: this.progressivePositionTracker.clickableSegments
    };
  }

  /**
   * Translate text using chunk-based processing for better accuracy and potential parallelization
   * @param {string} text - Input text
   * @param {Object} options - Translation options
   * @returns {string} Translated text
   */
  async translateWithChunking(text, options = {}) {
    const startTime = performance.now();
    
    // Initialize segments collection for chunked translation
    this.translationSegments = [];
    
    // Reset semantic array builder for new translation
    this.semanticArrayBuilder.reset();
    
    // Step 1: Split text into chunks by punctuation boundaries
    const chunks = this.textChunker.chunkText(text);
    const analysis = this.textChunker.analyzeChunks(chunks);
    
    
    this.log(DEBUG_LEVELS.INFO, `🧩 Starting chunked translation: ${chunks.length} chunks`);
    
    this.log(DEBUG_LEVELS.DEBUG, `📊 Chunk analysis:`, analysis);
    
    // Step 2: Get chunks that need translation (contain Chinese text)
    const translatableChunks = this.textChunker.getTranslatableChunks(chunks);
    
    if (translatableChunks.length === 0) {
      // No Chinese text to translate
      return text;
    }
    
    // Step 3: Translate chunks (with potential parallelization)
    const enableParallel = options.parallel !== false && translatableChunks.length > 1;
    
    if (enableParallel) {
      this.log(DEBUG_LEVELS.DEBUG, `🔄 Processing ${translatableChunks.length} chunks in parallel`);
      
      // Translate chunks in parallel
      const translationPromises = translatableChunks.map(chunk => 
        this.translateDirectly(chunk.content, { ...options, useChunking: false, chunkOffset: chunk.startIndex, isParallelChunk: true })
      );
      
      const translatedContents = await Promise.all(translationPromises);
      
      // Apply translated results back to chunks
      translatableChunks.forEach((chunk, index) => {
        chunk.translated = translatedContents[index];
      });
      
    } else {
      this.log(DEBUG_LEVELS.DEBUG, `🔄 Processing ${translatableChunks.length} chunks sequentially with time-slicing`);
      
      // Translate chunks sequentially with time-slicing to prevent UI blocking
      let lastYieldTime = performance.now();
      for (let i = 0; i < translatableChunks.length; i++) {
        const chunk = translatableChunks[i];
        
        chunk.translated = await this.translateDirectly(chunk.content, { ...options, useChunking: false, chunkOffset: chunk.startIndex, isParallelChunk: true });
        
        // Time-slice: Yield control when processing time exceeds 16ms (60fps threshold)
        const currentTime = performance.now();
        if (currentTime - lastYieldTime > 16 && i < translatableChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
          lastYieldTime = performance.now();
        }
      }
    }
    
    // Step 4: Apply punctuation translation
    this.textChunker.translatePunctuation(chunks, this.punctuationDict);
    
    // Step 5: Apply smart capitalization based on punctuation context
    this.applySmartCapitalization(chunks);
    
    // Step 6: Reconstruct the final text with segment positions built simultaneously
    const reconstructed = this.textChunker.reconstructTextWithSegments(chunks, this.semanticArrayBuilder.getArrays());
    let result = reconstructed.text;
    
    // Step 7: Apply final cleanup (spacing, etc.)
    result = this.applyFinalCleanup(result);
    
    // Step 8: Store prebuilt segments for instant clickable highlighting
    this.prebuiltSegments = reconstructed.segments;
    
    // Legacy position calculation no longer needed
    // this.calculateTranslatedPositions(result);
    
    const translationTime = performance.now() - startTime;
    this.log(DEBUG_LEVELS.INFO, `✅ Chunked translation completed: ${chunks.length} chunks in ${translationTime.toFixed(1)}ms`);
    
    return result;
  }

  /**
   * Direct translation method (original single-text approach)
   * @param {string} text - Input text
   * @param {Object} options - Translation options
   * @returns {string} Translated text
   */
  async translateDirectly(text, options = {}) {
    // This is the original translate method logic, renamed for chunk-based architecture
    const startTime = performance.now();
    const _translationId = this.stats.totalTranslations++;

    try {
      // Only reset segments if not called from chunked translation or parallel processing
      if (options.useChunking !== false && !options.isParallelChunk) {
        this.translationSegments = [];
        // Reset semantic array builder for new translation
        this.semanticArrayBuilder.reset();
      }

      // OPTIMIZATION: Build Rust-powered lookup index for large texts (6-50x faster)
      // Only build if not already provided and text is large enough
      if (!options.lookupIndex && text.length >= 50 && options.useSharedLookupIndex !== false) {
        try {
          const { rustLookupIndexManager } = await import('./RustLookupIndexManager.js');

          if (rustLookupIndexManager.isAvailable()) {
            const indexStartTime = performance.now();

            // Get dictionary search order (fallback to default if not available)
            const dictionaryOrder = this.dictionaryOrder ||
                                   this.dictionaryManager.getDefaultSearchOrder() ||
                                   [];

            // Build lookup index using Rust + Rayon
            const indexResult = await rustLookupIndexManager.buildLookupIndex(
              text,
              this.dictionaryManager.dictionaries,  // Map of dictionary name -> trie
              dictionaryOrder,  // Dictionary search order
              {
                minTextLength: 50,
                enableIndexing: true,
                useParallel: true,
              }
            );

            if (indexResult.success && indexResult.index) {
              // Convert to Map for faster lookups
              // IMPORTANT: Convert string keys from JSON back to numbers
              options.lookupIndex = new Map(
                Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])
              );
              options.useSharedLookupIndex = true;

              const indexTime = performance.now() - indexStartTime;
              this.log(DEBUG_LEVELS.DEBUG, `🦀 Rust lookup index built: ${indexResult.positionsIndexed} positions, ${indexResult.indexSize} matches in ${indexTime.toFixed(1)}ms (Rust: ${indexResult.buildTimeMs}ms)`);
            }
          }
        } catch (error) {
          this.log(DEBUG_LEVELS.WARN, '⚠️ Rust lookup index build failed, using traditional lookup:', error.message);
          // Continue without lookup index (traditional dictionary lookup will be used)
        }
      }

      // Phase 1: Tokenization with memory-based processing limits
      const tokens = this.tokenizer.tokenize(text);
      
      // CRITICAL: Validate token count to prevent memory exhaustion
      const estimatedTokenCount = text.length * 1.2; // Conservative estimate
      const maxTokensAllowed = this.calculateMaxTokensForDevice();
      
      if (tokens.length > maxTokensAllowed || estimatedTokenCount > maxTokensAllowed) {
        // Graceful degradation: split into manageable chunks
        this.log(DEBUG_LEVELS.WARN, `⚠️ Large input detected: ${tokens.length} tokens (limit: ${maxTokensAllowed}). Applying chunking strategy.`);
        
        // Force chunking for oversized inputs
        if (!options.useChunking) {
          return this.translateWithChunking(text, { ...options, useChunking: true, forceChunking: true });
        }
        
        // If already chunking and still too large, split into smaller chunks
        if (tokens.length > maxTokensAllowed * 2) {
          throw new Error(`Input too large: ${tokens.length} tokens exceeds maximum safe processing limit. Please split your text into smaller sections.`);
        }
      }

      // Use optimized single-pass processing
      await this.translateSinglePass(tokens, options);

      // Phase 7: Post-processing and cleanup (simplified for direct mode)
      const result = this.postProcess(tokens, options);
      
      const translationTime = performance.now() - startTime;
      this.log(DEBUG_LEVELS.VERBOSE, `✅ Direct translation completed: ${tokens.length} tokens in ${translationTime.toFixed(1)}ms`);

      return result;
    } catch (_error) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Translation error:`, _error);
      throw _error;
    }
  }

  // ============================================================================
  // SECTION 11: CORE 5-PHASE TRANSLATION PIPELINE
  // ============================================================================
  // Purpose: Execute all 5 phases in sequence
  // Dependencies: ALL PHASES (this is the main pipeline)
  // Extraction Potential: NONE - Heart of the translation system
  // Critical: Phase order is IMMUTABLE
  //
  // Phase Execution Order (NEVER CHANGE):
  //   1. Pattern Processing    (applyPatterns)
  //   2. Proper Noun Processing (createOptimalPhraseGroups)
  //   3. Number Processing     (processNumbersWasm)
  //   4. Phrase Processing     (processRemainingPhrases)
  //   5. Character Processing  (applyDictionaryTranslation)
  //
  // Why Sequential: Each phase consumes tokens, preventing double-processing
  // Why Coupled: Shared token state requires synchronous coordination
  // ============================================================================

  /**
   * OPTIMIZED: Single-pass token processing with priority-based translation
   * Processes tokens in order, applying highest priority matches first
   * This replaces the original 7-phase sequential processing
   */
  async translateSinglePass(tokens, options = {}) {
    const startTime = performance.now();
    this.log(DEBUG_LEVELS.VERBOSE, `🚀 Single-pass translation: ${tokens.length} tokens`);

    // Record total translation time for profiling
    await this.profiler.profile('total', async () => {
      // Phase 1: Apply patterns first (they need full context)
      await this.profiler.profile('patterns', async () => {
        await this.applyPatterns(tokens, { ...options, debug: true });
      });

      // Phase 2: Apply proper nouns globally (highest priority after patterns)
      await this.profiler.profile('properNouns', async () => {
        await this.applyDictionaryTranslation(tokens, {
          ...options,
          dictionaryOrder: [...this.activeProperNouns],
          phase: 'properNouns',
        });
      });

      // Phase 3: Apply number conversion globally (before phrases to prevent fragmentation)
      // Numbers should be processed before phrases to preserve number sequences like "六十五"
      // This prevents phrase-level matches from breaking up number tokens
      await this.profiler.profile('numbers', async () => {
        // Use WASM number processing (5-10x faster for Chinese number conversion)
        try {
          const processedTokens = await processNumbersWasm(tokens);
          // Copy WASM results with proper undefined → null conversion
          copyWasmTokens(processedTokens, tokens);

          // Add number conversions to semantic array for clickable highlighting
          // WASM doesn't have access to semanticArrayBuilder, so we add entries here
          for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Find number conversion results (main token, not consumed tokens)
            if (token.translationSource === 'number_conversion' && token.translated) {
              // Collect original text from this token and any consumed tokens following it
              let originalText = token.value;
              let endIndex = i;

              // Look ahead for consumed tokens that are part of this number
              for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].translationSource === 'number_conversion_consumed') {
                  originalText += tokens[j].value;
                  endIndex = j;
                } else {
                  break;  // Stop when we hit a non-consumed token
                }
              }

              // Add to semantic array
              const globalTokenIndex = i + (options.chunkOffset || 0);
              this.semanticArrayBuilder.addUnit(
                originalText,
                token.translated,
                'numbers',
                globalTokenIndex
              );
            }
          }
        } catch (error) {
          this.log(DEBUG_LEVELS.WARN, '⚠️ WASM number processing failed, falling back to JavaScript:', error.message);
          // Fallback to JavaScript number processing
          this.numberProcessor.processTokens(tokens, {
            debugLevel: this.debugLevel,
            semanticArrayBuilder: this.semanticArrayBuilder,
            ...options
          });
        }
      });

      // Phase 4: Apply phrases with global longest-match optimization
      await this.profiler.profile('phrases', async () => {
        await this.createOptimalPhraseGroups(tokens, options);
      });

      // Track which tokens have been processed to avoid re-processing
      const processedTokens = new Set();

      // Mark tokens that were already processed by patterns and proper nouns
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].translated !== null || tokens[i].translationSource || tokens[i].isGrouped) {
          processedTokens.add(i);
        }
      }

      // Phase 5: Process remaining tokens for character-level translation (fallback)
      await this.profiler.profile('characters', async () => {
        await this.processRemainingTokensInBatches(tokens, processedTokens, options);
      });

      // Apply final fixes that need to run after all processing
      this.profiler.profileSync('postProcess', () => {
        this.fixNumberPlusLiangTranslations(tokens);
      });
    });

    const translationTime = performance.now() - startTime;
    this.log(DEBUG_LEVELS.VERBOSE, `✅ Single-pass completed: ${tokens.length} tokens in ${translationTime.toFixed(1)}ms`);
  }

  /**
   * Try all translation phases at a specific token position in priority order
   * Returns the number of tokens consumed by the best match
   */
  async tryAllPhasesAtPosition(tokens, position, options) {
    const _token = tokens[position];
    
    // Priority 1: Proper nouns (highest priority)
    let result = await this.tryProperNounsAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;
    
    // Priority 2: Structural patterns
    result = await this.tryPatternsAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;
    
    // Priority 3: Phrases (with conflict detection)
    result = await this.tryPhrasesAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;
    
    // Priority 4: Chinese number conversion
    result = this.tryNumberConversionAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;
    
    // Priority 5: Character-level translation (fallback)
    result = await this.tryCharactersAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;
    
    // No match found, return 0 consumed
    return { consumed: 0 };
  }



  /**
   * Try proper noun translation at a specific position
   */
  async tryProperNounsAtPosition(tokens, position, options) {
    const _originalToken = tokens[position];
    
    // Use the standard dictionary lookup approach with combined proper noun dictionaries
    // This automatically handles longest-match-first by using findAllMatches with length sorting
    const remainingText = this.reconstructTextFromIndex(tokens, position);
    
    const matches = await this.findAllMatchesWithSemanticCache(
      remainingText,
      0,
      this.activeProperNouns  // All proper noun dictionaries combined
    );
    
    // Take the first match (longest due to sorting in findAllMatches)
    if (matches.length > 0) {
      const bestMatch = matches[0];
      
      // Calculate consumed count BEFORE modifying tokens
      const consumed = bestMatch.tokenLength || this.getTokenSpanForText(tokens, position, bestMatch.word);
      
      this.applyMatchToTokens(tokens, position, bestMatch, options);
      
      return { consumed };
    }
    
    return { consumed: 0 };
  }

  /**
   * Try structural pattern matching at a specific position
   */
  async tryPatternsAtPosition(tokens, position, options) {
    // Use existing pattern processor
    if (this.semanticPatternProcessor) {
      // For now, use a simplified approach - can be enhanced later
      // Check if there's a pattern match starting at this position
      const matchResult = await this.tryPatternAtPosition(tokens, position, options);
      if (matchResult && matchResult.consumed > 0) {
        return { consumed: matchResult.consumed };
      }
    }
    
    return { consumed: 0 };
  }

  /**
   * Try pattern matching at a specific position using SemanticPatternProcessor
   * NOTE: This method is now only used by the fallback tryAllPhasesAtPosition
   * The main single-pass approach applies patterns globally first
   */
  async tryPatternAtPosition(_tokens, _position, _options) {
    if (!this.semanticPatternProcessor.isInitialized) {
      return { consumed: 0 };
    }
    
    // For compatibility with the old approach, return 0 consumed
    // Patterns are now handled globally in the single-pass approach
    return { consumed: 0 };
  }

  /**
   * Try phrase translation at a specific position
   */
  async tryPhrasesAtPosition(tokens, position, options) {
    // Skip if token is already processed
    if (tokens[position].translated !== null || tokens[position].translationSource) {
      return { consumed: 0 };
    }
    
    const dictionary = this.dictionaryManager.getDictionary('phrases');
    if (!dictionary) return { consumed: 0 };
    
    const match = this.findLongestMatchAtPosition(tokens, position, dictionary);
    if (match) {
      // Check for conflicts with existing processed tokens
      const hasConflict = this.checkForConflictAtPosition(tokens, position, match.tokenLength);
      if (!hasConflict) {
        // Apply the match to tokens with proper dictionary name
        const matchWithDictName = {
          ...match,
          dictionary: 'phrases'
        };
        this.applyMatchToTokens(tokens, position, matchWithDictName, options);
        return { consumed: match.tokenLength };
      }
    }
    
    return { consumed: 0 };
  }

  /**
   * Try Chinese number conversion at a specific position
   */
  tryNumberConversionAtPosition(tokens, position, options) {
    // Skip if token is already processed
    if (tokens[position].translated !== null || tokens[position].translationSource) {
      return { consumed: 0 };
    }
    
    // Only process if this token is a Chinese character (NumberProcessor requirement)
    if (tokens[position].type !== 'chinese_char') {
      return { consumed: 0 };
    }
    
    // Use the full NumberProcessor logic but only for this position
    const consumed = this.tryNumberProcessorAtPosition(tokens, position, options);
    
    return { consumed };
  }

  /**
   * Try NumberProcessor at a specific position
   */
  tryNumberProcessorAtPosition(tokens, position, options) {
    // Get the current token
    const _token = tokens[position];
    
    // Create a temporary token array with just the tokens from this position onwards
    // This allows NumberProcessor to find multi-token number sequences
    const tempTokens = tokens.slice(position);
    
    // Track original token states to restore later
    const originalStates = tempTokens.map(t => ({
      translated: t.translated,
      translationSource: t.translationSource
    }));
    
    // Apply NumberProcessor to the temporary tokens
    this.numberProcessor.processTokens(tempTokens, {
      debugLevel: this.debugLevel,
      semanticArrayBuilder: this.semanticArrayBuilder,
      ...options
    });
    
    // Find how many tokens were consumed by checking consecutive modified tokens from start
    let consumed = 0;
    for (let i = 0; i < tempTokens.length; i++) {
      if (tempTokens[i].translated !== originalStates[i].translated ||
          tempTokens[i].translationSource !== originalStates[i].translationSource) {
        // Only count consecutive tokens from the start
        if (i === consumed) {
          consumed = i + 1;
        }
        // If there's a gap, stop counting (NumberProcessor might have processed later tokens)
      }
    }
    
    if (consumed > 0) {
      // Apply the changes back to the original tokens
      for (let i = 0; i < consumed; i++) {
        tokens[position + i].translated = tempTokens[i].translated;
        tokens[position + i].translationSource = tempTokens[i].translationSource;
      }
    }
    
    return consumed;
  }

  /**
   * Try character-level translation at a specific position
   */
  async tryCharactersAtPosition(tokens, position, options) {
    // Skip if token is already processed
    if (tokens[position].translated !== null || tokens[position].translationSource) {
      return { consumed: 0 };
    }
    
    const dictionary = this.dictionaryManager.getDictionary('characters');
    if (!dictionary) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Character Phase 5 - No character dictionary found`);
      return { consumed: 0 };
    }
    
    const match = this.findLongestMatchAtPosition(tokens, position, dictionary);
    if (match) {
      // Apply the match to tokens with proper dictionary name
      const matchWithDictName = {
        ...match,
        dictionary: 'characters'
      };
      this.applyMatchToTokens(tokens, position, matchWithDictName, options);
      return { consumed: match.tokenLength };
    }
    
    return { consumed: 0 };
  }

  /**
   * Find the longest dictionary match starting at a specific position
   */
  findLongestMatchAtPosition(tokens, position, dictionary) {
    let bestMatch = null;
    let maxLength = 0;
    
    // Try matches of different lengths starting from current position
    for (let length = 1; length <= tokens.length - position && length <= 10; length++) {
      const tokenSequence = tokens.slice(position, position + length);
      const text = tokenSequence.map(t => t.value).join('');
      
      // Use dictionary trie directly instead of translation manager
      const result = dictionary.get(text);
      if (result) {
        if (length > maxLength) {
          maxLength = length;
          bestMatch = {
            word: text,
            translation: result,
            dictionary: dictionary,
            tokenLength: length
          };
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Check for conflicts with already processed tokens
   */
  checkForConflictAtPosition(tokens, position, length) {
    for (let i = position; i < position + length; i++) {
      if (i >= tokens.length) break;
      if (tokens[i].translated !== null || tokens[i].translationSource) {
        return true; // Conflict found
      }
    }
    return false;
  }


  /**
   * Apply smart capitalization based on what starts each chunk
   * @param {TextChunk[]} chunks - Array of chunks to process
   */
  applySmartCapitalization(chunks) {
    if (!chunks || chunks.length === 0) return;

    // Define capitalization rules based on what starts each chunk
    const capitalizationRules = {
      'start': true,           // Beginning of text
      'linebreak': true,       // After line breaks (new paragraph)
      '.': true,              // After period
      '!': true,              // After exclamation
      '?': true,              // After question mark
      '。': true,             // Chinese period
      '．': true,             // Chinese middle dot (also used as period)
      '！': true,             // Chinese exclamation
      '？': true,             // Chinese question mark
      ':': true,              // After colon (your example shows this should capitalize)
      '：': true,             // Chinese colon
      ',': false,             // After comma - NO capitalization
      '，': false,            // Chinese comma - NO capitalization
      ';': false,             // After semicolon - NO capitalization
      '；': false,            // Chinese semicolon - NO capitalization
      '[': false,             // After opening bracket - NO capitalization
      ']': false,             // After closing bracket - NO capitalization
      '(': false,             // After opening parenthesis - NO capitalization
      ')': false,             // After closing parenthesis - NO capitalization
      '…': true,              // After ellipsis - YES capitalization
      '……': true,            // After Chinese double ellipsis - YES capitalization  
      '"': false,             // After straight quote - NO capitalization (quotes mid-sentence)
      '\u201c': false,        // After curly opening quote - NO capitalization (quotes mid-sentence)
      '\u201d': false,        // After curly closing quote - NO capitalization
      '\u2018': false,        // After curly opening apostrophe - NO capitalization (quotes mid-sentence)
      '\u2019': false,        // After curly closing apostrophe - NO capitalization
      '\'': false,            // After straight apostrophe - NO capitalization
      '': false,              // After no punctuation - NO capitalization
    };
    
    // Apply capitalization rules to each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.translated) continue;
      
      // Check for advanced capitalization rules
      let shouldCapitalize = capitalizationRules[chunk.startedBy];
      
      // Handle multi-character punctuation sequences
      if (!shouldCapitalize && chunk.startedBy) {
        // Check if startedBy contains sentence-ending punctuation
        const sentenceEnders = ['.', '!', '?', '。', '．', '！', '？'];
        const colonMarks = [':', '：'];
        const ellipsisMarks = ['…', '……'];
        
        // Check for sentence-ending punctuation (anywhere in the sequence)
        const hasSentenceEnder = sentenceEnders.some(punct => chunk.startedBy.includes(punct));
        
        // Check for colon (anywhere in the sequence)
        const hasColon = colonMarks.some(punct => chunk.startedBy.includes(punct));
        
        // Check for ellipsis (anywhere in the sequence)
        const hasEllipsis = ellipsisMarks.some(punct => chunk.startedBy.includes(punct));
        
        if (hasSentenceEnder || hasColon || hasEllipsis) {
          shouldCapitalize = true;
          const reason = hasSentenceEnder ? 'sentence ender' : (hasColon ? 'colon' : 'ellipsis');
          this.log(DEBUG_LEVELS.VERBOSE, `📝 Multi-char punctuation capitalization: "${chunk.startedBy}" contains ${reason}`);
        }
      }
      
      // Special handling for opening quotes
      if (!shouldCapitalize && chunk.startedBy) {
        // Check if startedBy is an opening quote
        const isOpeningQuote = QuoteProcessor.isOpeningQuote(chunk.startedBy);
        
        if (isOpeningQuote) {
          // For opening quotes, we need to determine if they're starting a new sentence/paragraph
          const previousChunk = i > 0 ? chunks[i - 1] : null;
          
          // Consider it a sentence start if:
          // 1. It's the very beginning (no previous chunk)
          // 2. Previous chunk has line breaks (new paragraph)
          // 3. It's marked as starting the text
          const isAtSentenceStart = !previousChunk || 
                                   previousChunk.lineBreaks || 
                                   chunk.startedBy === 'start' ||
                                   (previousChunk && !previousChunk.content.trim()); // Previous chunk was just whitespace
          
          if (isAtSentenceStart) {
            shouldCapitalize = true;
            this.log(DEBUG_LEVELS.VERBOSE, `📝 Opening quote at sentence start: "${chunk.startedBy}" triggers capitalization`);
          }
        }
      }
      
      if (shouldCapitalize) {
        // Check if this chunk is already properly capitalized from dictionary (proper noun)
        const isAlreadyCapitalized = chunk.translated.charAt(0) === chunk.translated.charAt(0).toUpperCase();
        
        this.log(DEBUG_LEVELS.DEBUG, `🔍 Capitalization check: startedBy="${chunk.startedBy}", shouldCapitalize=${shouldCapitalize}, isAlreadyCapitalized=${isAlreadyCapitalized}, text="${chunk.translated}"`);
        
        if (!isAlreadyCapitalized) {
          const oldText = chunk.translated;
          chunk.translated = this.capitalizeFirstLetter(chunk.translated);
          this.log(DEBUG_LEVELS.DEBUG, `📝 CAPITALIZED: "${oldText}" → "${chunk.translated}"`);
        } else {
          this.log(DEBUG_LEVELS.DEBUG, `📝 Already capitalized: "${chunk.translated}"`);
        }
      } else {
        // For non-capitalizing contexts, check if this is a proper noun and preserve its dictionary capitalization
        const isProperNoun = this.isProperNounTranslation(chunk.translated);
        if (isProperNoun) {
          // Preserve proper noun capitalization exactly as defined in dictionary
          const originalCapitalization = this.getOriginalProperNounCapitalization(chunk.translated);
          if (originalCapitalization && originalCapitalization !== chunk.translated) {
            const oldText = chunk.translated;
            chunk.translated = originalCapitalization;
            this.log(DEBUG_LEVELS.DEBUG, `🏛️ Proper noun capitalization preserved: "${oldText}" → "${chunk.translated}"`);
          } else {
            this.log(DEBUG_LEVELS.DEBUG, `🏛️ Proper noun already correctly capitalized: "${chunk.translated}"`);
          }
        } else {
          this.log(DEBUG_LEVELS.DEBUG, `📝 NOT capitalizing chunk started by "${chunk.startedBy}": "${chunk.translated}"`);
        }
      }
    }
  }

  /**
   * Escape special regex characters in a string
   * @param {string} string - String to escape
   * @returns {string} Escaped string safe for use in regex
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if a translated text is a proper noun by checking cached proper noun translations
   * @param {string} translatedText - The translated text to check
   * @returns {boolean} True if this is a proper noun translation
   */
  isProperNounTranslation(translatedText) {
    if (!translatedText || !this.properNounTranslations) return false;
    
    // Check if this translation exists in our cached proper noun translations
    return this.properNounTranslations.has(translatedText.toLowerCase());
  }

  /**
   * Get the original dictionary capitalization for a proper noun translation
   * @param {string} translatedText - The translated text (possibly lowercase)
   * @returns {string|null} Original capitalization from dictionary, or null if not found
   */
  getOriginalProperNounCapitalization(translatedText) {
    if (!translatedText || !this.properNounTranslations) return null;
    
    // Return the original capitalization from our cache
    return this.properNounTranslations.get(translatedText.toLowerCase()) || null;
  }

  /**
   * Capitalize the first letter of a string (handles Vietnamese characters)
   * @param {string} text - Text to capitalize
   * @returns {string} Text with first letter capitalized
   */
  capitalizeFirstLetter(text) {
    if (!text) return text;
    
    // Find the first letter (skip spaces and punctuation)
    const match = text.match(/^(\s*)([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])/i);
    
    if (match) {
      const prefix = match[1]; // spaces before the letter
      const letter = match[2]; // the letter to capitalize
      const rest = text.slice(match[0].length); // rest of the text
      
      return prefix + letter.toUpperCase() + rest;
    }
    
    return text;
  }

  /**
   * Apply final cleanup: spacing and other formatting
   * @param {string} text - Text to clean up
   * @returns {string} Cleaned up text
   */
  applyFinalCleanup(text) {
    if (!text) return text;

    // Clean up spacing but preserve line breaks
    let cleanedText = text;
    
    // Add space between Vietnamese text and Arabic numerals (like "Thứ422giới" -> "Thứ 422 giới")
    // BUT preserve number formatting by excluding number-related characters (comma, period, dash, plus, percent)
    cleanedText = cleanedText.replace(/([^\s\d,.\-+%])(\d)/g, '$1 $2');
    cleanedText = cleanedText.replace(/(\d)([^\s\d,.\-+%])/g, '$1 $2');
    
    // Clean up multiple spaces (but not across line breaks)
    cleanedText = cleanedText.replace(/[^\S\r\n]+/g, ' ');
    
    // Remove spaces at the beginning and end of lines
    cleanedText = cleanedText.replace(/^[ \t]+|[ \t]+$/gm, '');
    
    return cleanedText;
  }

  /**
   * PHASE 1: Progressive batch processing - eliminates O(n²) redundancy
   * Process only current batch chunks instead of all chunks every time
   * @param {TextChunk[]} currentBatch - Current batch of chunks to process
   * @param {TextChunk[]} allChunks - All chunks (for context like capitalization)
   * @param {number} batchStartIndex - Starting index of current batch
   */
  processBatchChunksProgressive(currentBatch, _allChunks, _batchStartIndex) {
    // Apply punctuation translation to only the current batch chunks
    this.textChunker.translatePunctuation(currentBatch, this.punctuationDict);
    
    // DISABLED: Apply capitalization with context awareness for opening quotes
    // this.applyBatchCapitalization(currentBatch, allChunks, batchStartIndex);
    // Capitalization is handled at the final level
  }

  /**
   * Apply capitalization to reconstructed text (progressive)
   * @param {string} text - Reconstructed text from chunks
   * @param {TextChunk[]} allChunks - All chunks for context
   * @returns {string} Text with proper capitalization
   */
  applyCapitalizationToText(text, allChunks) {
    // Apply smart capitalization to all chunks first
    this.applySmartCapitalization(allChunks);
    
    // Then reconstruct the text with capitalized chunks
    const capitalizedText = this.textChunker.reconstructText(allChunks);
    const finalCapitalizedText = this.applyFinalCleanup(capitalizedText);
    
    return finalCapitalizedText;
  }

  /**
   * Apply smart capitalization to current batch only (progressive) - DEPRECATED
   * @param {TextChunk[]} batchChunks - Current batch chunks to process
   * @param {TextChunk[]} allChunks - All chunks for context lookup
   * @param {number} batchStartIndex - Starting index of batch in all chunks
   */
  applySmartCapitalizationToBatch(batchChunks, allChunks, batchStartIndex) {
    if (!batchChunks || batchChunks.length === 0) return;
    
    this.log(DEBUG_LEVELS.DEBUG, `📝 Progressive capitalization: Processing ${batchChunks.length} chunks in batch starting at ${batchStartIndex}`);

    // Define capitalization rules (same as applySmartCapitalization)
    const capitalizationRules = {
      'start': true,           // Beginning of text
      'linebreak': true,       // After line breaks (new paragraph)
      '.': true,              // After period
      '!': true,              // After exclamation
      '?': true,              // After question mark
      '。': true,             // Chinese period
      '．': true,             // Chinese middle dot (also used as period)
      '！': true,             // Chinese exclamation
      '？': true,             // Chinese question mark
      ':': true,              // After colon
      '：': true,             // Chinese colon
      ',': false,             // After comma - NO capitalization
      '，': false,            // Chinese comma - NO capitalization
      ';': false,             // After semicolon - NO capitalization
      '；': false,            // Chinese semicolon - NO capitalization
      '[': false,             // After opening bracket - NO capitalization
      ']': false,             // After closing bracket - NO capitalization
      '(': false,             // After opening parenthesis - NO capitalization
      ')': false,             // After closing parenthesis - NO capitalization
      '…': true,              // After ellipsis - YES capitalization
      '……': true,            // After Chinese double ellipsis - YES capitalization  
      '"': false,             // After straight quote - NO capitalization
      '\u201c': false,        // After curly opening quote - NO capitalization
      '\u201d': false,        // After curly closing quote - NO capitalization
      '\u2018': false,        // After curly opening apostrophe - NO capitalization
      '\u2019': false,        // After curly closing apostrophe - NO capitalization
      '\'': false,            // After straight apostrophe - NO capitalization
      '': false,              // After no punctuation - NO capitalization
    };
    
    // Process each chunk in the current batch only
    for (let i = 0; i < batchChunks.length; i++) {
      const chunk = batchChunks[i];
      if (!chunk.translated) continue;
      
      this.log(DEBUG_LEVELS.DEBUG, `📝 Processing batch chunk ${i}: "${chunk.translated}" (started by: "${chunk.startedBy}")`);
      
      // Check for basic capitalization rules
      let shouldCapitalize = capitalizationRules[chunk.startedBy];
      
      // Handle multi-character punctuation sequences
      if (!shouldCapitalize && chunk.startedBy) {
        const sentenceEnders = ['.', '!', '?', '。', '．', '！', '？'];
        const colonMarks = [':', '：'];
        const ellipsisMarks = ['…', '……'];
        
        const hasSentenceEnder = sentenceEnders.some(punct => chunk.startedBy.includes(punct));
        const hasColon = colonMarks.some(punct => chunk.startedBy.includes(punct));
        const hasEllipsis = ellipsisMarks.some(punct => chunk.startedBy.includes(punct));
        
        if (hasSentenceEnder || hasColon || hasEllipsis) {
          shouldCapitalize = true;
          const reason = hasSentenceEnder ? 'sentence ender' : (hasColon ? 'colon' : 'ellipsis');
          this.log(DEBUG_LEVELS.VERBOSE, `📝 Multi-char punctuation capitalization: "${chunk.startedBy}" contains ${reason}`);
        }
      }
      
      // Special handling for opening quotes with cross-chunk context
      if (!shouldCapitalize && chunk.startedBy) {
        const isOpeningQuote = QuoteProcessor.isOpeningQuote(chunk.startedBy);
        
        if (isOpeningQuote) {
          // Calculate absolute chunk index for context lookup
          const absoluteChunkIndex = batchStartIndex + i;
          const previousChunk = absoluteChunkIndex > 0 ? allChunks[absoluteChunkIndex - 1] : null;
          
          // Sentence start detection (same logic as applySmartCapitalization)
          const isAtSentenceStart = !previousChunk || 
                                   previousChunk.lineBreaks || 
                                   chunk.startedBy === 'start' ||
                                   (previousChunk && !previousChunk.content.trim());
          
          if (isAtSentenceStart) {
            shouldCapitalize = true;
            this.log(DEBUG_LEVELS.VERBOSE, `📝 Opening quote at sentence start: "${chunk.startedBy}" triggers capitalization`);
          }
        }
      }
      
      // Apply capitalization if needed
      if (shouldCapitalize) {
        const isAlreadyCapitalized = chunk.translated.charAt(0) === chunk.translated.charAt(0).toUpperCase();
        
        if (!isAlreadyCapitalized) {
          const oldText = chunk.translated;
          chunk.translated = chunk.translated.charAt(0).toUpperCase() + chunk.translated.slice(1);
          
          this.log(DEBUG_LEVELS.DEBUG, `📝 Capitalized: "${oldText}" → "${chunk.translated}" (started by: "${chunk.startedBy}")`);
        }
      }
    }
  }

  /**
   * Apply smart capitalization to batch chunks with cross-chunk context for opening quotes (LEGACY)
   * @param {TextChunk[]} batchChunks - Current batch chunks to process
   * @param {TextChunk[]} allChunks - All chunks for context lookup
   * @param {number} batchStartIndex - Starting index of batch in all chunks
   */
  applyBatchCapitalization(batchChunks, allChunks, batchStartIndex) {
    if (!batchChunks || batchChunks.length === 0) return;
    
    this.log(DEBUG_LEVELS.DEBUG, `📝 Batch capitalization: Processing ${batchChunks.length} chunks starting at index ${batchStartIndex}`);

    // Define capitalization rules (same as existing logic)
    const capitalizationRules = {
      'start': true,           // Beginning of text
      'linebreak': true,       // After line breaks (new paragraph)
      '.': true,              // After period
      '!': true,              // After exclamation
      '?': true,              // After question mark
      '。': true,             // Chinese period
      '．': true,             // Chinese middle dot (also used as period)
      '！': true,             // Chinese exclamation
      '？': true,             // Chinese question mark
      ':': true,              // After colon
      '：': true,             // Chinese colon
      ',': false,             // After comma - NO capitalization
      '，': false,            // Chinese comma - NO capitalization
      ';': false,             // After semicolon - NO capitalization
      '；': false,            // Chinese semicolon - NO capitalization
      '[': false,             // After opening bracket - NO capitalization
      ']': false,             // After closing bracket - NO capitalization
      '(': false,             // After opening parenthesis - NO capitalization
      ')': false,             // After closing parenthesis - NO capitalization
      '…': true,              // After ellipsis - YES capitalization
      '……': true,            // After Chinese double ellipsis - YES capitalization  
      '"': false,             // After straight quote - NO capitalization
      '\u201c': false,        // After curly opening quote - NO capitalization
      '\u201d': false,        // After curly closing quote - NO capitalization
      '\u2018': false,        // After curly opening apostrophe - NO capitalization
      '\u2019': false,        // After curly closing apostrophe - NO capitalization
      '\'': false,            // After straight apostrophe - NO capitalization
      '': false,              // After no punctuation - NO capitalization
    };

    // Process each chunk in the batch
    for (let i = 0; i < batchChunks.length; i++) {
      const chunk = batchChunks[i];
      if (!chunk.translated) continue;
      
      this.log(DEBUG_LEVELS.DEBUG, `📝 Processing chunk ${i}: "${chunk.translated}" (started by: "${chunk.startedBy}")`);
      
      // Check for advanced capitalization rules
      let shouldCapitalize = capitalizationRules[chunk.startedBy];
      
      // Handle multi-character punctuation sequences (same logic as existing)
      if (!shouldCapitalize && chunk.startedBy) {
        const sentenceEnders = ['.', '!', '?', '。', '．', '！', '？'];
        const colonMarks = [':', '：'];
        const ellipsisMarks = ['…', '……'];
        
        const hasSentenceEnder = sentenceEnders.some(punct => chunk.startedBy.includes(punct));
        const hasColon = colonMarks.some(punct => chunk.startedBy.includes(punct));
        const hasEllipsis = ellipsisMarks.some(punct => chunk.startedBy.includes(punct));
        
        if (hasSentenceEnder || hasColon || hasEllipsis) {
          shouldCapitalize = true;
        }
      }
      
      // Special handling for opening quotes (needs cross-chunk context)
      if (!shouldCapitalize && chunk.startedBy) {
        const isOpeningQuote = QuoteProcessor.isOpeningQuote(chunk.startedBy);
        
        if (isOpeningQuote) {
          // Calculate absolute chunk index in all chunks
          const absoluteChunkIndex = batchStartIndex + i;
          const previousChunk = absoluteChunkIndex > 0 ? allChunks[absoluteChunkIndex - 1] : null;
          
          // Simplified sentence start detection (matching applySmartCapitalization logic)
          const isAtSentenceStart = !previousChunk || 
                                   previousChunk.lineBreaks || 
                                   chunk.startedBy === 'start' ||
                                   (previousChunk && !previousChunk.content.trim());
          
          if (isAtSentenceStart) {
            shouldCapitalize = true;
            this.log(DEBUG_LEVELS.VERBOSE, `📝 Opening quote at sentence start: "${chunk.startedBy}" triggers capitalization`);
          }
        }
      }
      
      // Apply capitalization if needed (same logic as existing)
      if (shouldCapitalize) {
        const isAlreadyCapitalized = chunk.translated.charAt(0) === chunk.translated.charAt(0).toUpperCase();
        
        if (!isAlreadyCapitalized) {
          const oldText = chunk.translated;
          chunk.translated = chunk.translated.charAt(0).toUpperCase() + chunk.translated.slice(1);
          
          this.log(DEBUG_LEVELS.DEBUG, `📝 Capitalized: "${oldText}" → "${chunk.translated}" (started by: "${chunk.startedBy}")`);
        }
      }
    }
  }

  /**
   * PHASE 2: Process batch with progressive position tracking and segment building
   * @param {TextChunk[]} currentBatch - Current batch of chunks
   * @param {TextChunk[]} allChunks - All chunks for text reconstruction
   * @param {number} batchStartIndex - Starting index of batch
   */
  async processBatchWithProgressivePositioning(currentBatch, _allChunks, _batchStartIndex) {
    try {
      // Step 1: Reconstruct just the current batch text
      const batchText = this.textChunker.reconstructText(currentBatch);
      const cleanedBatchText = this.applyFinalCleanup(batchText);
    
    // Step 2: Get semantic arrays for current batch from the builder
    const batchSemanticArrays = this.getBatchSemanticArrays(currentBatch);
    
    // Step 3: Build clickable segments for this batch with progressive positioning
    const batchSegments = this.buildProgressiveClickableSegments(
      batchSemanticArrays,
      cleanedBatchText,
      this.progressivePositionTracker.runningTextPosition
    );
    
    // Step 4: Update progressive tracker  
    this.progressivePositionTracker.finalText += cleanedBatchText;
    this.progressivePositionTracker.runningTextPosition += cleanedBatchText.length;
    this.progressivePositionTracker.clickableSegments.push(...batchSegments);
    
    // BUGFIX: Don't accumulate duplicate semantic arrays - use the builder's current state
    // The semanticArrayBuilder already accumulates properly, we don't need to duplicate here
    // this.progressivePositionTracker.totalOriginalSegments.push(...batchSemanticArrays.original);
    // this.progressivePositionTracker.totalTranslatedSegments.push(...batchSemanticArrays.translated);
    
      return {
        cleanedBatchText: cleanedBatchText,
        batchText: cleanedBatchText,
        batchSegments: batchSegments,
        cumulativeText: this.progressivePositionTracker.finalText,
        cumulativeSegments: this.progressivePositionTracker.clickableSegments
      };
    } catch (error) {
      // PHASE 4: Progressive error handling - graceful degradation
      this.log(DEBUG_LEVELS.ERROR, `❌ Progressive batch processing failed: ${error.message}`);
      console.error('Progressive positioning error:', error);
      
      // Fallback: Return basic batch info without progressive segments
      const fallbackText = this.textChunker.reconstructText(currentBatch);
      const cleanedFallbackText = this.applyFinalCleanup(fallbackText);
      
      // Still update position tracker to maintain text continuity
      this.progressivePositionTracker.finalText += cleanedFallbackText;
      this.progressivePositionTracker.runningTextPosition += cleanedFallbackText.length;
      
      return {
        batchText: cleanedFallbackText,
        batchSegments: [], // No segments on error, but text continues
        cumulativeText: this.progressivePositionTracker.finalText,
        cumulativeSegments: this.progressivePositionTracker.clickableSegments,
        hasError: true
      };
    }
  }

  /**
   * Get semantic arrays specific to current batch
   * @param {TextChunk[]} batchChunks - Current batch chunks
   * @returns {Object} Batch-specific semantic arrays
   */
  getBatchSemanticArrays(_batchChunks) {
    // Get current semantic arrays from builder
    const allSemanticArrays = this.semanticArrayBuilder.getArrays();
    
    // BUGFIX: Ensure metadata array has proper objects, not empty array
    const originalCount = allSemanticArrays.original ? allSemanticArrays.original.length : 0;
    const metadataArray = allSemanticArrays.metadata || [];
    
    // Fill missing metadata with default objects to prevent SegmentPrecomputer errors
    const completeMetadata = [];
    for (let i = 0; i < originalCount; i++) {
      completeMetadata[i] = metadataArray[i] || {
        source: 'progressive',
        phase: 'unknown',
        dictionary: 'unknown'
      };
    }
    
    // For now, return all arrays (this could be optimized to track batch-specific arrays)
    // TODO: Track which semantic array entries belong to which batch for better isolation
    return {
      original: allSemanticArrays.original || [],
      translated: allSemanticArrays.translated || [],
      metadata: completeMetadata
    };
  }

  /**
   * Build clickable segments progressively for current batch
   * @param {Object} batchSemanticArrays - Semantic arrays for batch
   * @param {string} batchText - Cleaned text for current batch
   * @param {number} runningOffset - Running character position offset
   * @returns {Array} Clickable segments for this batch
   */
  buildProgressiveClickableSegments(batchSemanticArrays, batchText, runningOffset) {
    const segments = [];

    if (!batchSemanticArrays.original || batchSemanticArrays.original.length === 0) {
      return segments;
    }

    // Create candidate words from batch semantic arrays
    const candidateWords = [];
    for (let i = 0; i < batchSemanticArrays.original.length; i++) {
      candidateWords.push({
        semanticIndex: i,
        original: batchSemanticArrays.original[i],
        translated: batchSemanticArrays.translated[i]
      });
    }

    // Find word positions in batch text and create segments with global positioning
    // OPTIMIZATION: Use sorted array instead of Set for O(log n) overlap detection
    const usedPositions = []; // Sorted by start position

    // Pre-lowercase batch text once (was being done N times in loop)
    const lowerBatchText = batchText.toLowerCase();

    for (const candidate of candidateWords) {
      if (!candidate.translated || candidate.translated.trim() === '') continue;

      const lowerCandidate = candidate.translated.toLowerCase();
      let position = -1;
      let searchStart = 0;

      // Find non-overlapping position
      do {
        position = lowerBatchText.indexOf(lowerCandidate, searchStart);
        if (position >= 0) {
          const candidateEnd = position + candidate.translated.length;

          // OPTIMIZATION: Binary search for overlap detection (O(log n) vs O(n))
          const overlaps = this._checkOverlapBinarySearch(usedPositions, position, candidateEnd);

          if (!overlaps) {
            // Create segment with global position (batch position + running offset)
            segments.push({
              semanticIndex: candidate.semanticIndex,
              originalText: candidate.original,
              translatedText: candidate.translated,
              localStart: position,
              localEnd: candidateEnd,
              globalStart: runningOffset + position,
              globalEnd: runningOffset + candidateEnd,
              isClickable: true
            });

            // Insert position in sorted order (maintain sorted array for binary search)
            this._insertSorted(usedPositions, { start: position, end: candidateEnd });

            break;
          } else {
            searchStart = position + 1;
          }
        }
      } while (position >= 0);
    }

    return segments;
  }

  /**
   * Check if a position range overlaps with any used positions using binary search
   * @param {Array} sortedPositions - Array of {start, end} objects sorted by start
   * @param {number} start - Start position to check
   * @param {number} end - End position to check
   * @returns {boolean} True if overlaps with any used position
   */
  _checkOverlapBinarySearch(sortedPositions, start, end) {
    if (sortedPositions.length === 0) return false;

    // Binary search for positions that could overlap
    let left = 0;
    let right = sortedPositions.length - 1;

    // Find the rightmost position where pos.start <= end
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const pos = sortedPositions[mid];

      // Check if this position overlaps
      if (start < pos.end && end > pos.start) {
        return true; // Overlap found
      }

      if (pos.start < start) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Check adjacent positions for overlap
    if (left < sortedPositions.length) {
      const pos = sortedPositions[left];
      if (start < pos.end && end > pos.start) return true;
    }
    if (left > 0) {
      const pos = sortedPositions[left - 1];
      if (start < pos.end && end > pos.start) return true;
    }

    return false;
  }

  /**
   * Insert a position into sorted array maintaining sort order
   * @param {Array} sortedPositions - Array sorted by start position
   * @param {Object} position - Position object {start, end}
   */
  _insertSorted(sortedPositions, position) {
    // Binary search to find insertion point
    let left = 0;
    let right = sortedPositions.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (sortedPositions[mid].start < position.start) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    sortedPositions.splice(left, 0, position);
  }

  /**
   * Get concatenated text from tokens for phrase matching
   * @param {Token[]} tokens - Array of tokens
   * @returns {string} Concatenated text
   */
  getTextFromTokens(tokens) {
    return tokens
      .filter(token => token.groupLeader === null || token.groupLeader === undefined) // Skip tokens that are part of another token group
      .map(token => token.value)
      .join('');
  }

  /**
   * Get text position for a specific token index for dictionary matching
   * @param {Token[]} tokens - Array of tokens  
   * @param {number} tokenIndex - Index of the token
   * @returns {number} Character position in the full text
   */
  getTextPositionForTokenIndex(tokens, tokenIndex) {
    // Use cached position from tokenizer instead of recalculating
    if (tokenIndex >= 0 && tokenIndex < tokens.length && tokens[tokenIndex].start !== undefined) {
      return tokens[tokenIndex].start;
    }
    
    // Fallback to calculation for edge cases (should rarely be needed)
    let position = 0;
    for (let i = 0; i < tokenIndex && i < tokens.length; i++) {
      position += tokens[i].value.length;
    }
    return position;
  }

  /**
   * Fix number + 两 (tael unit) translations
   * Converts "lưỡng" to "lượng" when 两 follows a converted number
   * @param {Token[]} tokens - Array of tokens
   */
  fixNumberPlusLiangTranslations(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const currentToken = tokens[i];
      
      // Check if current token is a converted number
      if (currentToken.translated && /^\d+(?:,\d{3})*$/.test(currentToken.translated)) {
        // Find the next non-consumed token after this number
        for (let j = i + 1; j < tokens.length; j++) {
          const nextToken = tokens[j];
          
          // Skip consumed tokens (from number conversion)
          if (nextToken.translationSource === 'number_conversion_consumed') {
            continue;
          }
          
          // Check if this next token is "两" translated as "lưỡng"
          if (nextToken.value === '两' && nextToken.translated === 'lưỡng') {
            this.log(DEBUG_LEVELS.DEBUG, `🔧 Converting 两 unit: "${currentToken.translated} lưỡng" -> "${currentToken.translated} lượng"`);
            
            // Update the translation from "lưỡng" to "lượng" for tael unit
            nextToken.translated = 'lượng';
            nextToken.translationSource = 'number_plus_liang_fix';
          }
          
          // Only check the first non-consumed token after the number
          break;
        }
      }
    }
  }

  /**
   * Check if engine is ready for translation
   * @returns {boolean} Ready state
   */
  isReady() {
    return this.isInitialized && this.dictionaryManager.isReady();
  }

  /**
   * Get translation caching statistics
   * @returns {Object} Cache performance statistics
   */
  getCacheStats() {
    return this.dictionaryManager.getCacheStats();
  }

  /**
   * Get cache memory usage information
   * @returns {Object} Cache memory usage statistics
   */
  getCacheMemoryUsage() {
    return this.dictionaryManager.getCacheMemoryUsage();
  }

  /**
   * Phase 4: Get lazy loading statistics
   * @returns {Object} Lazy loading statistics
   */
  getLazyLoadingStats() {
    return this.dictionaryManager.getLazyLoadingStats();
  }

  /**
   * Enable or disable translation caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setCacheEnabled(enabled) {
    this.dictionaryManager.setCacheEnabled(enabled);
  }

  /**
   * Clear all translation caches
   */
  clearCache() {
    this.dictionaryManager.clearCache();
  }

  /**
   * Get prebuilt segments for instant clickable highlighting
   * @returns {Array} Array of prebuilt segments with positions and metadata
   */
  /**
   * Build segments directly from semantic arrays by finding text positions
   * @param {string} finalText - The complete translated text
   * @param {Object} semanticArrays - Semantic arrays with original, translated, metadata
   * @returns {Array} Array of positioned segments for clickable highlighting
   */
  buildSegmentsFromSemanticArrays(finalText, semanticArrays) {
    // Debug logging disabled for performance
    // console.log(`🔍 Building segments from final text: "${finalText}"`);
    // console.log(`🔍 Semantic arrays contain ${semanticArrays.original.length} entries`);
    
    const segments = [];
    let searchStartPosition = 0;

    for (let i = 0; i < semanticArrays.original.length; i++) {
      const originalText = semanticArrays.original[i];
      const translatedText = semanticArrays.translated[i];
      const metadata = semanticArrays.metadata[i];

      if (!translatedText || translatedText.trim() === '') {
        if (process.env.NODE_ENV === 'development' && i % 50 === 0) {
          console.log(`⚠️ Skipping empty translation at index ${i}`);
        }
        continue;
      }

      // Find the position of this translated text in the final text
      const position = finalText.indexOf(translatedText, searchStartPosition);
      
      if (position >= 0) {
        segments.push({
          type: 'semantic',
          unitIndex: i,
          start: position,
          end: position + translatedText.length,
          originalText: originalText,
          translatedText: translatedText,
          source: metadata?.source || 'unknown',
          metadata: metadata,
          isClickable: true,
          text: translatedText // For component compatibility
        });

        // Update search start position to avoid duplicate matches
        searchStartPosition = position + translatedText.length;
        if (process.env.NODE_ENV === 'development' && i % 50 === 0) {
          console.log(`✅ Found "${translatedText}" at position ${position}-${position + translatedText.length}`);
        }
      } else {
        console.warn(`⚠️ Could not find "${translatedText}" (original: "${originalText}") in final text starting from position ${searchStartPosition}`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Final text from position ${searchStartPosition}: "${finalText.substring(searchStartPosition, searchStartPosition + 50)}..."`);
        }
      }
    }

    return segments;
  }

  /**
   * Enhance chunk-based segments to word-level by finding word positions within chunks
   * @param {Array} chunkSegments - Working chunk-based segments (with proper formatting)
   * @param {string} finalText - Final formatted text
   * @param {Object} semanticArrays - Semantic arrays with word-level entries  
   * @returns {Array} Word-level segments with correct positions
   */
  enhanceSegmentsToWordLevel(chunkSegments, finalText, semanticArrays) {
    const wordLevelSegments = [];
    
    console.log(`🔧 Enhancing ${chunkSegments.length} chunk segments to word-level using ${semanticArrays.original.length} semantic entries`);
    
    // Process only the clickable (semantic) chunk segments
    const semanticChunkSegments = chunkSegments.filter(seg => seg.type === 'semantic' && seg.isClickable);
    
    if (semanticChunkSegments.length === 0) {
      console.log('⚠️ No semantic chunk segments to enhance');
      return chunkSegments; // Return original if no semantic segments
    }
    
    // Map semantic array entries to word-level segments within the existing chunks
    let semanticIndex = 0;
    let searchPosition = 0;
    
    for (let chunkIndex = 0; chunkIndex < semanticChunkSegments.length; chunkIndex++) {
      const _chunkSegment = semanticChunkSegments[chunkIndex];
      
      // Determine how many semantic entries belong to this chunk
      const entriesPerChunk = Math.ceil(semanticArrays.original.length / semanticChunkSegments.length);
      const endSemanticIndex = Math.min(semanticIndex + entriesPerChunk, semanticArrays.original.length);
      
      console.log(`📦 Chunk ${chunkIndex}: Processing semantic entries ${semanticIndex} to ${endSemanticIndex - 1}`);
      
      // Find words from this chunk's semantic entries in the final text
      for (let i = semanticIndex; i < endSemanticIndex; i++) {
        const originalText = semanticArrays.original[i];
        const translatedText = semanticArrays.translated[i];
        const metadata = semanticArrays.metadata[i];
        
        if (!translatedText || translatedText.trim() === '') {
          continue;
        }
        
        // Find this word in the final text starting from current search position
        const position = finalText.indexOf(translatedText, searchPosition);
        
        if (position >= 0) {
          wordLevelSegments.push({
            type: 'semantic',
            unitIndex: i,
            start: position,
            end: position + translatedText.length,
            originalText: originalText,
            translatedText: translatedText,
            source: metadata?.source || 'unknown',
            metadata: metadata,
            isClickable: true,
            text: translatedText
          });
          
          searchPosition = position + translatedText.length;
          if (process.env.NODE_ENV === 'development' && i % 50 === 0) {
            console.log(`✅ Found "${originalText}" → "${translatedText}" at position ${position}-${position + translatedText.length}`);
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`⚠️ Could not find "${translatedText}" (${originalText}) in final text from position ${searchPosition}`);
          }
        }
      }
      
      semanticIndex = endSemanticIndex;
    }
    
    // Also include non-clickable segments (punctuation, line breaks)
    const nonClickableSegments = chunkSegments.filter(seg => !seg.isClickable);
    const allSegments = [...wordLevelSegments, ...nonClickableSegments];
    
    // Sort by position to maintain proper order
    allSegments.sort((a, b) => a.start - b.start);
    
    console.log(`🎯 Enhanced to ${wordLevelSegments.length} word-level + ${nonClickableSegments.length} non-clickable = ${allSegments.length} total segments`);
    return allSegments;
  }

  /**
   * Assign semantic indices to chunks by mapping them to semantic array entries
   * @param {Array} chunks - Array of translated chunks
   * @param {Object} semanticArrays - Semantic arrays with word-level entries
   */
  assignSemanticIndicesToChunks(chunks, semanticArrays) {
    console.log(`🔗 Assigning semantic indices: ${chunks.length} chunks → ${semanticArrays.original.length} semantic entries`);
    
    // Find translated chunks
    const translatedChunks = chunks.filter(chunk => chunk.translated && chunk.content.trim());
    
    if (translatedChunks.length === 0) {
      console.log('⚠️ No translated chunks found');
      return;
    }
    
    // For simplicity, distribute semantic entries evenly across chunks
    // This gives us chunk-level clickability which is reliable
    const entriesPerChunk = Math.floor(semanticArrays.original.length / translatedChunks.length);
    let currentSemanticIndex = 0;
    
    for (let i = 0; i < translatedChunks.length; i++) {
      const chunk = translatedChunks[i];
      
      // Assign the first available semantic index to this chunk
      if (currentSemanticIndex < semanticArrays.original.length) {
        chunk.semanticIndex = currentSemanticIndex;
        console.log(`📋 Chunk ${i}: "${chunk.content}" → semantic index ${currentSemanticIndex}`);
        
        // Advance by entries per chunk, or remainder for last chunk
        if (i === translatedChunks.length - 1) {
          // Last chunk gets any remaining entries
          currentSemanticIndex = semanticArrays.original.length;
        } else {
          currentSemanticIndex += Math.max(1, entriesPerChunk);
        }
      }
    }
    
    console.log(`✅ Assigned semantic indices to ${translatedChunks.length} chunks`);
  }

  /**
   * Build simple word-level segments by finding each semantic array entry in final text
   * OPTIMIZED: Uses incremental position tracking instead of repeated indexOf for O(n) complexity
   * @param {string} finalText - Final cleaned text
   * @param {Object} semanticArrays - Semantic arrays with word entries
   * @returns {Array} Simple word-level segments
   */
  buildSimpleWordLevelSegments(finalText, semanticArrays) {
    const segments = [];
    let searchPosition = 0;

    // Performance optimization: Pre-build position map for faster lookups
    const positionCache = new Map();
    const semanticUnitsCount = semanticArrays.original.length;

    // For very large texts, use optimized position tracking
    const useOptimizedSearch = finalText.length > 2000 && semanticUnitsCount > 100;

    // Performance tracking
    const startTime = performance.now();
    const operationMetrics = {
      textLength: finalText.length,
      semanticUnits: semanticUnitsCount,
      optimizedSearch: useOptimizedSearch,
      cacheHits: 0,
      cacheMisses: 0
    };

    if (useOptimizedSearch) {
      console.log(`🚀 Using optimized position tracking for ${semanticUnitsCount} units in ${finalText.length} chars`);
    }

    for (let i = 0; i < semanticUnitsCount; i++) {
      const originalText = semanticArrays.original[i];
      const translatedText = semanticArrays.translated[i];
      const metadata = semanticArrays.metadata[i];

      if (!translatedText || translatedText.trim() === '') {
        if (process.env.NODE_ENV === 'development' && i % 50 === 0) {
          console.log(`⏭️ Skipping empty translation at ${i}`);
        }
        continue;
      }

      let position = -1;

      if (useOptimizedSearch) {
        // OPTIMIZED: Use smarter position tracking for large texts
        const result = this.findPositionOptimized(finalText, translatedText, searchPosition, positionCache);
        position = result.position;
        if (result.cacheHit) operationMetrics.cacheHits++;
        else operationMetrics.cacheMisses++;
      } else {
        // STANDARD: Use indexOf for smaller texts (already fast enough)
        position = finalText.indexOf(translatedText, searchPosition);
      }

      if (position >= 0) {
        segments.push({
          type: 'semantic',
          unitIndex: i,
          start: position,
          end: position + translatedText.length,
          originalText: originalText,
          translatedText: translatedText,
          source: metadata?.source || 'unknown',
          metadata: metadata,
          isClickable: true,
          text: translatedText
        });

        searchPosition = position + translatedText.length;
        if (process.env.NODE_ENV === 'development' && i % 50 === 0) {
          console.log(`✅ Found at position ${position}-${position + translatedText.length}`);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`❌ Not found: "${translatedText}" from position ${searchPosition}`);
        }
      }
    }

    // Performance logging
    const endTime = performance.now();
    const duration = endTime - startTime;
    operationMetrics.duration = duration;

    if (useOptimizedSearch) {
      console.log(`🎯 Built ${segments.length} of ${semanticUnitsCount} segments (optimized in ${duration.toFixed(1)}ms)`);
      console.log(`📊 Cache efficiency: ${operationMetrics.cacheHits} hits, ${operationMetrics.cacheMisses} misses (${((operationMetrics.cacheHits / (operationMetrics.cacheHits + operationMetrics.cacheMisses)) * 100).toFixed(1)}% hit rate)`);

      // Report to performance monitoring system
      systemPerformanceMonitor.recordOperation('position_mapping_optimized', duration, {
        textLength: operationMetrics.textLength,
        semanticUnits: operationMetrics.semanticUnits,
        cacheHitRate: operationMetrics.cacheHits / (operationMetrics.cacheHits + operationMetrics.cacheMisses),
        segmentsBuilt: segments.length
      });
    } else {
      console.log(`🎯 Built ${segments.length} of ${semanticUnitsCount} segments (standard in ${duration.toFixed(1)}ms)`);

      // Report to performance monitoring system
      systemPerformanceMonitor.recordOperation('position_mapping_standard', duration, {
        textLength: operationMetrics.textLength,
        semanticUnits: operationMetrics.semanticUnits,
        segmentsBuilt: segments.length
      });
    }

    return segments;
  }

  /**
   * Optimized position finding for large texts with many semantic units
   * Uses sliding window and character-based tracking to avoid repeated full string scans
   * @param {string} text - Text to search in
   * @param {string} target - Text to find
   * @param {number} startPos - Starting position
   * @param {Map} cache - Position cache for repeated lookups
   * @returns {Object} {position: number, cacheHit: boolean}
   */
  findPositionOptimized(text, target, startPos, cache) {
    // Cache key based on target and approximate position
    const cacheKey = `${target}:${Math.floor(startPos / 100) * 100}`;

    if (cache.has(cacheKey)) {
      const cachedPos = cache.get(cacheKey);
      if (cachedPos >= startPos) {
        return { position: cachedPos, cacheHit: true };
      }
    }

    // Use indexOf but limit search scope for better performance on very large texts
    const searchWindow = 1000; // Reasonable window size
    const endPos = Math.min(startPos + searchWindow, text.length);
    const windowText = text.substring(startPos, endPos);

    const relativePos = windowText.indexOf(target);

    if (relativePos >= 0) {
      const absolutePos = startPos + relativePos;
      cache.set(cacheKey, absolutePos);
      return { position: absolutePos, cacheHit: false };
    }

    // If not found in window, fall back to full indexOf (rare case)
    const fullPos = text.indexOf(target, startPos);
    if (fullPos >= 0) {
      cache.set(cacheKey, fullPos);
    }

    return { position: fullPos, cacheHit: false };
  }

  getPrebuiltSegments() {
    return this.prebuiltSegments || [];
  }

  /**
   * Analyze text complexity to determine optimal batch sizing
   * @param {string} text - Input text
   * @param {Array} chunks - Text chunks
   * @returns {Object} Complexity analysis result
   */
  analyzeTextComplexity(text, chunks) {
    const analysis = {
      score: 0,
      factors: {},
      characteristics: []
    };

    // Factor 1: Average chunk length (longer chunks = more complex)
    const avgChunkLength = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length;
    analysis.factors.chunkLength = Math.min(avgChunkLength / 100, 2.0); // Normalize to 0-2.0

    // Factor 2: Dictionary density (more proper nouns/phrases = more complex)
    const dictionaryDensity = this.estimateDictionaryDensity(text);
    analysis.factors.dictionaryDensity = dictionaryDensity;

    // Factor 3: Character variety (more unique characters = more complex)
    const uniqueChars = new Set(text.replace(/\s+/g, '')).size;
    analysis.factors.characterVariety = Math.min(uniqueChars / 500, 1.5); // Normalize to 0-1.5

    // Factor 4: Punctuation complexity (more punctuation types = more complex)
    const punctuationTypes = (text.match(/[，。！？：；""''（）【】《》]/g) || []).length;
    analysis.factors.punctuation = Math.min(punctuationTypes / text.length * 100, 1.0);

    // Combine factors into overall score (0.5 = simple, 1.0 = average, 2.0 = complex)
    analysis.score = (
      analysis.factors.chunkLength * 0.3 +
      analysis.factors.dictionaryDensity * 0.4 +
      analysis.factors.characterVariety * 0.2 +
      analysis.factors.punctuation * 0.1
    ) + 0.5; // Base score of 0.5

    // Determine characteristics for logging
    if (analysis.score < 0.8) analysis.characteristics.push('simple');
    if (analysis.score > 1.5) analysis.characteristics.push('complex');
    if (analysis.factors.dictionaryDensity > 0.8) analysis.characteristics.push('dictionary-heavy');
    if (avgChunkLength > 200) analysis.characteristics.push('long-chunks');

    return analysis;
  }

  /**
   * Estimate dictionary density in text (proper nouns, phrases)
   * @param {string} text - Input text  
   * @returns {number} Density score (0.0 to 1.0+)
   */
  estimateDictionaryDensity(text) {
    // Simple heuristic: count potential dictionary matches
    let dictionaryHits = 0;
    const sampleSize = Math.min(text.length, 500); // Sample first 500 characters
    const sample = text.substring(0, sampleSize);
    
    // Count potential proper nouns (sequences of 2-4 characters)
    const properNounPattern = /[一-龯]{2,4}/g;
    const properNounMatches = sample.match(properNounPattern) || [];
    dictionaryHits += properNounMatches.length * 0.3; // Weight proper nouns

    // Count potential phrases (sequences of 3-6 characters)  
    const phrasePattern = /[一-龯]{3,6}/g;
    const phraseMatches = sample.match(phrasePattern) || [];
    dictionaryHits += phraseMatches.length * 0.5; // Weight phrases higher

    // Normalize by sample length
    return Math.min(dictionaryHits / (sampleSize / 50), 1.5); // Max 1.5 for very dense text
  }

  /**
   * Calculate complexity multiplier for batch sizing
   * @param {Object} complexity - Complexity analysis result
   * @returns {number} Multiplier (0.5 to 1.5)
   */
  getComplexityMultiplier(complexity) {
    // Simple text gets larger batches (faster processing)
    // Complex text gets smaller batches (more careful processing)
    if (complexity.score < 0.8) {
      return 1.3; // 30% larger batches for simple text
    } else if (complexity.score > 1.5) {
      return 0.7; // 30% smaller batches for complex text
    } else {
      return 1.0; // Standard batch sizes for average complexity
    }
  }

  /**
   * Get WASM manager for performance monitoring
   */
  get wasmManager() {
    return this.dictionaryManager.wasmManager;
  }

  /**
   * Get WASM performance metrics
   */
  getWasmPerformanceReport() {
    return this.dictionaryManager.getPerformanceReport();
  }

  /**
   * Get Phase 6 Core Translation Engine (Rust)
   */
  get coreEngine() {
    // WASM Core Engine removed
    return null;
  }

  /**
   * Get Phase 6 Core Engine performance statistics
   */
  getCoreEngineStats() {
    // WASM Core Engine removed
    return null;
  }

  /**
   * Check if Phase 6 Core Engine is ready for translation
   */
  isCoreEngineReady() {
    // WASM Core Engine removed
    return false;
  }

  /**
   * Get performance bottleneck analysis from PerformanceLogger
   * @returns {Object} Performance analysis with bottlenecks and recommendations
   */
  getPerformanceAnalysis() {
    const analysis = performanceLogger.getPerformanceAnalysis();
    const bottlenecks = performanceLogger.getBottlenecks(10); // Last 10 bottlenecks
    
    return {
      ...analysis,
      bottlenecks,
      recommendations: this.generatePerformanceRecommendations(analysis, bottlenecks)
    };
  }

  /**
   * Generate performance recommendations based on bottleneck analysis
   * @param {Object} analysis - Performance analysis data
   * @param {Array} bottlenecks - Recent bottlenecks
   * @returns {Array} Performance recommendations
   */
  generatePerformanceRecommendations(analysis, bottlenecks) {
    const recommendations = [];

    if (analysis.recentBottlenecks > 5) {
      recommendations.push({
        priority: 'high',
        issue: 'Frequent slow operations detected',
        recommendation: 'Consider reducing batch size or enabling parallel processing',
        count: analysis.recentBottlenecks
      });
    }

    // Analyze operation types
    if (analysis.operationBreakdown) {
      analysis.operationBreakdown.forEach(op => {
        if (op.operation === 'translateWithSegments' && op.averageDuration > 500) {
          recommendations.push({
            priority: 'high',
            issue: 'Main translation is consistently slow',
            recommendation: 'Check for large text inputs or dictionary issues',
            averageDuration: op.averageDuration,
            operation: op.operation
          });
        }

        if (op.operation === 'processChunksInParallel' && op.averageDuration > 300) {
          recommendations.push({
            priority: 'medium',
            issue: 'Parallel processing slower than expected',
            recommendation: 'Verify parallel configuration or consider sequential processing',
            averageDuration: op.averageDuration,
            operation: op.operation
          });
        }
      });
    }

    // Check for text length patterns
    const largeTextBottlenecks = bottlenecks.filter(b => b.context?.textLength > 1000);
    if (largeTextBottlenecks.length > 0) {
      recommendations.push({
        priority: 'medium',
        issue: 'Large text inputs causing slowdowns',
        recommendation: 'Consider implementing text chunking for very large inputs',
        affectedOperations: largeTextBottlenecks.length
      });
    }

    return recommendations;
  }

  /**
   * Clear performance monitoring data
   */
  clearPerformanceData() {
    performanceLogger.clearBottlenecks();
    performanceLogger.clear();
    batchLog.info('🗑️ Performance monitoring data cleared');
  }
}

// Factory function
export const createTranslationEngine = () => new TranslationEngine();
